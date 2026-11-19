-- Datos de DESARROLLO (solo para trio-dev o Supabase local con `npx supabase db reset`).
-- Nombres inventados: la lista real de invitados vive en private/ y nunca va al repo.
-- PIN de pruebas: 1234 (el de la fiesta se pone a mano en producción, ver privado.pin_valido).

insert into public.ajustes (clave, valor, descripcion)
values ('pin_hash', to_jsonb(privado.hash('1234')), 'Hash del PIN de la fiesta')
on conflict (clave) do update set valor = excluded.valor, updated_at = now();

insert into public.invitados (numero, nombre, especial, rol) values
	(1, 'Pencho', true, 'admin'),
	(2, 'Fran', true, 'admin'),
	(3, 'Juan', true, 'admin'),
	(4, 'Marta López', false, 'invitado'),
	(5, 'Sergio Gil', false, 'invitado'),
	(6, 'Lucía Martín', false, 'invitado'),
	(7, 'Carlos Ruiz', false, 'invitado'),
	(8, 'Paula Sanz', false, 'invitado')
on conflict (numero) do nothing;
