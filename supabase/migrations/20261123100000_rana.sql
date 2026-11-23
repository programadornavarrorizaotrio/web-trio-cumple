-- La rana habla: mensajes que escriben los organizadores en /admin y que la mascota dice en la web, asomada
-- en la esquina de abajo. Cada uno es para un grupo o para una sola persona, y deja de salirle a quien lo
-- cierra ("Vale"). En el texto, `{nombre}` se cambia por el nombre de pila de quien lo lee.
-- Contrato con el navegador: src/components/rana/datos.ts y src/components/admin/datos.ts

-- ───────────────────────── Tablas ─────────────────────────

create table public.rana_mensajes (
	id bigint generated always as identity primary key,
	texto text not null check (length(trim(texto)) between 1 and 160),
	-- Imagen de la mascota (src/components/rana/poses.ts)
	pose text not null default 'saluda' check (pose in ('saluda', 'prisa', 'diablillo', 'fiesta', 'triste')),
	-- Los grupos se miran en el momento: al que responde deja de salirle uno de 'sin-responder'
	destino text not null check (destino in ('todos', 'sin-responder', 'vienen', 'equipo', 'invitado')),
	equipo text check (equipo in ('pencho', 'fran', 'juan')),
	invitado_id uuid references public.invitados (id) on delete cascade,
	autor_id uuid references public.invitados (id) on delete set null,
	-- Null: hasta que se calle a mano
	caduca_en timestamptz,
	callado_en timestamptz,
	created_at timestamptz not null default now(),
	check ((destino = 'equipo') = (equipo is not null)),
	check ((destino = 'invitado') = (invitado_id is not null))
);

-- Quién ha cerrado cada mensaje
create table public.rana_vistos (
	mensaje_id bigint not null references public.rana_mensajes (id) on delete cascade,
	invitado_id uuid not null references public.invitados (id) on delete cascade,
	visto_en timestamptz not null default now(),
	primary key (mensaje_id, invitado_id)
);

alter table public.rana_mensajes enable row level security;
alter table public.rana_vistos enable row level security;

-- ───────────────────────── Funciones internas ─────────────────────────

create function privado.rana_activo(m public.rana_mensajes) returns boolean
language sql stable
set search_path = ''
as $$ select m.callado_en is null and (m.caduca_en is null or m.caduca_en > now()) $$;

-- Si el mensaje le toca a ese invitado
create function privado.rana_es_para(m public.rana_mensajes, quien uuid) returns boolean
language sql stable
set search_path = ''
as $$
	select case m.destino
		when 'todos' then true
		when 'sin-responder' then not exists (select 1 from public.confirmaciones c where c.invitado_id = quien)
		when 'vienen' then exists (select 1 from public.confirmaciones c where c.invitado_id = quien and c.asiste)
		when 'equipo' then exists (select 1 from public.liga_jugadores j where j.invitado_id = quien and j.equipo = m.equipo)
		when 'invitado' then m.invitado_id = quien
		else false
	end
$$;

-- ───────────────────────── RPC de los invitados ─────────────────────────

-- Lo que la rana tiene que decirle y aún no ha cerrado, por orden. Error: 'sesion'.
create function public.escuchar_rana(clave text) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
	quien uuid := privado.invitado_de_clave(clave);
	corto text;
begin
	select split_part(trim(i.nombre), ' ', 1) into corto from public.invitados i where i.id = quien;
	return coalesce((
		select jsonb_agg(jsonb_build_object('id', m.id, 'texto', replace(m.texto, '{nombre}', corto), 'pose', m.pose) order by m.id)
		from public.rana_mensajes m
		where privado.rana_activo(m) and privado.rana_es_para(m, quien)
			and not exists (select 1 from public.rana_vistos v where v.mensaje_id = m.id and v.invitado_id = quien)
	), '[]'::jsonb);
end;
$$;

-- Ha cerrado un mensaje. Los que no son para esa persona se ignoran. Error: 'sesion'.
create function public.rana_vista(clave text, mensaje bigint) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
	quien uuid := privado.invitado_de_clave(clave);
begin
	insert into public.rana_vistos (mensaje_id, invitado_id)
	select m.id, quien from public.rana_mensajes m
	where m.id = rana_vista.mensaje and privado.rana_es_para(m, quien)
	on conflict do nothing;
end;
$$;

-- ───────────────────────── RPC de admin ─────────────────────────

