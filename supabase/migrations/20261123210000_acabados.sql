-- Acabados del cromo: versiones especiales (holográfico, dorado…) que cada invitado consigue, colecciona y
-- elige para lucir en el álbum. Los hay por rango de la liga y por easter egg. No cuestan ni dan LP, y no se
-- pierden aunque se baje de rango.
--
-- Los de rango y el del 67 los da un disparador sobre `liga_movimientos`, así que valen para cualquier forma
-- de ganar LP sin tocar las funciones de la liga.
-- Contrato con el navegador: src/components/cromos/acabados.ts

-- ───────────────────────── Tablas ─────────────────────────

create table public.acabados (
	id text primary key,
	orden integer not null,
	-- Rango al que se desbloquea. Null: es un easter egg (no se enseña hasta conseguirlo).
	rango text references public.rangos (nombre) on update cascade
);

insert into public.acabados (id, orden, rango) values
	('holo', 1, 'Oro'),
	('arcoiris', 2, 'Diamante'),
	('dorado', 3, 'Challenger'),
	-- Tirar a la rana del nenúfar las tres veces (portada)
	('empapado', 4, null),
	-- Apostar al 67 en la ruleta y que salga
	('n67', 5, null),
	-- Escribir la palabra secreta en el álbum
	('fantasma', 6, null);

create table public.invitado_acabados (
	invitado_id uuid not null references public.invitados (id) on delete cascade,
	acabado text not null references public.acabados (id) on delete cascade,
	conseguido_en timestamptz not null default now(),
	-- Cuándo abrió su sobre. Null: todavía no lo ha visto.
	visto_en timestamptz,
	-- El que lleva puesto en el álbum (uno como mucho)
	puesto boolean not null default false,
	primary key (invitado_id, acabado)
);
create unique index invitado_acabado_puesto on public.invitado_acabados (invitado_id) where puesto;

alter table public.acabados enable row level security;
alter table public.invitado_acabados enable row level security;

-- ───────────────────────── Funciones internas ─────────────────────────

-- Da un acabado. Devuelve si es la primera vez.
create function privado.dar_acabado(quien uuid, cual text) returns boolean
language plpgsql
set search_path = ''
as $$
begin
	insert into public.invitado_acabados (invitado_id, acabado) values (quien, cual) on conflict do nothing;
	return found;
end;
$$;

-- Letras que hay que cambiar, quitar o poner para pasar de una palabra a otra (Levenshtein)
create function privado.distancia(a text, b text) returns integer
language plpgsql immutable
set search_path = ''
as $$
declare
	la integer := length(a);
	lb integer := length(b);
	fila integer[];
	otra integer[];
begin
	-- fila[j + 1]: distancia entre lo leído de `a` y las j primeras letras de `b`
	select array_agg(g order by g) into fila from generate_series(0, lb) g;
	for i in 1..la loop
		otra := array[i];
		for j in 1..lb loop
			otra[j + 1] := least(
				fila[j + 1] + 1,
				otra[j] + 1,
				fila[j] + case when substr(a, i, 1) = substr(b, j, 1) then 0 else 1 end
			);
		end loop;
		fila := otra;
	end loop;
	return fila[lb + 1];
end;
$$;

-- Tras cada movimiento de la liga: los acabados de los rangos alcanzados y el del 67
create function privado.revisar_acabados() returns trigger
language plpgsql
set search_path = ''
as $$
declare
	puntos integer := privado.puntos(new.invitado_id);
begin
	insert into public.invitado_acabados (invitado_id, acabado)
	select new.invitado_id, a.id
	from public.acabados a
	join public.rangos r on r.nombre = a.rango
	where r.desde <= puntos
	on conflict do nothing;

	if new.tipo = 'casino' and new.minijuego = 'ruleta-casino'
		and new.detalle ->> 'apuesta' = 'numero' and new.detalle ->> 'numero' = '67' and new.detalle ->> 'casilla' = '67' then
		perform privado.dar_acabado(new.invitado_id, 'n67');
	end if;
	return null;
