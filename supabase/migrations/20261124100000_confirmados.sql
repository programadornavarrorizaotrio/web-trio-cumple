-- Nombres del cartel de /canciones: solo quien ha dicho que viene. Los tres cumpleañeros no van en la lista
-- (en el cartel salen con su foto). Devuelve únicamente el nombre: ni alergias ni acompañantes.
-- Contrato con el navegador: src/components/spotify/datos.ts

create function public.listar_confirmados(clave text) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
begin
	perform privado.invitado_de_clave(clave);
	return coalesce((
		select jsonb_agg(i.nombre order by i.nombre)
		from public.invitados i
		join public.confirmaciones c on c.invitado_id = i.id
		where i.visible and not i.especial and c.asiste
	), '[]'::jsonb);
end;
$$;

-- Supabase da EXECUTE a anon en cada función nueva de `public`: se quita y se da explícitamente.
revoke all on function public.listar_confirmados(text) from public, anon, authenticated;
grant execute on function public.listar_confirmados(text) to anon, authenticated;
