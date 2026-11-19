-- Base de la web: invitados, sesiones, asistencia y ajustes.
--
-- Reglas de seguridad (ver README, "Identidad"):
-- - RLS activado en TODAS las tablas y ninguna política para anon/authenticated: el navegador no lee ni
--   escribe tablas. Todo pasa por funciones RPC `security definer` de este archivo y de los siguientes.
-- - Las RPC públicas piden el PIN de la fiesta; el resto, la clave de sesión que devuelve `registrar`.
-- - Lo interno (comprobar la clave, el PIN, la fecha de Madrid…) vive en el esquema `privado`, que la API
--   de Supabase no expone. Las vistas para consultar desde el panel también van ahí: una vista en `public`
--   saldría por la API saltándose RLS.
--
-- Pensado para crecer (sin hacerlo aún):
-- - Roles: `invitados.rol` ya distingue 'admin' (los tres cumpleañeros). Las RPC de admin comprobarán
--   `privado.es_admin(invitado)`.
-- - Personaje del LoL de cada invitado: `invitados.campeon` (clave de Data Dragon, p. ej. 'Ezreal').
-- - Formulario inicial con preguntas que decidan los admins: irá en tablas propias
--   (`formulario_preguntas` / `formulario_respuestas`), no en columnas nuevas de `invitados`.
-- - Más datos de cada invitado: tabla 1:1 con `invitado_id` como clave, igual que `confirmaciones`.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists privado;
revoke all on schema privado from public;

-- ───────────────────────── Tablas ─────────────────────────

-- Valores sueltos de configuración (el hash del PIN, ajustes de la liga…). Los editarán los admins.
create table public.ajustes (
	clave text primary key,
	valor jsonb not null,
	descripcion text,
	updated_at timestamptz not null default now()
);

create table public.invitados (
	id uuid primary key default gen_random_uuid(),
	-- Orden fijo en el álbum de cromos
	numero integer not null unique check (numero > 0),
	nombre text not null check (length(trim(nombre)) > 0),
	-- Ruta de la foto en el bucket `cromos` (nombre aleatorio). La suben los organizadores.
	foto_path text,
	-- Los tres cumpleañeros: cromo "Edición especial"
	especial boolean not null default false,
	rol text not null default 'invitado' check (rol in ('invitado', 'admin')),
	-- Para ocultar a alguien sin borrarlo
	visible boolean not null default true,
	-- Lo que rellena al registrarse
	apodo text check (length(apodo) <= 40),
	frase text check (length(frase) <= 140),
	-- Personaje del LoL que elegirá cada invitado (pendiente de diseñar). Clave de Data Dragon.
	campeon text check (length(campeon) <= 40),
	registrado_en timestamptz,
	created_at timestamptz not null default now()
);

-- Una fila por móvil registrado. Solo se guarda el hash de la clave. Para "resetear" a alguien
-- (cambió de móvil) se pone `revocada_en` y `invitados.registrado_en = null` desde el panel.
create table public.sesiones (
	id uuid primary key default gen_random_uuid(),
	invitado_id uuid not null references public.invitados (id) on delete cascade,
	hash text not null unique,
	creada_en timestamptz not null default now(),
	usada_en timestamptz not null default now(),
	revocada_en timestamptz
);
create index sesiones_invitado_idx on public.sesiones (invitado_id);

create table public.confirmaciones (
	invitado_id uuid primary key references public.invitados (id) on delete cascade,
	asiste boolean not null,
	acompanantes integer not null default 0 check (acompanantes between 0 and 5),
	alergias text check (length(alergias) <= 300),
	updated_at timestamptz not null default now()
);

alter table public.ajustes enable row level security;
alter table public.invitados enable row level security;
alter table public.sesiones enable row level security;
alter table public.confirmaciones enable row level security;

-- ───────────────────────── Funciones internas ─────────────────────────

create function privado.hash(texto text) returns text
language sql immutable
set search_path = ''
as $$ select encode(extensions.digest(texto, 'sha256'), 'hex') $$;

