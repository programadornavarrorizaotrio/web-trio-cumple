-- Liga del Trío (/juegos): equipos, puntos, tirada diaria, casino y premios.
-- Contrato con el navegador: src/components/juegos/liga.ts (cada `TODO(DB)` es una RPC de aquí).
--
-- Cómo se cuentan los puntos: cada cosa que suma o resta es una fila de `liga_movimientos` (partida,
-- diablillo, apuesta de casino o ajuste a mano de un admin). Los puntos de alguien son la suma, y nunca se
-- deja que baje de 0. Las RPC que mueven puntos bloquean la fila del jugador (`for update`) para que dos
-- peticiones a la vez no se salten las comprobaciones.
--
-- Lo que decide el azar (dados, ruleta, cartas) lo calcula el SERVIDOR. Los puntos de los minijuegos de
-- habilidad sí los manda el navegador (no se pueden comprobar aquí), pero con tope por juego, una vez al
-- día y solo si los dados te dieron ese juego.
--
-- Todo lo configurable (minijuegos, rangos, premios, valores de `ajustes`) está en tablas para el admin.

-- ───────────────────────── Catálogo y configuración ─────────────────────────

insert into public.ajustes (clave, valor, descripcion) values
	('liga', jsonb_build_object(
		'tiradas_entre_semana', 1,
		'tiradas_fin_de_semana', 2,
		'penalizacion_diablo', 10,
		'fichas_casino', jsonb_build_array(2, 5, 10),
		'apuesta_maxima_casino', 10
	), 'Sistema de puntos de la liga (ver CONFIG en liga.ts)'),
	-- Al empezar la fiesta se cierra la liga: no se puede jugar más y se decide el podio
	('liga_cierre', to_jsonb('2027-02-27T19:30:00+01:00'::text), 'Cierre de la liga (inicio de la fiesta, fiesta.json)');

create table public.minijuegos (
	id text primary key,
	titulo text not null,
	-- Máximo por partida (0 en el casino, donde se apuestan puntos propios)
	max_puntos integer not null check (max_puntos >= 0),
	-- Ficha del hexágono: si los dados suman esto, toca este juego. Null en los libres (casino).
	numero integer unique check (numero between 2 and 12 and numero <> 7),
	libre boolean not null default false,
	disponible boolean not null default true,
	orden integer not null default 0
);

insert into public.minijuegos (id, titulo, max_puntos, numero, libre, disponible, orden) values
	('memory-cromos', 'Memory de cromos', 30, 8, false, true, 1),
	('golpea-rana', 'Golpea la rana', 30, 6, false, true, 2),
	('ruleta-casino', 'Ruleta de casino', 0, null, true, true, 3),
	('blackjack', 'Blackjack', 0, null, true, true, 4),
	('adivina-cromo', 'Adivina el cromo', 30, 9, false, true, 5),
	('conga-catan', 'La conga de Catan', 30, 5, false, true, 6),
	('wordle-trio', 'Wordle del trío', 30, 10, false, false, 7);

create table public.rangos (
	nombre text primary key,
	desde integer not null unique check (desde >= 0),
	-- Imagen en src/components/juegos/lol/emblema-<emblema>.png
	emblema text not null
);

insert into public.rangos (nombre, desde, emblema) values
	('Hierro', 0, 'iron'),
	('Bronce', 25, 'bronze'),
	('Plata', 60, 'silver'),
	('Oro', 100, 'gold'),
	('Platino', 145, 'platinum'),
	('Esmeralda', 195, 'emerald'),
	('Diamante', 250, 'diamond'),
	('Maestro', 305, 'master'),
	('Gran Maestro', 360, 'grandmaster'),
	('Challenger', 420, 'challenger');

-- requisito: {"tipo":"rango","rango":"Plata"} | {"tipo":"podio","hasta":3} | {"tipo":"equipo"}
create table public.premios (
	id text primary key,
	titulo text not null,
	descripcion text not null default '',
	requisito jsonb not null check (requisito ->> 'tipo' in ('rango', 'podio', 'equipo')),
	orden integer not null default 0,
	activo boolean not null default true
);

