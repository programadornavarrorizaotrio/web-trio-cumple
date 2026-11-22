-- Wordle del trío (hexágono 10 de /juegos). Lo corrige el SERVIDOR: el navegador nunca ve la palabra hasta
-- que termina la partida y los puntos salen de aquí, no de lo que mande el navegador.
--
-- La palabra del día es la siguiente de `wordle_palabras` (las que añaden los admins, por `orden`): la
-- primera vez que hace falta en un día se le pone `dia`. Si no quedan palabras, el 10 no da juego y los
-- dados vuelven a tirar, como con cualquier juego no disponible.
--
-- Seis intentos. Puntos según en cuál aciertes: 30, 25, 20, 15, 10, 5; si no aciertas, 0. La partida se
-- guarda intento a intento, así que si cierras la ventana a medias la retomas donde ibas.
-- Contrato con el navegador: src/components/juegos/wordle-trio.ts

-- ───────────────────────── Tablas ─────────────────────────

-- Los minijuegos cuyos puntos calcula el servidor no pasan por `registrar_partida`
alter table public.minijuegos add column servidor boolean not null default false;
update public.minijuegos set disponible = true, servidor = true where id = 'wordle-trio';

create table public.wordle_partidas (
	invitado_id uuid not null references public.invitados (id) on delete cascade,
	dia date not null,
	-- Palabras probadas, en orden (ya en mayúsculas y sin tildes)
	intentos text[] not null default '{}',
	terminada boolean not null default false,
	primary key (invitado_id, dia)
);

alter table public.wordle_partidas enable row level security;

-- ───────────────────────── Funciones internas ─────────────────────────

create function privado.wordle_max_intentos() returns integer
language sql immutable
set search_path = ''
as $$ select 6 $$;

-- Puntos por acertar en el intento n (1..6)
create function privado.wordle_puntos(n integer) returns integer
language sql immutable
set search_path = ''
as $$ select greatest(0, 35 - 5 * n) $$;

-- La palabra de ese día. Si aún no tiene, se le asigna la siguiente sin usar. Null si no quedan.
create function privado.wordle_palabra(dia date) returns text
language plpgsql
set search_path = ''
as $$
declare
	p text;
begin
	select w.palabra into p from public.wordle_palabras w where w.dia = wordle_palabra.dia;
	if found then
		return p;
	end if;
	-- Que dos peticiones a la vez no elijan palabras distintas para el mismo día
	perform pg_advisory_xact_lock(hashtext('wordle_palabra'));
	select w.palabra into p from public.wordle_palabras w where w.dia = wordle_palabra.dia;
	if found then
		return p;
	end if;
	update public.wordle_palabras w set dia = wordle_palabra.dia
	where w.id = (select x.id from public.wordle_palabras x where x.dia is null order by x.orden, x.id limit 1)
	returning w.palabra into p;
	return p;
end;
$$;

-- Mayúsculas y sin tildes (la Ñ se queda)
create function privado.wordle_normalizar(texto text) returns text
language sql immutable
set search_path = ''
as $$ select translate(upper(trim(coalesce(texto, ''))), 'ÁÉÍÓÚÜÀÈÌÒÙ', 'AEIOUUAEIOU') $$;

-- Pistas de cada letra: 'ok' (en su sitio), 'casi' (está, pero en otro sitio) o 'no'.
-- Con letras repetidas, cada letra de la palabra solo da una pista (primero las 'ok').
create function privado.wordle_pistas(intento text, palabra text) returns text[]
language plpgsql immutable
set search_path = ''
as $$
declare
	n integer := length(palabra);
	pistas text[] := array_fill('no'::text, array[n]);
	quedan text[] := '{}';
	pos integer;
begin
	for i in 1..n loop
		if substr(intento, i, 1) = substr(palabra, i, 1) then
			pistas[i] := 'ok';
			quedan := array_append(quedan, null::text);
		else
			quedan := array_append(quedan, substr(palabra, i, 1));
		end if;
	end loop;
	for i in 1..n loop
		if pistas[i] <> 'ok' then
			pos := array_position(quedan, substr(intento, i, 1));
			if pos is not null then
				pistas[i] := 'casi';
				quedan[pos] := null;
			end if;
		end if;
	end loop;
	return pistas;
end;
$$;

-- Lo que ve el navegador de una partida. La palabra solo cuando ha terminado.
create function privado.wordle_json(intentos text[], palabra text, terminada boolean) returns jsonb
language sql immutable
set search_path = ''
as $$
	select jsonb_build_object(
		'longitud', length(palabra),
		'maxIntentos', privado.wordle_max_intentos(),
		'intentos', coalesce((select jsonb_agg(jsonb_build_object('palabra', x.p, 'pistas', to_jsonb(privado.wordle_pistas(x.p, palabra))) order by x.n)
			from unnest(intentos) with ordinality as x (p, n)), '[]'::jsonb),
		'terminada', terminada,
		'acertada', palabra = any (intentos),
		'palabra', case when terminada then palabra end
	)