end;
$$;

create trigger liga_movimientos_acabados
	after insert on public.liga_movimientos
	for each row execute function privado.revisar_acabados();

-- El cromo lleva también el acabado puesto (lo usan el álbum, el registro…)
create or replace function privado.cromo(i public.invitados) returns jsonb
language sql stable
set search_path = ''
as $$
	select jsonb_build_object(
		'id', i.id,
		'numero', i.numero,
		'nombre', i.nombre,
		'apodo', coalesce(i.apodo, i.nombre),
		'frase', i.frase,
		'foto', i.foto_path,
		'especial', i.especial,
		'acabado', (select ia.acabado from public.invitado_acabados ia where ia.invitado_id = i.id and ia.puesto)
	)
$$;

-- ───────────────────────── RPC de los invitados ─────────────────────────

-- Su colección, en orden. Los de rango salen siempre (son la meta); los easter eggs que le faltan, solo como
-- hueco y sin decir cuál es. `hayPalabra`: si los organizadores han puesto palabra secreta. Error: 'sesion'.
create function public.mis_acabados(clave text) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
	quien uuid := privado.invitado_de_clave(clave);
begin
	return jsonb_build_object('hayPalabra', privado.ajuste('palabra_secreta') is not null, 'casillas', (
		select jsonb_agg(
			case when a.rango is null and ia.acabado is null then jsonb_build_object('oculto', true)
			else jsonb_build_object(
				'id', a.id, 'rango', a.rango, 'desde', r.desde, 'conseguido', ia.acabado is not null,
				'nuevo', ia.acabado is not null and ia.visto_en is null, 'puesto', coalesce(ia.puesto, false)
			) end order by a.orden)
		from public.acabados a
		left join public.rangos r on r.nombre = a.rango
		left join public.invitado_acabados ia on ia.acabado = a.id and ia.invitado_id = quien
	));
end;
$$;

-- Ha abierto el sobre de sus acabados nuevos
create function public.acabados_vistos(clave text) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
	quien uuid := privado.invitado_de_clave(clave);
begin
	update public.invitado_acabados ia set visto_en = now() where ia.invitado_id = quien and ia.visto_en is null;
end;
$$;

-- Elige con cuál sale en el álbum (null: el cromo normal). Errores: 'sesion', 'no-conseguido'.
create function public.poner_acabado(clave text, acabado text) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
	quien uuid := privado.invitado_de_clave(clave);
begin
	if poner_acabado.acabado is not null and not exists (select 1 from public.invitado_acabados ia
		where ia.invitado_id = quien and ia.acabado = poner_acabado.acabado) then
		raise exception 'no-conseguido' using errcode = 'P0001';
	end if;
	update public.invitado_acabados ia set puesto = false where ia.invitado_id = quien and ia.puesto;
	update public.invitado_acabados ia set puesto = true where ia.invitado_id = quien and ia.acabado = poner_acabado.acabado;
end;
$$;

-- Easter egg del nenúfar: ha tirado a la rana al agua las tres veces (lo cuenta el navegador; no da LP).
-- Devuelve si es la primera vez. Error: 'sesion'.
create function public.tocar_nenufar(clave text) returns boolean
language plpgsql security definer
set search_path = ''
as $$
begin
	return privado.dar_acabado(privado.invitado_de_clave(clave), 'empapado');
end;
$$;

