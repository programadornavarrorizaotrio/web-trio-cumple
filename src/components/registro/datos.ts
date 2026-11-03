import type { Cromo } from '../cromos/tipos';
import { demoBuscar, demoRegistrar } from '../cromos/demo';

// Contrato con la base de datos (tareas de B). Si cambia algo aquí, avisar a quien lleve `supabase/`.

/** Fila de la RPC `buscar_invitados(texto)`: nunca devuelve fotos ni datos del cromo */
export interface Coincidencia {
	id: string;
	nombre: string;
	registrado: boolean;
}

/** Parámetros de la RPC `registrar(invitado_id, ...)` */
export interface DatosRegistro {
	apodo: string;
	frase: string | null;
	asiste: boolean;
	acompanantes: number;
	alergias: string | null;
}

/** Respuesta de `registrar`: la clave de sesión y el cromo ya activado */
export interface Registro {
	clave: string;
	cromo: Cromo;
}

// PIN común de la fiesta (va en el mensaje de WhatsApp). Lo valida la base de datos: no puede
// estar en el código de la web. Todas las RPC públicas lo reciben.
export const PIN_DEMO = '1234';

// TODO(B): RPC `comprobar_pin(pin)`; el PIN real vive como secreto en Supabase, no en el repo.
export async function comprobarPin(pin: string): Promise<boolean> {
	return pin.trim() === PIN_DEMO;
}

// TODO(B): RPC `buscar_invitados(pin, texto)`. Sin PIN válido no devuelve nada.
export async function buscarInvitados(pin: string, texto: string): Promise<Coincidencia[]> {
	if (texto.trim().length < 2 || !(await comprobarPin(pin))) return [];
	return demoBuscar(texto);
}

// TODO(B): RPC `registrar(pin, invitado_id, ...)`. Debe fallar con PIN incorrecto o si ya estaba registrado.
export async function registrar(pin: string, id: string, datos: DatosRegistro): Promise<Registro> {
	if (!(await comprobarPin(pin))) throw new Error('pin');
	return demoRegistrar(id, { apodo: datos.apodo, frase: datos.frase });
}
