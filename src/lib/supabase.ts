import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.PUBLIC_SUPABASE_URL;
const anonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
	throw new Error('Faltan PUBLIC_SUPABASE_URL o PUBLIC_SUPABASE_ANON_KEY. Copia .env.example a .env y rellénalo.');
}

// Solo la clave anon: va al navegador, la seguridad la ponen las políticas RLS.
export const supabase = createClient(url, anonKey);