-- Easter egg de la palabra secreta. Da igual mayúsculas y tildes. Devuelve si es la primera vez.
-- Errores: 'sesion', 'palabra' (no es, o no hay ninguna puesta), 'casi' (se parece mucho).
create function public.decir_palabra(clave text, palabra text) returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
	quien uuid := privado.invitado_de_clave(clave);
	buena text := privado.normalizar(trim(privado.ajuste('palabra_secreta') #>> '{}'));
	dicha text := left(privado.normalizar(trim(palabra)), 60);
begin
	if buena = '' then
		raise exception 'palabra' using errcode = 'P0001';
	end if;
	if dicha <> buena then
		-- Casi: una letra de diferencia por cada tres de la palabra (una como mínimo)
		if dicha <> '' and privado.distancia(dicha, buena) <= greatest(1, length(buena) / 3) then
			raise exception 'casi' using errcode = 'P0001';
		end if;
		raise exception 'palabra' using errcode = 'P0001';
	end if;
	return privado.dar_acabado(quien, 'fantasma');
end;
$$;

-- ───────────────────────── RPC de admin ─────────────────────────

-- La palabra secreta (null si no hay) y cuántos tienen cada acabado. Errores: 'sesion', 'no-admin'.
create function public.admin_acabados(clave text) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
begin
	perform privado.admin_de_clave(clave);
	return jsonb_build_object(
		'palabra', privado.ajuste('palabra_secreta') #>> '{}',
		'conseguidos', (select jsonb_agg(jsonb_build_object('id', a.id,
			'cuantos', (select count(*) from public.invitado_acabados ia where ia.acabado = a.id)) order by a.orden) from public.acabados a)
	);
end;
$$;

-- Pone la palabra secreta (vacía: quita el easter egg). Los que ya lo tienen lo conservan.
-- Errores: 'sesion', 'no-admin', 'datos'.
create function public.admin_guardar_palabra(clave text, palabra text) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
	admin uuid := privado.admin_de_clave(clave);
	limpia text := trim(coalesce(admin_guardar_palabra.palabra, ''));
begin
	if limpia <> '' and length(limpia) not between 3 and 40 then
		raise exception 'datos' using errcode = 'P0001';
	end if;
	delete from public.ajustes a where a.clave = 'palabra_secreta';
	if limpia <> '' then
		insert into public.ajustes (clave, valor, descripcion)
		values ('palabra_secreta', to_jsonb(limpia), 'Palabra secreta del álbum: da el acabado fantasma');
	end if;
	perform privado.apuntar(admin, 'palabra-secreta', jsonb_build_object('palabra', limpia));
end;
$$;

-- ───────────────────────── Lo ya jugado ─────────────────────────

-- Rangos que alguien ya alcanzó alguna vez (aunque luego haya bajado) y 67 ya acertados
with suma as (
	select m.invitado_id, sum(m.puntos) over (partition by m.invitado_id order by m.id) as llevaba
	from public.liga_movimientos m
), tope as (
	select s.invitado_id, max(s.llevaba) as maximo from suma s group by s.invitado_id
)
insert into public.invitado_acabados (invitado_id, acabado)
select t.invitado_id, a.id
from tope t
join public.rangos r on r.desde <= t.maximo
join public.acabados a on a.rango = r.nombre
on conflict do nothing;

insert into public.invitado_acabados (invitado_id, acabado)
select distinct m.invitado_id, 'n67'
from public.liga_movimientos m
where m.tipo = 'casino' and m.minijuego = 'ruleta-casino'
	and m.detalle ->> 'apuesta' = 'numero' and m.detalle ->> 'numero' = '67' and m.detalle ->> 'casilla' = '67'
on conflict do nothing;

-- ───────────────────────── Permisos ─────────────────────────

revoke all on all tables in schema public from anon, authenticated;
revoke all on function
	privado.dar_acabado(uuid, text),
	privado.distancia(text, text),
	privado.revisar_acabados()
from public, anon, authenticated;
revoke all on function
	public.mis_acabados(text),
	public.acabados_vistos(text),
	public.poner_acabado(text, text),
	public.tocar_nenufar(text),
	public.decir_palabra(text, text),
	public.admin_acabados(text),
	public.admin_guardar_palabra(text, text)
from public;
grant execute on function
	public.mis_acabados(text),
	public.acabados_vistos(text),
	public.poner_acabado(text, text),
	public.tocar_nenufar(text),
	public.decir_palabra(text, text),
	public.admin_acabados(text),
	public.admin_guardar_palabra(text, text)
to anon, authenticated;