-- Para buscar nombres sin importar mayúsculas ni tildes
create function privado.normalizar(texto text) returns text
language sql immutable
set search_path = ''
as $$ select lower(translate(coalesce(texto, ''), 'áéíóúüñÁÉÍÓÚÜÑàèìòùÀÈÌÒÙ', 'aeiouunaeiouunaeiouaeiou')) $$;

-- Día de hoy en Madrid: los límites diarios (tiradas, partidas) van por este día
create function privado.hoy() returns date
language sql stable
set search_path = ''
as $$ select (now() at time zone 'Europe/Madrid')::date $$;

create function privado.ajuste(clave_ajuste text) returns jsonb
language sql stable
set search_path = ''
as $$ select valor from public.ajustes where clave = clave_ajuste $$;

-- El PIN real NO va en el repo: se guarda su hash desde el panel (SQL editor) con
--   insert into ajustes (clave, valor) values ('pin_hash', to_jsonb(privado.hash('<pin>')))
--   on conflict (clave) do update set valor = excluded.valor, updated_at = now();
create function privado.pin_valido(pin text) returns boolean
language sql stable
set search_path = ''
as $$ select coalesce(privado.ajuste('pin_hash') #>> '{}' = privado.hash(trim(pin)), false) $$;

-- Quién es el dueño de una clave de sesión. Falla con 'sesion' si no vale (el navegador la borra y
-- manda a /registro).
create function privado.invitado_de_clave(clave text) returns uuid
language plpgsql
set search_path = ''
as $$
declare
	quien uuid;
begin
	update public.sesiones s
	set usada_en = now()
	where s.hash = privado.hash(clave) and s.revocada_en is null
	returning s.invitado_id into quien;
	if quien is null then
		raise exception 'sesion' using errcode = 'P0001';
	end if;
	return quien;
end;
$$;

create function privado.es_admin(invitado uuid) returns boolean
language sql stable
set search_path = ''
as $$ select exists (select 1 from public.invitados where id = invitado and rol = 'admin') $$;

-- Un cromo tal y como lo pinta la web (src/components/cromos/tipos.ts). `foto` es la ruta en el bucket
-- `cromos`; la URL la construye el navegador.
create function privado.cromo(i public.invitados) returns jsonb
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
		'especial', i.especial
	)
$$;

-- ───────────────────────── RPC públicas (con PIN) ─────────────────────────

create function public.comprobar_pin(pin text) returns boolean
language sql stable security definer
set search_path = ''
as $$ select privado.pin_valido(pin) $$;

-- Mínimo 2 letras y máximo 10 resultados. Solo nombre y si ya está registrado: nunca fotos ni cromos.
create function public.buscar_invitados(pin text, texto text)
returns table (id uuid, nombre text, registrado boolean)
language plpgsql stable security definer
set search_path = ''
as $$
begin
	if not privado.pin_valido(pin) or length(trim(coalesce(texto, ''))) < 2 then
		return;
	end if;
	return query
	select i.id, i.nombre, i.registrado_en is not null
	from public.invitados i
	where i.visible and privado.normalizar(i.nombre) like '%' || privado.normalizar(trim(texto)) || '%'
	order by i.nombre
	limit 10;
end;
$$;