insert into public.premios (id, titulo, descripcion, requisito, orden) values
	('rango-plata', 'Rango Plata', 'Premio por anunciar.', '{"tipo":"rango","rango":"Plata"}', 1),
	('rango-oro', 'Rango Oro', 'Premio por anunciar.', '{"tipo":"rango","rango":"Oro"}', 2),
	('podio', 'Podio de la liga', 'Premio por anunciar. Para los 3 primeros al cierre.', '{"tipo":"podio","hasta":3}', 3),
	('campeon', 'Campeón de la liga', 'Premio por anunciar. Para el primero al cierre.', '{"tipo":"podio","hasta":1}', 4),
	('equipo', 'Equipo ganador', 'Premio por anunciar. Para todo el equipo que gane.', '{"tipo":"equipo"}', 5);

-- ───────────────────────── Datos de la liga ─────────────────────────

-- Equipo de cada jugador. Solo se elige una vez (no hay RPC para cambiarlo).
create table public.liga_jugadores (
	invitado_id uuid primary key references public.invitados (id) on delete cascade,
	equipo text not null check (equipo in ('pencho', 'fran', 'juan')),
	elegido_en timestamptz not null default now()
);

-- Cada tirada de dados gastada. `dados` guarda todas las tiradas hasta dar con algo ([{a,b,suma}]);
-- `resultado` es el minijuego que tocó o 'diablo'.
create table public.liga_tiradas (
	id bigint generated always as identity primary key,
	invitado_id uuid not null references public.invitados (id) on delete cascade,
	dia date not null,
	dados jsonb not null,
	resultado text not null,
	created_at timestamptz not null default now()
);
create index liga_tiradas_dia_idx on public.liga_tiradas (invitado_id, dia);

create table public.liga_movimientos (
	id bigint generated always as identity primary key,
	invitado_id uuid not null references public.invitados (id) on delete cascade,
	dia date not null,
	tipo text not null check (tipo in ('partida', 'diablo', 'casino', 'ajuste')),
	minijuego text references public.minijuegos (id),
	puntos integer not null,
	-- Lo que haga falta para revisar: la apuesta, la casilla, la mano, quién hizo el ajuste…
	detalle jsonb,
	created_at timestamptz not null default now(),
	check (tipo not in ('partida', 'casino') or minijuego is not null)
);
create index liga_movimientos_invitado_idx on public.liga_movimientos (invitado_id, dia);
-- Una partida de cada minijuego al día
create unique index liga_partida_unica on public.liga_movimientos (invitado_id, dia, minijuego) where tipo = 'partida';

-- Manos de blackjack: el servidor reparte y guarda la mano para que el navegador solo pueda pedir,
-- plantarse o doblar. Una mano abierta como mucho por jugador.
create table public.casino_manos (
	id uuid primary key default gen_random_uuid(),
	invitado_id uuid not null references public.invitados (id) on delete cascade,
	apuesta integer not null check (apuesta > 0),
	jugador jsonb not null,
	banca jsonb not null,
	doblada boolean not null default false,
	estado text not null default 'en-juego' check (estado in ('en-juego', 'terminada')),
	neto integer,
	created_at timestamptz not null default now(),
	terminada_en timestamptz
);
create unique index casino_mano_abierta on public.casino_manos (invitado_id) where estado = 'en-juego';

-- Código de cada premio conseguido: lo genera el servidor la primera vez que el premio sale conseguido.
-- Para marcarlo como entregado en la fiesta: update premios_codigos set entregado_en = now() where codigo = '…'
create table public.premios_codigos (
	invitado_id uuid not null references public.invitados (id) on delete cascade,
	premio_id text not null references public.premios (id) on delete cascade,
	codigo text not null unique,
	creado_en timestamptz not null default now(),
	entregado_en timestamptz,
	primary key (invitado_id, premio_id)
);

alter table public.minijuegos enable row level security;
alter table public.rangos enable row level security;
alter table public.premios enable row level security;
alter table public.liga_jugadores enable row level security;
alter table public.liga_tiradas enable row level security;
alter table public.liga_movimientos enable row level security;
alter table public.casino_manos enable row level security;
alter table public.premios_codigos enable row level security;

-- ───────────────────────── Funciones internas ─────────────────────────

create function privado.liga_ajuste(nombre text) returns jsonb
language sql stable
set search_path = ''
as $$ select privado.ajuste('liga') -> nombre $$;

