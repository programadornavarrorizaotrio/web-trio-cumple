import type { Cromo } from '../cromos/tipos';
import { demoBuscar, demoRegistrar } from '../cromos/demo';
import { hayBD, rpc, rpcConClave } from '../../lib/rpc';

// Contrato con la base de datos (tareas de B). Si cambia algo aquí, avisar a quien lleve `supabase/`.

/** Fila de la RPC `buscar_invitados(texto)`: nunca devuelve fotos ni datos del cromo */
export interface Coincidencia {
	id: string;
	nombre: string;
	registrado: boolean;
}

/** Parámetros de la RPC `registrar(invitado_id, ...)`. La asistencia ya no se pide al registrarse (se confirma
 *  después en la portada), pero `registrar` la sigue aceptando. */
export interface DatosRegistro {
	apodo: string;
	frase: string | null;
	asiste?: boolean;
	acompanantes?: number;
	alergias?: string | null;
}

/** Respuesta de `registrar`: la clave de sesión y el cromo ya activado */
export interface Registro {
	clave: string;
	cromo: Cromo;
}

// PIN común de la fiesta (va en el mensaje de WhatsApp). Con base de datos lo valida el servidor (su hash está
// en `ajustes`); este solo vale para los datos de ejemplo, sin Supabase configurado.
export const PIN_DEMO = '1234';

// RPC `comprobar_pin(pin)`
export async function comprobarPin(pin: string): Promise<boolean> {
	if (hayBD) return rpc<boolean>('comprobar_pin', { pin: pin.trim() });
	return pin.trim() === PIN_DEMO;
}

// RPC `buscar_invitados(pin, texto)`. Sin PIN válido o con menos de 2 letras no devuelve nada.
export async function buscarInvitados(pin: string, texto: string): Promise<Coincidencia[]> {
	if (texto.trim().length < 2) return [];
	if (hayBD) return rpc<Coincidencia[]>('buscar_invitados', { pin: pin.trim(), texto: texto.trim() });
	if (!(await comprobarPin(pin))) return [];
	return demoBuscar(texto);
}

// RPC `registrar(pin, invitado_id, ...)`: guarda el cromo y la asistencia y devuelve la clave de sesión.
// Errores: 'pin', 'no-existe', 'ya-registrado', 'datos'.
export async function registrar(pin: string, id: string, datos: DatosRegistro): Promise<Registro> {
	if (hayBD) {
		return rpc<Registro>('registrar', {
			pin: pin.trim(),
			invitado_id: id,
			apodo: datos.apodo,
			frase: datos.frase,
			// Solo si se ha preguntado: sin ella, `registrar` no toca la asistencia
			...(datos.asiste === undefined ? {} : { asiste: datos.asiste, acompanantes: datos.acompanantes ?? 0, alergias: datos.alergias ?? null }),
		});
	}
	if (!(await comprobarPin(pin))) throw new Error('pin');
	return demoRegistrar(id, { apodo: datos.apodo, frase: datos.frase, asiste: datos.asiste });
}

// ───────────── Entrar en otro dispositivo ─────────────

/** Lo que devuelve `entrar_con_codigo`: una sesión nueva para este dispositivo */
export interface Entrada {
	clave: string;
	id: string;
	nombre: string;
}

/**
 * RPC `crear_codigo_acceso(clave)`: desde un dispositivo donde ya está dentro, un código de un solo uso
 * (10 minutos) para entrar en otro. Errores: 'sesion', 'demasiados'.
 */
export const crearCodigoAcceso = () => rpcConClave<{ codigo: string; caducaEn: string }>('crear_codigo_acceso');

/** RPC `entrar_con_codigo(pin, codigo)`. Errores: 'pin', 'codigo' (no existe, ya usado o caducado). */
export async function entrarConCodigo(pin: string, codigo: string): Promise<Entrada> {
	if (!hayBD) throw new Error('codigo');
	return rpc<Entrada>('entrar_con_codigo', { pin: pin.trim(), codigo });
}

// ───────────── Foto del cromo ─────────────

/** Proporción de la ilustración del cromo (ancho / alto, ver `.ilustracion` en Cromo.astro) */
const PROPORCION_FOTO = 85.4 / 53.2;

/**
 * Prepara la foto que elige el invitado: la gira según el EXIF, la recorta a la proporción del cromo (centrada en
 * horizontal y algo por encima del centro en vertical, que es donde suelen estar las caras) y la deja en 800 px
 * de ancho. WebP si el navegador sabe hacerlo; si no (Safari), JPEG. Nunca sale de 1 MB.
 */
export async function prepararFoto(archivo: File): Promise<Blob> {
	if (!archivo.type.startsWith('image/')) throw new Error('foto-tipo');
	const imagen = await createImageBitmap(archivo, { imageOrientation: 'from-image' });
	let ancho = imagen.width;
	let alto = Math.round(ancho / PROPORCION_FOTO);
	if (alto > imagen.height) {
		alto = imagen.height;
		ancho = Math.round(alto * PROPORCION_FOTO);
	}
	const x = Math.round((imagen.width - ancho) / 2);
	const y = Math.round((imagen.height - alto) * 0.3);
	const lienzo = document.createElement('canvas');
	lienzo.width = Math.min(800, ancho);
	lienzo.height = Math.round(lienzo.width / PROPORCION_FOTO);
	lienzo.getContext('2d')!.drawImage(imagen, x, y, ancho, alto, 0, 0, lienzo.width, lienzo.height);
	imagen.close();
	const aBlob = (tipo: string, calidad: number) => new Promise<Blob | null>((r) => lienzo.toBlob(r, tipo, calidad));
	let blob = await aBlob('image/webp', 0.82);
	if (!blob || blob.type !== 'image/webp') blob = await aBlob('image/jpeg', 0.85);
	if (!blob) throw new Error('foto-tipo');
	if (blob.size > 1024 * 1024) blob = (await aBlob(blob.type, 0.6)) ?? blob;
	return blob;
}

/**
 * Pide una reserva (`pedir_subida_foto`) y sube el archivo a Storage a esa ruta, que devuelve. Falta confirmarla
 * con la RPC que la use. Errores: 'sesion', 'demasiados', 'foto' (no se pudo subir).
 */
export async function subirImagen(blob: Blob): Promise<string> {
	const { ruta } = await rpcConClave<{ ruta: string }>('pedir_subida_foto');
	const { supabase } = await import('../../lib/supabase');
	const { error } = await supabase.storage.from('cromos').upload(ruta, blob, { contentType: blob.type, upsert: false });
	if (error) throw new Error('foto');
	return ruta;
}

/** Sube la foto del cromo del invitado con sesión y la confirma (`guardar_foto`). Devuelve el cromo con la foto ya puesta. */
export async function subirFoto(blob: Blob): Promise<Cromo> {
	return rpcConClave<Cromo>('guardar_foto', { ruta: await subirImagen(blob) });
}
