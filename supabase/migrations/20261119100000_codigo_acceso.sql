-- Entrar en otro dispositivo con un código de un solo uso.
--
-- Cada nombre se registra una vez. Para abrir la web en otro móvil u ordenador sin cerrar la sesión del
-- primero, desde el dispositivo donde ya se está dentro se pide un código (`crear_codigo_acceso`) y en el
-- nuevo se escribe junto al PIN de la fiesta (`entrar_con_codigo`). El nuevo recibe su propia sesión: los
-- dos siguen conectados. Solo puede sacar un código quien ya tiene la sesión del invitado.
--
-- El código: 6 caracteres sin los que se confunden (0/O, 1/I/L), válido 10 minutos y un solo uso. Solo se
-- guarda su hash. Pedir uno nuevo anula los anteriores sin usar.

create table public.codigos_acceso (
	hash text primary key,
	invitado_id uuid not null references public.invitados (id) on delete cascade,
	creado_en timestamptz not null default now(),
	caduca_en timestamptz not null,
	usado_en timestamptz
);
create index codigos_acceso_invitado_idx on public.codigos_acceso (invitado_id);

alter table public.codigos_acceso enable row level security;

-- 'k7p4qx', 'K7P-4QX' y ' k7p 4qx ' son el mismo código
create function privado.normalizar_codigo(codigo text) returns text
language sql immutable
set search_path = ''
as $$ select upper(regexp_replace(coalesce(codigo, ''), '[^A-Za-z0-9]', '', 'g')) $$;

-- Devuelve {codigo: 'K7P-4QX', caducaEn}. Máximo 10 códigos por hora. Errores: 'sesion', 'demasiados'.
create function public.crear_codigo_acceso(clave text) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
	quien uuid := privado.invitado_de_clave(clave);
	letras text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
	bytes bytea := extensions.gen_random_bytes(6);
	codigo text := '';
	caduca timestamptz := now() + interval '10 minutes';
begin
	if (select count(*) from public.codigos_acceso c where c.invitado_id = quien and c.creado_en > now() - interval '1 hour') >= 10 then
		raise exception 'demasiados' using errcode = 'P0001';
	end if;
	for i in 0..5 loop
		codigo := codigo || substr(letras, 1 + get_byte(bytes, i) % length(letras), 1);
	end loop;

	-- Solo vale el último: los anteriores sin usar caducan ya
	update public.codigos_acceso c set caduca_en = now()
	where c.invitado_id = quien and c.usado_en is null and c.caduca_en > now();
	insert into public.codigos_acceso (hash, invitado_id, caduca_en) values (privado.hash(codigo), quien, caduca);

	return jsonb_build_object('codigo', substr(codigo, 1, 3) || '-' || substr(codigo, 4, 3), 'caducaEn', caduca);
end;
$$;

-- Devuelve {clave, id, nombre} como `registrar`, pero sin tocar sus datos. Errores: 'pin', 'codigo'
-- (no existe, ya usado o caducado: no se distingue para no dar pistas).
create function public.entrar_con_codigo(pin text, codigo text) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
	c public.codigos_acceso;
	inv public.invitados;
	clave text;
begin
	if not privado.pin_valido(pin) then
		raise exception 'pin' using errcode = 'P0001';
	end if;
	select * into c from public.codigos_acceso x
	where x.hash = privado.hash(privado.normalizar_codigo(codigo)) and x.usado_en is null and x.caduca_en > now()
	for update;
	if not found then
		raise exception 'codigo' using errcode = 'P0001';
	end if;
	select * into inv from public.invitados i where i.id = c.invitado_id and i.visible and i.registrado_en is not null;
	if not found then
		raise exception 'codigo' using errcode = 'P0001';
	end if;

	update public.codigos_acceso x set usado_en = now() where x.hash = c.hash;
	clave := encode(extensions.gen_random_bytes(24), 'hex');
	insert into public.sesiones (invitado_id, hash) values (inv.id, privado.hash(clave));

	return jsonb_build_object('clave', clave, 'id', inv.id, 'nombre', inv.nombre);
end;
$$;

-- ───────────────────────── Permisos ─────────────────────────

revoke all on all tables in schema public from anon, authenticated;
revoke all on function privado.normalizar_codigo(text) from public, anon, authenticated;
revoke all on function public.crear_codigo_acceso(text), public.entrar_con_codigo(text, text) from public;
grant execute on function public.crear_codigo_acceso(text), public.entrar_con_codigo(text, text) to anon, authenticated;
