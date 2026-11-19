-- El registro ya no pregunta si vienes: la asistencia se confirma después, en la portada (`confirmar_asistencia`).
--
-- `registrar` pasa a tener `asiste` opcional. Si llega null no se toca `confirmaciones`: quien aún no ha respondido
-- sale como "sin responder", y quien vuelve a registrarse tras un "Nuevo móvil" conserva lo que ya había dicho.
-- La firma no cambia (mismos parámetros y tipos), así que se mantienen los permisos y las llamadas antiguas valen.

create or replace function public.registrar(
	pin text,
	invitado_id uuid,
	apodo text,
	frase text,
	asiste boolean default null,
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
		or coalesce(acompanantes, 0) not between 0 and 5 or length(alergias) > 300 then
		raise exception 'datos' using errcode = 'P0001';
	end if;

	update public.invitados i
	set apodo = trim(registrar.apodo),
		frase = nullif(trim(registrar.frase), ''),
		registrado_en = now()
	where i.id = inv.id
	returning * into inv;

	if asiste is not null then
		insert into public.confirmaciones (invitado_id, asiste, acompanantes, alergias)
		values (inv.id, asiste, coalesce(acompanantes, 0), nullif(trim(alergias), ''))
		on conflict on constraint confirmaciones_pkey do update
		set asiste = excluded.asiste, acompanantes = excluded.acompanantes, alergias = excluded.alergias, updated_at = now();
	end if;

	clave := encode(extensions.gen_random_bytes(24), 'hex');
	insert into public.sesiones (invitado_id, hash) values (inv.id, privado.hash(clave));

	return jsonb_build_object('clave', clave, 'cromo', privado.cromo(inv));
end;
$$;
