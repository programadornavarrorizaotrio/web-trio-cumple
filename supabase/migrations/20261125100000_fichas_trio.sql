-- Fichas del trío: cada cumpleañero edita la suya en /admin y los invitados la ven en la portada ("El trío").
-- Mientras no guarde nada, la web enseña la de siempre (src/data/trio.json).
-- Contrato con el navegador: src/components/trio/fichas.ts y src/components/admin/datos.ts

-- ───────────────────────── Tabla ─────────────────────────

create table public.trio_fichas (
	persona text primary key check (persona in ('pencho', 'fran', 'juan')),
	edad integer not null check (edad between 1 and 120),
	lema text not null check (length(trim(lema)) between 1 and 40),
	descripcion text not null check (length(trim(descripcion)) between 1 and 400),
	aficiones text[] not null check (cardinality(aficiones) between 1 and 8),
	-- Lo que sale en el bocadillo al tocar su muñeco
	advertencia text not null check (length(trim(advertencia)) between 1 and 90),
	-- Foto propia, en el bucket `cromos` (null: la de la web)
	foto_path text,
	-- `object-position` de la foto (null: el de siempre)
	encuadre text check (encuadre ~ '^(100|[0-9]{1,2})% (100|[0-9]{1,2})%$'),
	autor_id uuid references public.invitados (id) on delete set null,
	actualizada_en timestamptz not null default now()
);

alter table public.trio_fichas enable row level security;

-- ───────────────────────── Funciones internas ─────────────────────────

-- Cuál de los tres es ese invitado: los cromos especiales 1, 2 y 3, como en la web. Null si no es del trío.
create function privado.persona_del_trio(quien uuid) returns text
language sql stable
set search_path = ''
as $$
	select (array['pencho', 'fran', 'juan'])[i.numero]
	from public.invitados i
	where i.id = quien and i.especial and i.numero between 1 and 3
$$;

create function privado.ficha_trio(f public.trio_fichas) returns jsonb
language sql stable
set search_path = ''
as $$
	select jsonb_build_object(
		'persona', f.persona, 'edad', f.edad, 'lema', f.lema, 'descripcion', f.descripcion,
		'aficiones', to_jsonb(f.aficiones), 'advertencia', f.advertencia, 'foto', f.foto_path, 'encuadre', f.encuadre
	)
$$;

-- ───────────────────────── RPC de los invitados ─────────────────────────

-- Las fichas que se han cambiado (de las demás vale la de la web). Error: 'sesion'.
create function public.fichas_trio(clave text) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
begin
	perform privado.invitado_de_clave(clave);
	return coalesce((select jsonb_agg(privado.ficha_trio(f)) from public.trio_fichas f), '[]'::jsonb);
end;
$$;

-- ───────────────────────── RPC de admin ─────────────────────────

-- La ficha de quien pregunta: {persona, ficha}, con `ficha` null si aún no la ha cambiado.
-- Errores: 'sesion', 'no-admin', 'sin-ficha' (admin que no es del trío).
create function public.admin_ficha(clave text) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
	admin uuid := privado.admin_de_clave(clave);
	cual text := privado.persona_del_trio(admin);
begin
	if cual is null then
		raise exception 'sin-ficha' using errcode = 'P0001';
	end if;
	return jsonb_build_object(
		'persona', cual,
		'ficha', (select privado.ficha_trio(f) from public.trio_fichas f where f.persona = cual)
	);
end;
$$;

-- Guarda la ficha de quien llama: nadie puede tocar la de otro. `foto_ruta` es una reserva de
-- `pedir_subida_foto` ya subida; `quitar_foto` vuelve a la de la web; sin ninguna de las dos, la foto no cambia.
-- Devuelve la ficha. Errores: 'sesion', 'no-admin', 'sin-ficha', 'datos', 'foto'.
create function public.admin_guardar_ficha(
	clave text, edad integer, lema text, descripcion text, aficiones text[], advertencia text,
	encuadre text default null, foto_ruta text default null, quitar_foto boolean default false
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
	admin uuid := privado.admin_de_clave(clave);
	cual text := privado.persona_del_trio(admin);
	lema_limpio text := trim(coalesce(admin_guardar_ficha.lema, ''));
	descripcion_limpia text := trim(coalesce(admin_guardar_ficha.descripcion, ''));
	advertencia_limpia text := trim(coalesce(admin_guardar_ficha.advertencia, ''));
	lista text[] := array(
		select trim(x.a) from unnest(admin_guardar_ficha.aficiones) with ordinality as x(a, n)
		where trim(coalesce(x.a, '')) <> '' order by x.n
	);
	guardada public.trio_fichas;
begin
	if cual is null then
		raise exception 'sin-ficha' using errcode = 'P0001';
	end if;
	if coalesce(admin_guardar_ficha.edad, 0) not between 1 and 120
		or length(lema_limpio) not between 1 and 40
		or length(descripcion_limpia) not between 1 and 400
		or length(advertencia_limpia) not between 1 and 90
		or cardinality(lista) not between 1 and 8
		or exists (select 1 from unnest(lista) as x(a) where length(x.a) > 30)
		or (admin_guardar_ficha.encuadre is not null
			and admin_guardar_ficha.encuadre !~ '^(100|[0-9]{1,2})% (100|[0-9]{1,2})%$') then
		raise exception 'datos' using errcode = 'P0001';
	end if;

	-- La reserva se gasta aquí, igual que en `guardar_foto`
	if admin_guardar_ficha.foto_ruta is not null then
		update public.fotos_subidas s set usada_en = now()
		where s.ruta = admin_guardar_ficha.foto_ruta and s.invitado_id = admin and s.usada_en is null
			and exists (select 1 from storage.objects o where o.bucket_id = 'cromos' and o.name = admin_guardar_ficha.foto_ruta);
		if not found then
			raise exception 'foto' using errcode = 'P0001';
		end if;
	end if;

	insert into public.trio_fichas as f (persona, edad, lema, descripcion, aficiones, advertencia, foto_path, encuadre, autor_id)
	values (
		cual, admin_guardar_ficha.edad, lema_limpio, descripcion_limpia, lista, advertencia_limpia,
		admin_guardar_ficha.foto_ruta, admin_guardar_ficha.encuadre, admin
	)
	on conflict on constraint trio_fichas_pkey do update set
		edad = excluded.edad,
		lema = excluded.lema,
		descripcion = excluded.descripcion,
		aficiones = excluded.aficiones,
		advertencia = excluded.advertencia,
		foto_path = case
			when excluded.foto_path is not null then excluded.foto_path
			when coalesce(admin_guardar_ficha.quitar_foto, false) then null
			else f.foto_path
		end,
		encuadre = excluded.encuadre,
		autor_id = excluded.autor_id,
		actualizada_en = now()
	returning f.* into guardada;
	perform privado.apuntar(admin, 'ficha', privado.ficha_trio(guardada));
	return privado.ficha_trio(guardada);
end;
$$;

-- ───────────────────────── Permisos ─────────────────────────

revoke all on all tables in schema public from anon, authenticated;
revoke all on function
	privado.persona_del_trio(uuid),
	privado.ficha_trio(public.trio_fichas)
from public, anon, authenticated;
revoke all on function
	public.fichas_trio(text),
	public.admin_ficha(text),
	public.admin_guardar_ficha(text, integer, text, text, text[], text, text, text, boolean)
from public;
grant execute on function
	public.fichas_trio(text),
	public.admin_ficha(text),
	public.admin_guardar_ficha(text, integer, text, text, text[], text, text, text, boolean)
to anon, authenticated;