$$;

-- Comprueba que hoy le toca el Wordle y devuelve la palabra. Errores: 'no-asignado', 'sin-palabra'.
create function privado.wordle_de_hoy(j public.liga_jugadores) returns text
language plpgsql
set search_path = ''
as $$
declare
	p text;
begin
	if not exists (select 1 from public.liga_tiradas t
		where t.invitado_id = j.invitado_id and t.dia = privado.hoy() and t.resultado = 'wordle-trio') then
		raise exception 'no-asignado' using errcode = 'P0001';
	end if;
	p := privado.wordle_palabra(privado.hoy());
	if p is null then
		raise exception 'sin-palabra' using errcode = 'P0001';
	end if;
	return p;
end;
$$;

-- ───────────────────────── RPC ─────────────────────────

-- La partida de hoy (vacía si no ha empezado). Errores: 'sesion', 'sin-equipo', 'no-asignado', 'sin-palabra'.
create function public.wordle_estado(clave text) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
	j public.liga_jugadores := privado.jugador(clave);
	palabra text := privado.wordle_de_hoy(j);
	w public.wordle_partidas;
begin
	select * into w from public.wordle_partidas x where x.invitado_id = j.invitado_id and x.dia = privado.hoy();
	return privado.wordle_json(coalesce(w.intentos, '{}'), palabra, coalesce(w.terminada, false));
end;
$$;

-- Prueba una palabra. Al acertar o gastar el último intento apunta los puntos en la liga y devuelve también
-- `puntos`, `rango` y `subeDeRango` (como registrar_partida). Errores: 'sesion', 'sin-equipo', 'no-asignado',
-- 'sin-palabra', 'ya-jugado', 'liga-cerrada', 'longitud' (no tiene las letras de la palabra), 'letras'.
create function public.wordle_probar(clave text, intento text) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
	j public.liga_jugadores := privado.jugador(clave, true);
	hoy date := privado.hoy();
	palabra text;
	probada text := privado.wordle_normalizar(intento);
	w public.wordle_partidas;
	antes public.rangos;
	despues public.rangos;
	valor integer;
	estado jsonb;
begin
	perform privado.exigir_liga_abierta();
	palabra := privado.wordle_de_hoy(j);
	if probada !~ '^[A-ZÑ]+$' then
		raise exception 'letras' using errcode = 'P0001';
	end if;
	if length(probada) <> length(palabra) then
		raise exception 'longitud' using errcode = 'P0001';
	end if;

	insert into public.wordle_partidas (invitado_id, dia) values (j.invitado_id, hoy) on conflict do nothing;
	select * into w from public.wordle_partidas x where x.invitado_id = j.invitado_id and x.dia = hoy for update;
	if w.terminada then
		raise exception 'ya-jugado' using errcode = 'P0001';
	end if;

	w.intentos := w.intentos || probada;
	w.terminada := probada = palabra or cardinality(w.intentos) >= privado.wordle_max_intentos();
	update public.wordle_partidas x set intentos = w.intentos, terminada = w.terminada
	where x.invitado_id = j.invitado_id and x.dia = hoy;

	estado := privado.wordle_json(w.intentos, palabra, w.terminada);
	if not w.terminada then
		return estado;
	end if;

	antes := privado.rango(privado.puntos(j.invitado_id));
	valor := case when probada = palabra then privado.wordle_puntos(cardinality(w.intentos)) else 0 end;
	valor := least(valor, (select m.max_puntos from public.minijuegos m where m.id = 'wordle-trio'));
	insert into public.liga_movimientos (invitado_id, dia, tipo, minijuego, puntos, detalle)
	values (j.invitado_id, hoy, 'partida', 'wordle-trio', valor, jsonb_build_object('intentos', cardinality(w.intentos)));
	despues := privado.rango(privado.puntos(j.invitado_id));

	return estado || jsonb_build_object('puntos', valor, 'rango', privado.rango_json(despues), 'subeDeRango', despues.desde > antes.desde);
end;
$$;

-- ───────────────────────── Cambios en la liga ─────────────────────────

-- Igual que en 20261118200100_liga.sql, pero el Wordle solo sale si hay palabra para hoy
create or replace function public.tirar_dados(clave text) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
	j public.liga_jugadores := privado.jugador(clave, true);
	hoy date := privado.hoy();
	tiradas jsonb := '[]'::jsonb;
	a integer;
	b integer;
	juego text;
	perdidos integer;
	hay_wordle boolean;