create function privado.liga_cerrada() returns boolean
language sql stable
set search_path = ''
as $$ select coalesce(now() >= (privado.ajuste('liga_cierre') #>> '{}')::timestamptz, false) $$;

-- Puntos de un jugador (nunca por debajo de 0)
create function privado.puntos(invitado uuid) returns integer
language sql stable
set search_path = ''
as $$ select greatest(0, coalesce(sum(puntos), 0))::integer from public.liga_movimientos where invitado_id = invitado $$;

create function privado.rango(puntos integer) returns public.rangos
language sql stable
set search_path = ''
as $$ select * from public.rangos where desde <= greatest(puntos, 0) order by desde desc limit 1 $$;

create function privado.rango_json(r public.rangos) returns jsonb
language sql immutable
set search_path = ''
as $$ select case when r.nombre is null then null else jsonb_build_object('nombre', r.nombre, 'desde', r.desde, 'emblema', r.emblema) end $$;

create function privado.tiradas_del_dia(dia date) returns integer
language sql stable
set search_path = ''
as $$
	select (privado.liga_ajuste(
		case when extract(isodow from dia) in (6, 7) then 'tiradas_fin_de_semana' else 'tiradas_entre_semana' end
	))::integer
$$;

-- Entero al azar en [0, n)
create function privado.azar(n integer) returns integer
language sql volatile
set search_path = ''
as $$ select floor(random() * n)::integer $$;

-- Clasificación de todos los jugadores con equipo (puesto 1 = primero; desempata quien eligió antes)
create function privado.clasificacion()
returns table (invitado_id uuid, nombre text, equipo text, puntos integer, puesto integer)
language sql stable
set search_path = ''
as $$
	select j.invitado_id, coalesce(i.apodo, i.nombre), j.equipo, p.puntos,
		(row_number() over (order by p.puntos desc, j.elegido_en))::integer
	from public.liga_jugadores j
	join public.invitados i on i.id = j.invitado_id
	cross join lateral (select privado.puntos(j.invitado_id) as puntos) p
	where i.visible
$$;

create function privado.marcador()
returns table (equipo text, puntos integer, miembros integer)
language sql stable
set search_path = ''
as $$
	select e.equipo, coalesce(sum(c.puntos), 0)::integer, count(c.invitado_id)::integer
	from (values ('pencho'), ('fran'), ('juan')) as e (equipo)
	left join privado.clasificacion() c on c.equipo = e.equipo
	group by e.equipo
	order by 2 desc, 1
$$;

-- El jugador que hace la petición, ya con equipo y su fila bloqueada. Errores: 'sesion', 'sin-equipo'.
create function privado.jugador(clave text, bloquear boolean default false) returns public.liga_jugadores
language plpgsql
set search_path = ''
as $$
declare
	quien uuid := privado.invitado_de_clave(clave);
	j public.liga_jugadores;
begin
	if bloquear then
		select * into j from public.liga_jugadores where invitado_id = quien for update;
	else
		select * into j from public.liga_jugadores where invitado_id = quien;
	end if;
	if not found then
		raise exception 'sin-equipo' using errcode = 'P0001';
	end if;
	return j;
end;
$$;

create function privado.exigir_liga_abierta() returns void
language plpgsql stable
set search_path = ''
as $$
begin
	if privado.liga_cerrada() then
		raise exception 'liga-cerrada' using errcode = 'P0001';
	end if;
end;
$$;

-- ───────────────────────── RPC: equipo, estado y ranking ─────────────────────────

-- Errores: 'sesion', 'equipo-invalido', 'ya-elegido'
create function public.elegir_equipo(clave text, equipo text) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
	quien uuid := privado.invitado_de_clave(clave);
begin
	if equipo not in ('pencho', 'fran', 'juan') then
		raise exception 'equipo-invalido' using errcode = 'P0001';
	end if;
	insert into public.liga_jugadores (invitado_id, equipo) values (quien, elegir_equipo.equipo);
exception
	when unique_violation then
		raise exception 'ya-elegido' using errcode = 'P0001';
end;
$$;

-- EstadoLiga de liga.ts. Sin equipo devuelve equipo null y 0 puntos.
create function public.estado_liga(clave text) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
	quien uuid := privado.invitado_de_clave(clave);
	hoy date := privado.hoy();
	mi_equipo text;
	pts integer;
	r public.rangos;
	sig public.rangos;
begin
	select j.equipo into mi_equipo from public.liga_jugadores j where j.invitado_id = quien;
	pts := privado.puntos(quien);
	r := privado.rango(pts);
	select * into sig from public.rangos where desde > r.desde order by desde limit 1;
	return jsonb_build_object(
		'equipo', mi_equipo,
		'puntos', pts,
		'rango', privado.rango_json(r),
		'siguienteRango', privado.rango_json(sig),
		'jugadosHoy', coalesce((select jsonb_agg(distinct m.minijuego) from public.liga_movimientos m
			where m.invitado_id = quien and m.dia = hoy and m.tipo = 'partida'), '[]'::jsonb),
		'asignadosHoy', coalesce((select jsonb_agg(t.resultado order by t.id) from public.liga_tiradas t
			where t.invitado_id = quien and t.dia = hoy and t.resultado <> 'diablo'), '[]'::jsonb),
		'diablosHoy', (select count(*) from public.liga_tiradas t where t.invitado_id = quien and t.dia = hoy and t.resultado = 'diablo'),
		'tiradasHoy', (select count(*) from public.liga_tiradas t where t.invitado_id = quien and t.dia = hoy),
		'tiradasMax', privado.tiradas_del_dia(hoy),
		'puesto', coalesce((select c.puesto from privado.clasificacion() c where c.invitado_id = quien),
			(select count(*) + 1 from public.liga_jugadores))
	);
end;
$$;

-- FilaRanking[] de liga.ts
create function public.ranking_liga(clave text, limite integer default 20) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
	quien uuid := privado.invitado_de_clave(clave);
begin
	return coalesce((
		select jsonb_agg(jsonb_build_object(
			'id', c.invitado_id, 'nombre', c.nombre, 'equipo', c.equipo, 'puntos', c.puntos,
			'rango', (privado.rango(c.puntos)).nombre, 'yo', c.invitado_id = quien
		) order by c.puesto)
		from privado.clasificacion() c
		where c.puesto <= least(greatest(limite, 1), 100)
	), '[]'::jsonb);
end;
$$;

create function public.marcador_equipos(clave text) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
begin
	perform privado.invitado_de_clave(clave);
	return (select jsonb_agg(jsonb_build_object('equipo', m.equipo, 'puntos', m.puntos, 'miembros', m.miembros)) from privado.marcador() m);
end;
$$;

-- ───────────────────────── RPC: tirada diaria y partidas ─────────────────────────

-- Tira el servidor hasta dar con algo: el 7 es el diablillo (quita la penalización sin bajar de 0) y otro
-- número de un juego disponible que no te haya tocado hoy es tu juego. Si no hay juego para ese número se
-- vuelve a tirar sin gastar la tirada. Errores: 'sesion', 'sin-equipo', 'sin-tiradas', 'liga-cerrada'.
create function public.tirar_dados(clave text) returns jsonb
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
begin
	perform privado.exigir_liga_abierta();
	if (select count(*) from public.liga_tiradas t where t.invitado_id = j.invitado_id and t.dia = hoy) >= privado.tiradas_del_dia(hoy) then
		raise exception 'sin-tiradas' using errcode = 'P0001';
	end if;

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
			and m.id not in (select t.resultado from public.liga_tiradas t where t.invitado_id = j.invitado_id and t.dia = hoy);
		if juego is not null then
			insert into public.liga_tiradas (invitado_id, dia, dados, resultado) values (j.invitado_id, hoy, tiradas, juego);
			return jsonb_build_object('tipo', 'juego', 'juego', juego, 'tiradas', tiradas);
		end if;
	end loop;
	raise exception 'sin-juegos' using errcode = 'P0001';
end;
$$;

-- Apunta los puntos de un minijuego de habilidad (los calcula el navegador; aquí se acotan al máximo del
-- juego). Errores: 'sesion', 'sin-equipo', 'no-asignado', 'ya-jugado', 'liga-cerrada'.
create function public.registrar_partida(clave text, minijuego text, puntos integer) returns jsonb
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

-- ───────────────────────── RPC: casino ─────────────────────────
-- Se apuestan puntos propios, siempre que la liga esté abierta. La apuesta se descuenta al apostar y se
-- devuelve con la ganancia al resolver, así nunca se puede apostar lo que ya está en juego.

create function public.banca_casino(clave text) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
	j public.liga_jugadores := privado.jugador(clave);
begin
	return jsonb_build_object('puntos', privado.puntos(j.invitado_id));
end;
$$;

create function privado.validar_apuesta(j public.liga_jugadores, cantidad integer) returns void
language plpgsql stable
set search_path = ''
as $$
begin
	perform privado.exigir_liga_abierta();
	if cantidad is null or cantidad < 1 or cantidad > privado.liga_ajuste('apuesta_maxima_casino')::integer then
		raise exception 'apuesta-invalida' using errcode = 'P0001';
	end if;
	if cantidad > privado.puntos(j.invitado_id) then
		raise exception 'sin-puntos' using errcode = 'P0001';
	end if;
end;
$$;

-- Ruleta: 37 casillas, del 1 al 36 y el 67 (el sitio del 0, de la banca).
-- apuesta: 'rojo' | 'negro' | 'par' | 'impar' | 'd1' | 'd2' | 'd3' | 'numero' (con `numero`, 1–36 o 67).
-- Paga 1 a 1 color y par/impar, 2 a 1 docenas y 35 a 1 número.
-- Errores: 'sesion', 'sin-equipo', 'apuesta-invalida', 'sin-puntos', 'liga-cerrada'.
create function public.girar_ruleta(clave text, apuesta text, cantidad integer, numero integer default null) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
	j public.liga_jugadores := privado.jugador(clave, true);
	rojos integer[] := array[1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
	casilla integer;
	paga integer;
	gana boolean;
	ganancia integer;
begin
	perform privado.validar_apuesta(j, cantidad);
	paga := case apuesta when 'rojo' then 1 when 'negro' then 1 when 'par' then 1 when 'impar' then 1
		when 'd1' then 2 when 'd2' then 2 when 'd3' then 2 when 'numero' then 35 end;
	if paga is null or (apuesta = 'numero' and (numero is null or not (numero between 1 and 36 or numero = 67))) then
		raise exception 'apuesta-invalida' using errcode = 'P0001';
	end if;

	casilla := privado.azar(37);
	if casilla = 0 then casilla := 67; end if;

	gana := case apuesta
		when 'rojo' then casilla = any (rojos)
		when 'negro' then casilla <> 67 and not casilla = any (rojos)
		when 'par' then casilla <> 67 and casilla % 2 = 0
		when 'impar' then casilla <> 67 and casilla % 2 = 1
		when 'd1' then casilla between 1 and 12
		when 'd2' then casilla between 13 and 24
		when 'd3' then casilla between 25 and 36
		when 'numero' then casilla = numero
	end;
	ganancia := case when gana then cantidad * paga else -cantidad end;

	insert into public.liga_movimientos (invitado_id, dia, tipo, minijuego, puntos, detalle)
	values (j.invitado_id, privado.hoy(), 'casino', 'ruleta-casino', ganancia,
		jsonb_build_object('apuesta', apuesta, 'numero', numero, 'cantidad', cantidad, 'casilla', casilla));

	return jsonb_build_object('casilla', casilla, 'gana', gana, 'neto', ganancia, 'puntos', privado.puntos(j.invitado_id));
end;
$$;

-- Blackjack con baraja infinita (cada carta al azar), como el del navegador. Cartas: {"rango":"A","palo":"♠"}.
create function privado.carta() returns jsonb
language sql volatile
set search_path = ''
as $$
	select jsonb_build_object(
		'rango', (array['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'])[1 + privado.azar(13)],
		'palo', (array['♠', '♥', '♦', '♣'])[1 + privado.azar(4)]
	)
$$;

create function privado.valor_mano(mano jsonb) returns integer
language plpgsql immutable
set search_path = ''
as $$
declare
	total integer := 0;
	ases integer := 0;
	c jsonb;
begin
	for c in select * from jsonb_array_elements(mano) loop
		if c ->> 'rango' = 'A' then
			ases := ases + 1;
			total := total + 11;
		elsif c ->> 'rango' in ('10', 'J', 'Q', 'K') then
			total := total + 10;
		else
			total := total + (c ->> 'rango')::integer;
		end if;
	end loop;
	while total > 21 and ases > 0 loop
		total := total - 10;
		ases := ases - 1;
	end loop;
	return total;
end;
$$;

create function privado.es_blackjack(mano jsonb) returns boolean
language sql immutable
set search_path = ''
as $$ select jsonb_array_length(mano) = 2 and privado.valor_mano(mano) = 21 $$;

-- Lo que ve el navegador: mientras se juega, de la banca solo la primera carta
create function privado.mano_json(m public.casino_manos, puntos integer) returns jsonb
language sql stable
set search_path = ''
as $$
	select jsonb_build_object(
		'id', m.id,
		'apuesta', m.apuesta,
		'jugador', m.jugador,
		'banca', case when m.estado = 'terminada' then m.banca else jsonb_build_array(m.banca -> 0) end,
		'estado', m.estado,
		'neto', m.neto,
		'puedeDoblar', m.estado = 'en-juego' and not m.doblada and jsonb_array_length(m.jugador) = 2,
		'puntos', puntos
	)
$$;

-- Cierra la mano: la banca roba hasta 17 (si hace falta), se calcula el neto y se devuelve lo apostado
-- más la ganancia. `pasado` = el jugador se pasó de 21.
create function privado.resolver_mano(m public.casino_manos, pasado boolean) returns public.casino_manos
language plpgsql
set search_path = ''
as $$
declare
	mia integer := privado.valor_mano(m.jugador);
	suya integer;
	ganancia integer;
begin
	if not pasado and not privado.es_blackjack(m.jugador) then
		while privado.valor_mano(m.banca) < 17 loop
			m.banca := m.banca || jsonb_build_array(privado.carta());
		end loop;
	end if;
	suya := privado.valor_mano(m.banca);

	ganancia := case
		when pasado then -m.apuesta
		when privado.es_blackjack(m.jugador) and privado.es_blackjack(m.banca) then 0
		when privado.es_blackjack(m.jugador) then floor(m.apuesta * 1.5)::integer
		when privado.es_blackjack(m.banca) then -m.apuesta
		when suya > 21 then m.apuesta
		when mia > suya then m.apuesta
		when mia < suya then -m.apuesta
		else 0
	end;

	update public.casino_manos
	set banca = m.banca, estado = 'terminada', neto = ganancia, terminada_en = now()
	where id = m.id
	returning * into m;

	-- Al repartir (y al doblar) ya se descontó la apuesta: se devuelve lo apostado más la ganancia
	if m.apuesta + ganancia > 0 then
		insert into public.liga_movimientos (invitado_id, dia, tipo, minijuego, puntos, detalle)
		values (m.invitado_id, privado.hoy(), 'casino', 'blackjack', m.apuesta + ganancia, jsonb_build_object('mano', m.id, 'neto', ganancia));
	end if;
	return m;
end;
$$;

-- Reparte una mano nueva. Si ya hay blackjack se resuelve al momento.
-- Errores: 'sesion', 'sin-equipo', 'apuesta-invalida', 'sin-puntos', 'mano-abierta', 'liga-cerrada'.
create function public.blackjack_repartir(clave text, cantidad integer) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
	j public.liga_jugadores := privado.jugador(clave, true);
	m public.casino_manos;
begin
	if exists (select 1 from public.casino_manos c where c.invitado_id = j.invitado_id and c.estado = 'en-juego') then
		raise exception 'mano-abierta' using errcode = 'P0001';
	end if;
	perform privado.validar_apuesta(j, cantidad);

	insert into public.casino_manos (invitado_id, apuesta, jugador, banca)
	values (j.invitado_id, cantidad, jsonb_build_array(privado.carta(), privado.carta()), jsonb_build_array(privado.carta(), privado.carta()))
	returning * into m;
	insert into public.liga_movimientos (invitado_id, dia, tipo, minijuego, puntos, detalle)
	values (j.invitado_id, privado.hoy(), 'casino', 'blackjack', -cantidad, jsonb_build_object('mano', m.id, 'apuesta', cantidad));

	if privado.es_blackjack(m.jugador) or privado.es_blackjack(m.banca) then
		m := privado.resolver_mano(m, false);
	end if;
	return privado.mano_json(m, privado.puntos(j.invitado_id));
end;
$$;

-- La mano abierta, si la hay (por si se cierra la página a mitad). Null si no hay ninguna.
create function public.blackjack_mano(clave text) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
	j public.liga_jugadores := privado.jugador(clave);
	m public.casino_manos;
begin
	select * into m from public.casino_manos c where c.invitado_id = j.invitado_id and c.estado = 'en-juego';
	if not found then
		return null;
	end if;
	return privado.mano_json(m, privado.puntos(j.invitado_id));
end;
$$;

-- accion: 'pedir' | 'plantarse' | 'doblar' (doblar: una carta más y el doble de apuesta, solo con 2 cartas).
-- Errores: 'sesion', 'sin-equipo', 'sin-mano', 'accion-invalida', 'sin-puntos'.
create function public.blackjack_jugar(clave text, accion text) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
	j public.liga_jugadores := privado.jugador(clave, true);
	m public.casino_manos;
begin
	select * into m from public.casino_manos c where c.invitado_id = j.invitado_id and c.estado = 'en-juego' for update;
	if not found then
		raise exception 'sin-mano' using errcode = 'P0001';
	end if;

	if accion = 'pedir' then
		update public.casino_manos set jugador = jugador || jsonb_build_array(privado.carta()) where id = m.id returning * into m;
		if privado.valor_mano(m.jugador) > 21 then
			m := privado.resolver_mano(m, true);
		elsif privado.valor_mano(m.jugador) = 21 then
			m := privado.resolver_mano(m, false);
		end if;
	elsif accion = 'plantarse' then
		m := privado.resolver_mano(m, false);
	elsif accion = 'doblar' then
		if m.doblada or jsonb_array_length(m.jugador) <> 2 then
			raise exception 'accion-invalida' using errcode = 'P0001';
		end if;
		if m.apuesta > privado.puntos(j.invitado_id) then
			raise exception 'sin-puntos' using errcode = 'P0001';
		end if;
		insert into public.liga_movimientos (invitado_id, dia, tipo, minijuego, puntos, detalle)
		values (j.invitado_id, privado.hoy(), 'casino', 'blackjack', -m.apuesta, jsonb_build_object('mano', m.id, 'doblar', true));
		update public.casino_manos
		set jugador = jugador || jsonb_build_array(privado.carta()), apuesta = apuesta * 2, doblada = true
		where id = m.id returning * into m;
		m := privado.resolver_mano(m, privado.valor_mano(m.jugador) > 21);
	else
		raise exception 'accion-invalida' using errcode = 'P0001';
	end if;

	return privado.mano_json(m, privado.puntos(j.invitado_id));
end;
$$;

-- ───────────────────────── RPC: premios ─────────────────────────

-- PremioEstado[] de liga.ts. El estado lo decide el servidor y el código se crea (una vez) al conseguirlo.
create function public.listar_premios(clave text) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
	quien uuid := privado.invitado_de_clave(clave);
	mi_equipo text;
	cerrada boolean := privado.liga_cerrada();
	pts integer := privado.puntos(quien);
	mio public.rangos := privado.rango(pts);
	mi_puesto integer;
	puesto_equipo integer;
	lider text;
	p public.premios;
	objetivo public.rangos;
	estado text;
	detalle text;
	cod text;
	entregado boolean;
	lista jsonb := '[]'::jsonb;
begin
	select j.equipo into mi_equipo from public.liga_jugadores j where j.invitado_id = quien;
	select c.puesto into mi_puesto from privado.clasificacion() c where c.invitado_id = quien;
	select m.equipo into lider from privado.marcador() m limit 1;
	select x.n into puesto_equipo
	from (select m.equipo, row_number() over (order by m.puntos desc, m.equipo) as n from privado.marcador() m) x
	where x.equipo = mi_equipo;

	for p in select * from public.premios where activo order by orden loop
		estado := 'bloqueado';
		if mi_equipo is null then
			detalle := 'Elige un equipo para empezar a puntuar.';
		elsif p.requisito ->> 'tipo' = 'rango' then
			select * into objetivo from public.rangos where nombre = p.requisito ->> 'rango';
			if pts >= objetivo.desde then
				estado := 'conseguido';
				detalle := 'Has llegado a ' || objetivo.nombre || '.';
			else
				detalle := 'Te faltan ' || (objetivo.desde - pts) || ' puntos para ' || objetivo.nombre || '.';
			end if;
		elsif p.requisito ->> 'tipo' = 'podio' then
			if not cerrada then
				estado := 'en-juego';
				detalle := 'Vas el ' || mi_puesto || 'º. Se decide al cierre de la liga.';
			else
				estado := case when mi_puesto <= (p.requisito ->> 'hasta')::integer then 'conseguido' else 'perdido' end;
				detalle := 'Terminaste el ' || mi_puesto || 'º.';
			end if;
		else
			if not cerrada then
				estado := 'en-juego';
				detalle := 'Tu equipo va el ' || puesto_equipo || 'º. Se decide al cierre de la liga.';
			elsif lider = mi_equipo then
				estado := 'conseguido';
				detalle := 'Tu equipo ha ganado la liga.';
			else
				estado := 'perdido';
				detalle := 'Tu equipo terminó el ' || puesto_equipo || 'º.';
			end if;
		end if;

		cod := null;
		entregado := false;
		if estado = 'conseguido' then
			insert into public.premios_codigos (invitado_id, premio_id, codigo)
			values (quien, p.id, upper(encode(extensions.gen_random_bytes(3), 'hex') || '-' || encode(extensions.gen_random_bytes(3), 'hex')))
			on conflict (invitado_id, premio_id) do nothing;
			select pc.codigo, pc.entregado_en is not null into cod, entregado
			from public.premios_codigos pc where pc.invitado_id = quien and pc.premio_id = p.id;
		end if;

		lista := lista || jsonb_build_object(
			'id', p.id, 'titulo', p.titulo, 'descripcion', p.descripcion, 'requisito', p.requisito,
			'estado', estado, 'detalle', detalle, 'codigo', cod, 'entregado', entregado
		);
	end loop;
	return lista;
end;
$$;

-- Configuración pública de la liga para pintar el tablero (minijuegos, rangos, ajustes).
create function public.config_liga(clave text) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
begin
	perform privado.invitado_de_clave(clave);
	return jsonb_build_object(
		'ajustes', privado.ajuste('liga'),
		'cierre', privado.ajuste('liga_cierre'),
		'minijuegos', (select jsonb_agg(jsonb_build_object('id', id, 'titulo', titulo, 'maxPuntos', max_puntos,
			'numero', numero, 'libre', libre, 'disponible', disponible) order by orden) from public.minijuegos),
		'rangos', (select jsonb_agg(privado.rango_json(r) order by r.desde) from public.rangos r)
	);
end;
$$;

-- ───────────────────────── Permisos ─────────────────────────

revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all functions in schema privado from public, anon, authenticated;

grant execute on function
	public.comprobar_pin(text),
	public.buscar_invitados(text, text),
	public.registrar(text, uuid, text, text, boolean, integer, text),
	public.get_invitado(text),
	public.confirmar_asistencia(text, boolean, integer, text),
	public.listar_cromos(text),
	public.elegir_equipo(text, text),
	public.estado_liga(text),
	public.ranking_liga(text, integer),
	public.marcador_equipos(text),
	public.tirar_dados(text),
	public.registrar_partida(text, text, integer),
	public.banca_casino(text),
	public.girar_ruleta(text, text, integer, integer),
	public.blackjack_repartir(text, integer),
	public.blackjack_mano(text),
	public.blackjack_jugar(text, text),
	public.listar_premios(text),
	public.config_liga(text)
to anon, authenticated;

-- ───────────────────────── Vistas para el panel ─────────────────────────

create view privado.v_liga_ranking as
select c.puesto, c.nombre, c.equipo, c.puntos, (privado.rango(c.puntos)).nombre as rango
from privado.clasificacion() c
order by c.puesto;

create view privado.v_liga_premios as
select i.nombre, p.titulo, pc.codigo, pc.creado_en, pc.entregado_en
from public.premios_codigos pc
join public.invitados i on i.id = pc.invitado_id
join public.premios p on p.id = pc.premio_id
order by pc.entregado_en nulls first, i.nombre;
