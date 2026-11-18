-- Admin de los organizadores (los tres cumpleañeros, `invitados.rol = 'admin'`).
--
-- No hay cuentas aparte: un admin se registra en /registro como cualquier invitado y su clave de sesión le
-- abre estas RPC. Todas empiezan por `admin_`, reciben la clave y fallan con 'sesion' si no vale y con
-- 'no-admin' si no es de un admin. Lo que se cambia aquí queda apuntado en `admin_registro`.

-- ───────────────────────── Tablas ─────────────────────────

-- Palabras del Wordle del trío. Se juega una al día, en orden; `dia` se rellena la primera vez que sale.
create table public.wordle_palabras (
	id bigint generated always as identity primary key,
	palabra text not null unique check (palabra ~ '^[A-ZÑ]{4,8}$'),
	dia date unique,
	orden integer not null default 0,
	created_at timestamptz not null default now()
);

-- Qué ha hecho cada admin (para saber quién tocó qué)
create table public.admin_registro (
	id bigint generated always as identity primary key,
	admin_id uuid not null references public.invitados (id) on delete cascade,
	accion text not null,
	detalle jsonb,
	created_at timestamptz not null default now()
);

alter table public.wordle_palabras enable row level security;
alter table public.admin_registro enable row level security;

-- ───────────────────────── Funciones internas ─────────────────────────

-- El admin dueño de la clave. Errores: 'sesion', 'no-admin'.
create function privado.admin_de_clave(clave text) returns uuid
language plpgsql
set search_path = ''
as $$
declare
	quien uuid := privado.invitado_de_clave(clave);
begin
	if not privado.es_admin(quien) then
		raise exception 'no-admin' using errcode = 'P0001';
	end if;
	return quien;
end;
$$;

create function privado.apuntar(admin uuid, accion text, detalle jsonb) returns void
language sql
set search_path = ''
as $$ insert into public.admin_registro (admin_id, accion, detalle) values (admin, accion, detalle) $$;

-- ───────────────────────── RPC: resumen e invitados ─────────────────────────

-- Lo que hay que saber de un vistazo: asistencia, personas, alergias, liga y premios por entregar.
create function public.admin_resumen(clave text) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
begin
	perform privado.admin_de_clave(clave);
	return jsonb_build_object(
		'invitados', (select count(*) from public.invitados where visible),
		'registrados', (select count(*) from public.invitados where visible and registrado_en is not null),
		'vienen', (select count(*) from public.confirmaciones c join public.invitados i on i.id = c.invitado_id where i.visible and c.asiste),
		'noVienen', (select count(*) from public.confirmaciones c join public.invitados i on i.id = c.invitado_id where i.visible and not c.asiste),
		'personas', (select coalesce(sum(1 + c.acompanantes), 0) from public.confirmaciones c join public.invitados i on i.id = c.invitado_id where i.visible and c.asiste),
		'alergias', coalesce((select jsonb_agg(jsonb_build_object('nombre', i.nombre, 'alergias', c.alergias) order by i.nombre)
			from public.confirmaciones c join public.invitados i on i.id = c.invitado_id
			where i.visible and c.asiste and c.alergias is not null), '[]'::jsonb),
		'jugadores', (select count(*) from public.liga_jugadores),
		'equipos', coalesce((select jsonb_agg(jsonb_build_object('equipo', m.equipo, 'puntos', m.puntos, 'miembros', m.miembros)) from privado.marcador() m), '[]'::jsonb),
		'premiosPorEntregar', (select count(*) from public.premios_codigos where entregado_en is null),
		'ligaCerrada', privado.liga_cerrada()
	);
end;
$$;