begin
	perform privado.exigir_liga_abierta();
	if (select count(*) from public.liga_tiradas t where t.invitado_id = j.invitado_id and t.dia = hoy) >= privado.tiradas_del_dia(hoy) then
		raise exception 'sin-tiradas' using errcode = 'P0001';
	end if;
	hay_wordle := privado.wordle_palabra(hoy) is not null;

	for i in 1..200 loop
		a := 1 + privado.azar(6);
		b := 1 + privado.azar(6);
		tiradas := tiradas || jsonb_build_object('a', a, 'b', b, 'suma', a + b);

		if a + b = 7 then
			perdidos := least(privado.liga_ajuste('penalizacion_diablo')::integer, privado.puntos(j.invitado_id));
			insert into public.liga_tiradas (invitado_id, dia, dados, resultado) values (j.invitado_id, hoy, tiradas, 'diablo');
			if perdidos > 0 then
				insert into public.liga_movimientos (invitado_id, dia, tipo, puntos) values (j.invitado_id, hoy, 'diablo', -perdidos);
			end if;
			return jsonb_build_object('tipo', 'diablo', 'perdidos', perdidos, 'tiradas', tiradas);
		end if;

		select m.id into juego from public.minijuegos m
		where m.numero = a + b and m.disponible and not m.libre
			and (m.id <> 'wordle-trio' or hay_wordle)
			and m.id not in (select t.resultado from public.liga_tiradas t where t.invitado_id = j.invitado_id and t.dia = hoy);
		if juego is not null then
			insert into public.liga_tiradas (invitado_id, dia, dados, resultado) values (j.invitado_id, hoy, tiradas, juego);
			return jsonb_build_object('tipo', 'juego', 'juego', juego, 'tiradas', tiradas);
		end if;
	end loop;
	raise exception 'sin-juegos' using errcode = 'P0001';
end;
$$;

-- Igual que en 20261118200100_liga.sql, pero rechaza los juegos que puntúa el servidor (si no, el navegador
-- podría mandar 30 puntos al Wordle sin jugarlo). Error nuevo: 'lo-puntua-el-servidor'.
create or replace function public.registrar_partida(clave text, minijuego text, puntos integer) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
	j public.liga_jugadores := privado.jugador(clave, true);
	hoy date := privado.hoy();
	juego public.minijuegos;
	antes public.rangos;
	despues public.rangos;
	valor integer;
begin
	perform privado.exigir_liga_abierta();
	select * into juego from public.minijuegos m where m.id = registrar_partida.minijuego and not m.libre;
	if found and juego.servidor then
		raise exception 'lo-puntua-el-servidor' using errcode = 'P0001';
	end if;
	if not found or not exists (select 1 from public.liga_tiradas t
		where t.invitado_id = j.invitado_id and t.dia = hoy and t.resultado = juego.id) then
		raise exception 'no-asignado' using errcode = 'P0001';
	end if;
	if exists (select 1 from public.liga_movimientos m
		where m.invitado_id = j.invitado_id and m.dia = hoy and m.tipo = 'partida' and m.minijuego = juego.id) then
		raise exception 'ya-jugado' using errcode = 'P0001';
	end if;

	antes := privado.rango(privado.puntos(j.invitado_id));
	valor := least(juego.max_puntos, coalesce(puntos, 0));
	-- Lo que se quita no puede pasar de la penalización ni de lo que ya tiene
	if valor < 0 then
		valor := -least(-valor, privado.liga_ajuste('penalizacion_diablo')::integer, privado.puntos(j.invitado_id));
	end if;
	insert into public.liga_movimientos (invitado_id, dia, tipo, minijuego, puntos)
	values (j.invitado_id, hoy, 'partida', juego.id, valor);
	despues := privado.rango(privado.puntos(j.invitado_id));

	return jsonb_build_object('puntos', valor, 'rango', privado.rango_json(despues), 'subeDeRango', despues.desde > antes.desde);
end;
$$;

-- ───────────────────────── Permisos ─────────────────────────

revoke all on table public.wordle_partidas from anon, authenticated;
revoke all on function
	privado.wordle_max_intentos(),
	privado.wordle_puntos(integer),
	privado.wordle_palabra(date),
	privado.wordle_normalizar(text),
	privado.wordle_pistas(text, text),
	privado.wordle_json(text[], text, boolean),
	privado.wordle_de_hoy(public.liga_jugadores)
from public, anon, authenticated;
revoke all on function public.wordle_estado(text), public.wordle_probar(text, text) from public;
grant execute on function public.wordle_estado(text), public.wordle_probar(text, text) to anon, authenticated;