-- Los últimos 30 mensajes, del más nuevo al más viejo. Errores: 'sesion', 'no-admin'.
create function public.admin_rana(clave text) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
begin
	perform privado.admin_de_clave(clave);
	return coalesce((
		select jsonb_agg(jsonb_build_object(
			'id', m.id, 'texto', m.texto, 'pose', m.pose, 'destino', m.destino, 'equipo', m.equipo,
			'invitado', i.nombre, 'autor', a.nombre, 'activo', privado.rana_activo(m), 'caducaEn', m.caduca_en,
			'creadoEn', m.created_at,
			'vistos', (select count(*) from public.rana_vistos v where v.mensaje_id = m.id)
		) order by m.id desc)
		from public.rana_mensajes m
		left join public.invitados i on i.id = m.invitado_id
		left join public.invitados a on a.id = m.autor_id
		where m.id in (select x.id from public.rana_mensajes x order by x.id desc limit 30)
	), '[]'::jsonb);
end;
$$;

-- La rana dice algo. `horas` null: hasta que se calle a mano. Devuelve el id.
-- Errores: 'sesion', 'no-admin', 'datos', 'no-existe'.
create function public.admin_rana_decir(
	clave text, texto text, pose text, destino text,
	equipo text default null, invitado_id uuid default null, horas integer default null
) returns bigint
language plpgsql security definer
set search_path = ''
as $$
declare
	admin uuid := privado.admin_de_clave(clave);
	limpio text := trim(coalesce(admin_rana_decir.texto, ''));
	nuevo bigint;
begin
	if length(limpio) not between 1 and 160
		or coalesce(admin_rana_decir.pose, '') not in ('saluda', 'prisa', 'diablillo', 'fiesta', 'triste')
		or coalesce(admin_rana_decir.destino, '') not in ('todos', 'sin-responder', 'vienen', 'equipo', 'invitado')
		or (admin_rana_decir.destino = 'equipo' and coalesce(admin_rana_decir.equipo, '') not in ('pencho', 'fran', 'juan'))
		or (admin_rana_decir.destino = 'invitado' and admin_rana_decir.invitado_id is null)
		or (admin_rana_decir.horas is not null and admin_rana_decir.horas not between 1 and 24 * 90) then
		raise exception 'datos' using errcode = 'P0001';
	end if;
	if admin_rana_decir.destino = 'invitado'
		and not exists (select 1 from public.invitados i where i.id = admin_rana_decir.invitado_id) then
		raise exception 'no-existe' using errcode = 'P0001';
	end if;

	insert into public.rana_mensajes as m (texto, pose, destino, equipo, invitado_id, autor_id, caduca_en)
	values (
		limpio,
		admin_rana_decir.pose,
		admin_rana_decir.destino,
		case when admin_rana_decir.destino = 'equipo' then admin_rana_decir.equipo end,
		case when admin_rana_decir.destino = 'invitado' then admin_rana_decir.invitado_id end,
		admin,
		case when admin_rana_decir.horas is not null then now() + make_interval(hours => admin_rana_decir.horas) end
	)
	returning m.id into nuevo;
	perform privado.apuntar(admin, 'rana-decir', jsonb_build_object('id', nuevo, 'texto', limpio, 'destino', admin_rana_decir.destino));
	return nuevo;
end;
$$;

-- Calla un mensaje: deja de salirle a todo el mundo. Error: 'no-existe'.
create function public.admin_rana_callar(clave text, mensaje bigint) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
	admin uuid := privado.admin_de_clave(clave);
begin
	update public.rana_mensajes m set callado_en = coalesce(m.callado_en, now()) where m.id = admin_rana_callar.mensaje;
	if not found then
		raise exception 'no-existe' using errcode = 'P0001';
	end if;
	perform privado.apuntar(admin, 'rana-callar', jsonb_build_object('id', admin_rana_callar.mensaje));
end;
$$;

-- ───────────────────────── Permisos ─────────────────────────

revoke all on all tables in schema public from anon, authenticated;
revoke all on function
	privado.rana_activo(public.rana_mensajes),
	privado.rana_es_para(public.rana_mensajes, uuid)
from public, anon, authenticated;
revoke all on function
	public.escuchar_rana(text),
	public.rana_vista(text, bigint),
	public.admin_rana(text),
	public.admin_rana_decir(text, text, text, text, text, uuid, integer),
	public.admin_rana_callar(text, bigint)
from public;
grant execute on function
	public.escuchar_rana(text),
	public.rana_vista(text, bigint),
	public.admin_rana(text),
	public.admin_rana_decir(text, text, text, text, text, uuid, integer),
	public.admin_rana_callar(text, bigint)
to anon, authenticated;
