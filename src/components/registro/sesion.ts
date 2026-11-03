// Sesión del invitado en el navegador. La `clave` la devuelve la RPC `registrar` y se manda
// en todas las demás RPC. TODO(B2): mover a src/lib/ junto al cliente de Supabase.
export const CLAVE_SESION = 'trio-sesion';

/** Registro obligatorio apagado mientras probamos. Para activarlo: PUBLIC_EXIGIR_REGISTRO=true en .env / Vercel */
export const EXIGIR_REGISTRO = import.meta.env.PUBLIC_EXIGIR_REGISTRO === 'true';

export interface Sesion {
	clave: string;
	id: string;
	nombre: string;
}

export function leerSesion(): Sesion | null {
	try {
		const guardada = localStorage.getItem(CLAVE_SESION);
		return guardada ? (JSON.parse(guardada) as Sesion) : null;
	} catch {
		return null;
	}
}

export function guardarSesion(sesion: Sesion) {
	localStorage.setItem(CLAVE_SESION, JSON.stringify(sesion));
}

export function borrarSesion() {
	try {
		localStorage.removeItem(CLAVE_SESION);
	} catch {
		// sin almacenamiento: no hay nada que borrar
	}
}

/** Invitado con el que pintar las secciones personales. En modo pruebas, sin sesión, usa uno de ejemplo. */
export function invitadoActual(): Sesion | null {
	return leerSesion() ?? (EXIGIR_REGISTRO ? null : { clave: 'demo', id: 'd4', nombre: 'Marta López' });
}