-- Activa el cromo, guarda la asistencia y devuelve la clave de sesión (solo se guarda su hash).
-- Errores: 'pin', 'no-existe', 'ya-registrado', 'datos'.
create function public.registrar(
	pin text,
	invitado_id uuid,
	apodo text,
	frase text,
	asiste boolean,
	acompanantes integer default 0,
	alergias text default null
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
	inv public.invitados;
	clave text;
begin
	if not privado.pin_valido(pin) then
		raise exception 'pin' using errcode = 'P0001';
	end if;
	select * into inv from public.invitados i where i.id = registrar.invitado_id and i.visible for update;
	if not found then
		raise exception 'no-existe' using errcode = 'P0001';
	end if;
	if inv.registrado_en is not null then
		raise exception 'ya-registrado' using errcode = 'P0001';
	end if;
	if length(trim(coalesce(apodo, ''))) = 0 or length(apodo) > 40 or length(frase) > 140
		or asiste is null or coalesce(acompanantes, 0) not between 0 and 5 or length(alergias) > 300 then
		raise exception 'datos' using errcode = 'P0001';
	end if;

	update public.invitados i
	set apodo = trim(registrar.apodo),
		frase = nullif(trim(registrar.frase), ''),
		registrado_en = now()
	where i.id = inv.id
	returning * into inv;

	insert into public.confirmaciones (invitado_id, asiste, acompanantes, alergias)
	values (inv.id, asiste, coalesce(acompanantes, 0), nullif(trim(alergias), ''))
	on conflict on constraint confirmaciones_pkey do update
	set asiste = excluded.asiste, acompanantes = excluded.acompanantes, alergias = excluded.alergias, updated_at = now();

	clave := encode(extensions.gen_random_bytes(24), 'hex');
	insert into public.sesiones (invitado_id, hash) values (inv.id, privado.hash(clave));

	return jsonb_build_object('clave', clave, 'cromo', privado.cromo(inv));
end;
$$;

-- ───────────────────────── RPC con clave ─────────────────────────

-- Datos propios: para la cabecera, la asistencia y saber si es admin
create function public.get_invitado(clave text) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
	quien uuid := privado.invitado_de_clave(clave);
begin
	return (
		select privado.cromo(i) || jsonb_build_object(
			'rol', i.rol,
			'campeon', i.campeon,
			'asistencia', (select jsonb_build_object('asiste', c.asiste, 'acompanantes', c.acompanantes, 'alergias', c.alergias)
				from public.confirmaciones c where c.invitado_id = i.id)
		)
		from public.invitados i where i.id = quien
	);
end;
$$;

create function public.confirmar_asistencia(clave text, asiste boolean, acompanantes integer default 0, alergias text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
	quien uuid := privado.invitado_de_clave(clave);
begin
	if asiste is null or coalesce(acompanantes, 0) not between 0 and 5 or length(alergias) > 300 then
		raise exception 'datos' using errcode = 'P0001';
	end if;
	insert into public.confirmaciones (invitado_id, asiste, acompanantes, alergias)
	values (quien, asiste, coalesce(acompanantes, 0), nullif(trim(alergias), ''))
	on conflict on constraint confirmaciones_pkey do update
	set asiste = excluded.asiste, acompanantes = excluded.acompanantes, alergias = excluded.alergias, updated_at = now();
end;
$$;

-- Álbum: solo los cromos de registrados, y el total para pintar boca abajo el resto
create function public.listar_cromos(clave text) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
begin
	perform privado.invitado_de_clave(clave);
	return jsonb_build_object(
		'cromos', coalesce((select jsonb_agg(privado.cromo(i) order by i.numero)
			from public.invitados i where i.visible and i.registrado_en is not null), '[]'::jsonb),
		'total', (select count(*) from public.invitados i where i.visible)
	);
end;
$$;

-- ───────────────────────── Permisos ─────────────────────────
-- Supabase da EXECUTE a anon en cada función nueva de `public`: se quita a todas y se da solo a las RPC.

revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all functions in schema privado from public, anon, authenticated;

grant execute on function
	public.comprobar_pin(text),
	public.buscar_invitados(text, text),
	public.registrar(text, uuid, text, text, boolean, integer, text),
	public.get_invitado(text),
	public.confirmar_asistencia(text, boolean, integer, text),
	public.listar_cromos(text)
to anon, authenticated;

-- ───────────────────────── Vistas para el panel ─────────────────────────
-- En `privado`: se consultan desde el SQL editor de Supabase y se exportan a CSV.

create view privado.v_asistentes as
select i.numero, i.nombre, i.apodo, c.asiste, c.acompanantes, c.alergias, i.registrado_en
from public.invitados i
left join public.confirmaciones c on c.invitado_id = i.id
order by i.numero;

create view privado.v_alergias as
select i.nombre, c.alergias
from public.confirmaciones c
join public.invitados i on i.id = c.invitado_id
where c.asiste and c.alergias is not null
order by i.nombre;
