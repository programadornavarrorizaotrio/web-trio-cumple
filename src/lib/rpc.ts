// Llamadas a las RPC de Supabase. El navegador nunca toca tablas: solo estas funciones, que validan
// el PIN o la clave de sesión en el servidor (ver supabase/migrations/).
import { leerSesion } from '../components/registro/sesion';

/** Hay base de datos configurada (PUBLIC_SUPABASE_URL y PUBLIC_SUPABASE_ANON_KEY). Sin ella, la web usa los datos de ejemplo. */
export const hayBD = Boolean(import.meta.env.PUBLIC_SUPABASE_URL && import.meta.env.PUBLIC_SUPABASE_ANON_KEY);

/**
 * La clave de sesión si el invitado se ha registrado de verdad en la base de datos. Null si no hay BD, si no
 * se ha registrado o si su sesión es de los datos de ejemplo (las claves `demo…`): entonces se sigue con lo simulado.
 */
export function claveBD(): string | null {
	if (!hayBD) return null;
	const clave = leerSesion()?.clave;
	return clave && !clave.startsWith('demo') ? clave : null;
}

/** Hay que usar la base de datos para lo personal (álbum, asistencia, liga) */
export const usaBD = () => claveBD() !== null;

/**
 * Llama a una RPC. Los errores de negocio llegan como el código que lanza la función (`'sin-puntos'`,
 * `'ya-registrado'`…) en `Error.message`, igual que en los datos simulados.
 */
export async function rpc<T>(funcion: string, args: Record<string, unknown> = {}): Promise<T> {
	const { supabase } = await import('./supabase');
	const { data, error } = await supabase.rpc(funcion, args);
	if (error) throw new Error(error.message);
	return data as T;
}

/** RPC de las que necesitan sesión: le añade la clave. Falla con 'sesion' si no la hay. */
export function rpcConClave<T>(funcion: string, args: Record<string, unknown> = {}): Promise<T> {
	const clave = claveBD();
	if (!clave) return Promise.reject(new Error('sesion'));
	return rpc<T>(funcion, { clave, ...args });
}