-- Todos los invitados (también los ocultos) con su asistencia y su liga
create function public.admin_invitados(clave text) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
begin
	perform privado.admin_de_clave(clave);
	return coalesce((
		select jsonb_agg(jsonb_build_object(
			'id', i.id, 'numero', i.numero, 'nombre', i.nombre, 'apodo', i.apodo, 'frase', i.frase,
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

-- Crea (id null) o edita un invitado. Sin número, va al final del álbum.
-- Errores: 'datos', 'numero-repetido', 'no-existe'.
create function public.admin_guardar_invitado(
	clave text,
	id uuid,
	nombre text,
	numero integer default null,
	especial boolean default false,
	visible boolean default true
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
	admin uuid := privado.admin_de_clave(clave);
	inv public.invitados;
begin
	if length(trim(coalesce(nombre, ''))) = 0 or length(nombre) > 80 or (numero is not null and numero < 1) then
		raise exception 'datos' using errcode = 'P0001';
	end if;
	if numero is not null and exists (select 1 from public.invitados x where x.numero = admin_guardar_invitado.numero
		and x.id is distinct from admin_guardar_invitado.id) then
		raise exception 'numero-repetido' using errcode = 'P0001';
	end if;

	if id is null then
		insert into public.invitados (numero, nombre, especial, visible)
		values (coalesce(numero, (select coalesce(max(x.numero), 0) + 1 from public.invitados x)), trim(nombre),
			coalesce(especial, false), coalesce(visible, true))
		returning * into inv;
	else
		update public.invitados x
		set nombre = trim(admin_guardar_invitado.nombre),
			numero = coalesce(admin_guardar_invitado.numero, x.numero),
			especial = coalesce(admin_guardar_invitado.especial, x.especial),
			visible = coalesce(admin_guardar_invitado.visible, x.visible)
		where x.id = admin_guardar_invitado.id
		returning * into inv;
		if not found then
			raise exception 'no-existe' using errcode = 'P0001';
		end if;
	end if;

	perform privado.apuntar(admin, case when id is null then 'crear-invitado' else 'editar-invitado' end,
		jsonb_build_object('id', inv.id, 'nombre', inv.nombre, 'numero', inv.numero, 'visible', inv.visible));
	return jsonb_build_object('id', inv.id, 'numero', inv.numero);
end;
$$;

-- "Cambió de móvil": cierra sus sesiones y deja que se vuelva a registrar. Conserva su asistencia, su
-- equipo y sus puntos. Errores: 'no-existe'.
create function public.admin_nuevo_movil(clave text, invitado_id uuid) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
	admin uuid := privado.admin_de_clave(clave);
begin
	update public.invitados i set registrado_en = null where i.id = admin_nuevo_movil.invitado_id;
	if not found then
		raise exception 'no-existe' using errcode = 'P0001';
	end if;
	update public.sesiones s set revocada_en = now() where s.invitado_id = admin_nuevo_movil.invitado_id and s.revocada_en is null;
	perform privado.apuntar(admin, 'nuevo-movil', jsonb_build_object('id', invitado_id));
end;
$$;

-- ───────────────────────── RPC: premios ─────────────────────────

-- Los premios con cuántos se han conseguido y entregado
create function public.admin_premios(clave text) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
begin
	perform privado.admin_de_clave(clave);
	return coalesce((
		select jsonb_agg(jsonb_build_object(
			'id', p.id, 'titulo', p.titulo, 'descripcion', p.descripcion, 'requisito', p.requisito, 'activo', p.activo,
			'conseguidos', (select count(*) from public.premios_codigos pc where pc.premio_id = p.id),
			'entregados', (select count(*) from public.premios_codigos pc where pc.premio_id = p.id and pc.entregado_en is not null)
		) order by p.orden)
		from public.premios p
	), '[]'::jsonb);
end;
$$;

-- Cambia el texto de un premio (el requisito no). Errores: 'datos', 'no-existe'.
create function public.admin_guardar_premio(clave text, id text, titulo text, descripcion text, activo boolean default true)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
	admin uuid := privado.admin_de_clave(clave);
begin
	if length(trim(coalesce(titulo, ''))) = 0 or length(titulo) > 60 or length(descripcion) > 300 then
		raise exception 'datos' using errcode = 'P0001';
	end if;
	update public.premios p
	set titulo = trim(admin_guardar_premio.titulo),
		descripcion = coalesce(trim(admin_guardar_premio.descripcion), ''),
		activo = coalesce(admin_guardar_premio.activo, p.activo)
	where p.id = admin_guardar_premio.id;
	if not found then
		raise exception 'no-existe' using errcode = 'P0001';
	end if;
	perform privado.apuntar(admin, 'editar-premio', jsonb_build_object('id', id, 'titulo', titulo));
end;
$$;

-- Busca un código de premio de los que enseñan los invitados en la fiesta. Errores: 'no-existe'.
create function public.admin_buscar_codigo(clave text, codigo text) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
	res jsonb;
begin
	perform privado.admin_de_clave(clave);
	select jsonb_build_object(
		'codigo', pc.codigo, 'premio', p.titulo, 'nombre', i.nombre, 'apodo', i.apodo,
		'entregado', pc.entregado_en is not null, 'entregadoEn', pc.entregado_en
	) into res
	from public.premios_codigos pc
	join public.premios p on p.id = pc.premio_id
	join public.invitados i on i.id = pc.invitado_id
	where pc.codigo = upper(trim(admin_buscar_codigo.codigo));
	if res is null then
		raise exception 'no-existe' using errcode = 'P0001';
	end if;
	return res;
end;
$$;

-- Marca un premio como entregado. Errores: 'no-existe', 'ya-entregado'.
create function public.admin_entregar_premio(clave text, codigo text) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
	admin uuid := privado.admin_de_clave(clave);
	pc public.premios_codigos;
begin
	select * into pc from public.premios_codigos x where x.codigo = upper(trim(admin_entregar_premio.codigo)) for update;
	if not found then
		raise exception 'no-existe' using errcode = 'P0001';
	end if;
	if pc.entregado_en is not null then
		raise exception 'ya-entregado' using errcode = 'P0001';
	end if;
	update public.premios_codigos x set entregado_en = now() where x.codigo = pc.codigo;
	perform privado.apuntar(admin, 'entregar-premio', jsonb_build_object('codigo', pc.codigo, 'premio', pc.premio_id, 'invitado', pc.invitado_id));
end;
$$;

-- ───────────────────────── RPC: liga ─────────────────────────

-- Suma o quita puntos a mano (un error, un premio de la fiesta…). Queda como movimiento 'ajuste'.
-- Errores: 'datos', 'sin-equipo' (solo se puede a quien ya juega la liga).
create function public.admin_ajustar_puntos(clave text, invitado_id uuid, puntos integer, motivo text) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
	admin uuid := privado.admin_de_clave(clave);
begin
	if puntos is null or puntos = 0 or abs(puntos) > 500 or length(trim(coalesce(motivo, ''))) = 0 or length(motivo) > 140 then
		raise exception 'datos' using errcode = 'P0001';
	end if;
	if not exists (select 1 from public.liga_jugadores j where j.invitado_id = admin_ajustar_puntos.invitado_id) then
		raise exception 'sin-equipo' using errcode = 'P0001';
	end if;
	insert into public.liga_movimientos (invitado_id, dia, tipo, puntos, detalle)
	values (invitado_id, privado.hoy(), 'ajuste', puntos, jsonb_build_object('motivo', trim(motivo), 'admin', admin));
	perform privado.apuntar(admin, 'ajustar-puntos', jsonb_build_object('invitado', invitado_id, 'puntos', puntos, 'motivo', trim(motivo)));
	return jsonb_build_object('puntos', privado.puntos(invitado_id));
end;
$$;

-- Ajustes que se pueden tocar desde el admin. Las fichas y la apuesta máxima del casino no, porque la web
-- también las tiene fijas (CONFIG en liga.ts).
create function public.admin_ajustes(clave text) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
	liga jsonb;
begin
	perform privado.admin_de_clave(clave);
	liga := privado.ajuste('liga');
	return jsonb_build_object(
		'tiradasEntreSemana', liga -> 'tiradas_entre_semana',
		'tiradasFinDeSemana', liga -> 'tiradas_fin_de_semana',
		'penalizacionDiablo', liga -> 'penalizacion_diablo',
		'cierreLiga', privado.ajuste('liga_cierre') #>> '{}'
	);
end;
$$;

-- Errores: 'datos'.
create function public.admin_guardar_ajustes(
	clave text,
	tiradas_entre_semana integer,
	tiradas_fin_de_semana integer,
	penalizacion_diablo integer,
	cierre_liga timestamptz
) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
	admin uuid := privado.admin_de_clave(clave);
begin
	if tiradas_entre_semana not between 0 and 10 or tiradas_fin_de_semana not between 0 and 10
		or penalizacion_diablo not between 0 and 100 or cierre_liga is null then
		raise exception 'datos' using errcode = 'P0001';
	end if;
	update public.ajustes
	set valor = valor || jsonb_build_object(
			'tiradas_entre_semana', tiradas_entre_semana,
			'tiradas_fin_de_semana', tiradas_fin_de_semana,
			'penalizacion_diablo', penalizacion_diablo),
		updated_at = now()
	where ajustes.clave = 'liga';
	update public.ajustes set valor = to_jsonb(cierre_liga), updated_at = now() where ajustes.clave = 'liga_cierre';
	perform privado.apuntar(admin, 'ajustes-liga', jsonb_build_object(
		'tiradas_entre_semana', tiradas_entre_semana, 'tiradas_fin_de_semana', tiradas_fin_de_semana,
		'penalizacion_diablo', penalizacion_diablo, 'cierre_liga', cierre_liga));
end;
$$;

-- Cambia el PIN de la fiesta (el que va en el mensaje de WhatsApp). Errores: 'datos'.
create function public.admin_cambiar_pin(clave text, pin text) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
	admin uuid := privado.admin_de_clave(clave);
begin
	if length(trim(coalesce(pin, ''))) not between 4 and 20 then
		raise exception 'datos' using errcode = 'P0001';
	end if;
	insert into public.ajustes (clave, valor, descripcion)
	values ('pin_hash', to_jsonb(privado.hash(trim(pin))), 'Hash del PIN de la fiesta')
	on conflict on constraint ajustes_pkey do update set valor = excluded.valor, updated_at = now();
	perform privado.apuntar(admin, 'cambiar-pin', null);
end;
$$;

-- ───────────────────────── RPC: Wordle ─────────────────────────

create function public.admin_wordle(clave text) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
begin
	perform privado.admin_de_clave(clave);
	return coalesce((
		select jsonb_agg(jsonb_build_object('id', w.id, 'palabra', w.palabra, 'dia', w.dia) order by w.orden, w.id)
		from public.wordle_palabras w
	), '[]'::jsonb);
end;
$$;

-- Añade palabras (se pasan a mayúsculas y sin tildes; la Ñ se queda). Las repetidas se ignoran.
-- Devuelve cuántas se han añadido. Errores: 'datos' (alguna no es de 4 a 8 letras).
create function public.admin_anadir_wordle(clave text, palabras text[]) returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
	admin uuid := privado.admin_de_clave(clave);
	limpias text[];
	n integer;
	siguiente integer;
begin
	select array_agg(distinct upper(translate(trim(p), 'áéíóúüÁÉÍÓÚÜ', 'aeiouuAEIOUU')))
	into limpias
	from unnest(palabras) p
	where length(trim(p)) > 0;
	if limpias is null or exists (select 1 from unnest(limpias) p where p !~ '^[A-ZÑ]{4,8}$') then
		raise exception 'datos' using errcode = 'P0001';
	end if;
	select coalesce(max(orden), 0) into siguiente from public.wordle_palabras;
	insert into public.wordle_palabras (palabra, orden)
	select p, siguiente + row_number() over (order by p) from unnest(limpias) p
	on conflict (palabra) do nothing;
	get diagnostics n = row_count;
	perform privado.apuntar(admin, 'anadir-wordle', jsonb_build_object('cuantas', n));
	return n;
end;
$$;

-- Borra una palabra que aún no ha salido. Errores: 'no-existe', 'ya-salio'.
create function public.admin_borrar_wordle(clave text, id bigint) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
	admin uuid := privado.admin_de_clave(clave);
	w public.wordle_palabras;
begin
	select * into w from public.wordle_palabras x where x.id = admin_borrar_wordle.id;
	if not found then
		raise exception 'no-existe' using errcode = 'P0001';
	end if;
	if w.dia is not null and w.dia <= privado.hoy() then
		raise exception 'ya-salio' using errcode = 'P0001';
	end if;
	delete from public.wordle_palabras x where x.id = w.id;
	perform privado.apuntar(admin, 'borrar-wordle', jsonb_build_object('palabra', w.palabra));
end;
$$;

-- ───────────────────────── Permisos ─────────────────────────

revoke all on all tables in schema public from anon, authenticated;
revoke all on function
	privado.admin_de_clave(text),
	privado.apuntar(uuid, text, jsonb)
from public, anon, authenticated;
revoke all on function
	public.admin_resumen(text),
	public.admin_invitados(text),
	public.admin_guardar_invitado(text, uuid, text, integer, boolean, boolean),
	public.admin_nuevo_movil(text, uuid),
	public.admin_premios(text),
	public.admin_guardar_premio(text, text, text, text, boolean),
	public.admin_buscar_codigo(text, text),
	public.admin_entregar_premio(text, text),
	public.admin_ajustar_puntos(text, uuid, integer, text),
	public.admin_ajustes(text),
	public.admin_guardar_ajustes(text, integer, integer, integer, timestamptz),
	public.admin_cambiar_pin(text, text),
	public.admin_wordle(text),
	public.admin_anadir_wordle(text, text[]),
	public.admin_borrar_wordle(text, bigint)
from public;

grant execute on function
	public.admin_resumen(text),
	public.admin_invitados(text),
	public.admin_guardar_invitado(text, uuid, text, integer, boolean, boolean),
	public.admin_nuevo_movil(text, uuid),
	public.admin_premios(text),
	public.admin_guardar_premio(text, text, text, text, boolean),
	public.admin_buscar_codigo(text, text),
	public.admin_entregar_premio(text, text),
	public.admin_ajustar_puntos(text, uuid, integer, text),
	public.admin_ajustes(text),
	public.admin_guardar_ajustes(text, integer, integer, integer, timestamptz),
	public.admin_cambiar_pin(text, text),
	public.admin_wordle(text),
	public.admin_anadir_wordle(text, text[]),
	public.admin_borrar_wordle(text, bigint)
to anon, authenticated;

-- Vista para el panel: últimos cambios de los admins
create view privado.v_admin_registro as
select r.created_at, i.nombre as admin, r.accion, r.detalle
from public.admin_registro r
join public.invitados i on i.id = r.admin_id
order by r.created_at desc;
