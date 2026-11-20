-- Foto del cromo: la sube cada invitado al registrarse.
--
-- El navegador nunca tiene permiso general para escribir en Storage (la clave anon es pública). En su lugar:
--   1. `pedir_subida_foto(clave)` reserva una ruta aleatoria de un solo uso, ligada al invitado y válida 10 min.
--   2. El navegador sube la imagen (ya recortada y en WebP) a `cromos/<ruta>`. La política de Storage solo deja
--      insertar en rutas reservadas, sin usar y sin caducar; el bucket solo acepta imágenes de hasta 1 MB.
--   3. `guardar_foto(clave, ruta)` comprueba que el archivo está subido, gasta la reserva y la pone en su cromo.
-- Los admins pueden quitar una foto con `admin_quitar_foto` (el archivo se queda en el bucket, sin usar).

-- Bucket público de lectura: las fotos se ven con su URL pública, como cualquier imagen de la web
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cromos', 'cromos', true, 1048576, array['image/webp', 'image/jpeg'])
on conflict (id) do nothing;

create table public.fotos_subidas (
	ruta text primary key,
	invitado_id uuid not null references public.invitados (id) on delete cascade,
	creada_en timestamptz not null default now(),
	caduca_en timestamptz not null,
	usada_en timestamptz
);
create index fotos_subidas_invitado_idx on public.fotos_subidas (invitado_id);
alter table public.fotos_subidas enable row level security;

-- La usa la política de Storage, que se evalúa con el rol del navegador (anon): por eso está en `public` con
-- permiso de ejecución. Solo responde sí/no para una ruta concreta, que es aleatoria e imposible de adivinar.
create function public.foto_subida_permitida(ruta text) returns boolean
language sql stable security definer
set search_path = ''
as $$
	select exists (
		select 1 from public.fotos_subidas f
		where f.ruta = foto_subida_permitida.ruta and f.usada_en is null and f.caduca_en > now()
	)
$$;

create policy "Subir la foto del cromo con una reserva" on storage.objects
for insert to anon, authenticated
with check (bucket_id = 'cromos' and public.foto_subida_permitida(name));

-- Devuelve {ruta}. Máximo 10 por hora. Errores: 'sesion', 'demasiados'.
create function public.pedir_subida_foto(clave text) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
	quien uuid := privado.invitado_de_clave(clave);
	ruta text := encode(extensions.gen_random_bytes(16), 'hex') || '.webp';
begin
	if (select count(*) from public.fotos_subidas f where f.invitado_id = quien and f.creada_en > now() - interval '1 hour') >= 10 then
		raise exception 'demasiados' using errcode = 'P0001';
	end if;
	insert into public.fotos_subidas (ruta, invitado_id, caduca_en) values (ruta, quien, now() + interval '10 minutes');
	return jsonb_build_object('ruta', ruta);
end;
$$;

-- Pone la foto subida en su cromo y devuelve el cromo. Errores: 'sesion', 'foto' (la ruta no es suya, ya se
-- usó, caducó o el archivo no llegó a subirse).
create function public.guardar_foto(clave text, ruta text) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
	quien uuid := privado.invitado_de_clave(clave);
	inv public.invitados;
begin
	update public.fotos_subidas f set usada_en = now()
	where f.ruta = guardar_foto.ruta and f.invitado_id = quien and f.usada_en is null
		and exists (select 1 from storage.objects o where o.bucket_id = 'cromos' and o.name = guardar_foto.ruta);
	if not found then
		raise exception 'foto' using errcode = 'P0001';
	end if;
	update public.invitados i set foto_path = guardar_foto.ruta where i.id = quien returning * into inv;
	return privado.cromo(inv);
end;
$$;

-- Admin: quitar la foto de un invitado (vuelve al monograma). Errores: 'sesion', 'no-admin', 'no-existe'.
create function public.admin_quitar_foto(clave text, invitado_id uuid) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
	admin uuid := privado.admin_de_clave(clave);
	antes text;
begin
	select i.foto_path into antes from public.invitados i where i.id = admin_quitar_foto.invitado_id;
	if not found then
		raise exception 'no-existe' using errcode = 'P0001';
	end if;
	update public.invitados i set foto_path = null where i.id = admin_quitar_foto.invitado_id;
	perform privado.apuntar(admin, 'quitar-foto', jsonb_build_object('invitado', invitado_id, 'ruta', antes));
end;
$$;

-- La lista del admin pasa a llevar la foto (para enseñarla y poder quitarla)
create or replace function public.admin_invitados(clave text) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
begin
	perform privado.admin_de_clave(clave);
	return coalesce((
		select jsonb_agg(jsonb_build_object(
			'id', i.id, 'numero', i.numero, 'nombre', i.nombre, 'apodo', i.apodo, 'frase', i.frase,
			'foto', i.foto_path,
			'rol', i.rol, 'especial', i.especial, 'visible', i.visible,
			'registrado', i.registrado_en is not null,
			'asiste', c.asiste, 'acompanantes', c.acompanantes, 'alergias', c.alergias,
			'equipo', j.equipo, 'puntos', case when j.invitado_id is null then null else privado.puntos(i.id) end
		) order by i.numero)
		from public.invitados i
		left join public.confirmaciones c on c.invitado_id = i.id
		left join public.liga_jugadores j on j.invitado_id = i.id
	), '[]'::jsonb);
end;
$$;

-- ───────────────────────── Permisos ─────────────────────────

revoke all on all tables in schema public from anon, authenticated;
revoke all on function
	public.foto_subida_permitida(text),
	public.pedir_subida_foto(text),
	public.guardar_foto(text, text),
	public.admin_quitar_foto(text, uuid)
from public;
grant execute on function
	public.foto_subida_permitida(text),
	public.pedir_subida_foto(text),
	public.guardar_foto(text, text),
	public.admin_quitar_foto(text, uuid)
to anon, authenticated;
