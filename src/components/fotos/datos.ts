// Contrato con la base de datos (tareas B6 y B7). Si cambia algo aquí, avisar a quien lleve `supabase/`.
import { obtenerAlbum } from '../cromos/datos';
import { leerSesion, EXIGIR_REGISTRO } from '../registro/sesion';

/** Perfil con el que se publica: la foto y el nombre de su cromo, que cada invitado puede cambiar */
export interface Perfil {
	id: string;
	nombre: string;
	/** URL de la foto del cromo, o null si no tiene */
	foto: string | null;
}

export interface Foto {
	id: string;
	/** URL de la imagen (firmada o pública) */
	url: string;
	/** Pie de foto que escribe quien la sube (puede ir vacío) */
	descripcion: string;
	/** Fecha de subida, ISO */
	creada: string;
	autor: Perfil;
}

export const MAX_DESCRIPCION = 140;

// TODO(B6): sale del perfil del invitado (`listar_cromos` o una RPC `mi_perfil(clave)`).
// En modo pruebas, sin sesión, se publica como uno de los cumpleañeros (ya tienen foto y cromo).
export async function perfilActual(): Promise<Perfil> {
	const yo = leerSesion() ?? (EXIGIR_REGISTRO ? null : { id: 'pencho', nombre: 'Pencho' });
	const cromo = yo ? (await obtenerAlbum()).cromos.find((c) => c.id === yo.id) : undefined;
	return {
		id: yo?.id ?? 'anonimo',
		nombre: cromo?.apodo || yo?.nombre || 'Invitado',
		foto: cromo?.foto ?? null,
	};
}

// --- Modo demo: fotos de ejemplo de la página + las subidas en esta sesión (se pierden al recargar) ---
const subidas: Foto[] = [];

function ejemplo(): Foto[] {
	const json = document.getElementById('fotos-galeria-demo')?.textContent;
	const fotos: (Omit<Foto, 'creada'> & { minutos: number })[] = json ? JSON.parse(json) : [];
	return fotos.map(({ minutos, ...f }) => ({ ...f, creada: new Date(Date.now() - minutos * 60_000).toISOString() }));
}

/** Foto de cromo de cada autor de ejemplo (FotosDemo.astro de cromos) */
function conAvatar(f: Foto): Foto {
	const fotos: Record<string, string> = JSON.parse(document.getElementById('fotos-demo')?.textContent ?? '{}');
	return { ...f, autor: { ...f.autor, foto: f.autor.foto ?? fotos[f.autor.id] ?? null } };
}

// TODO(B7): RPC `listar_fotos(clave)`: solo las visibles, de la más nueva a la más antigua, con el perfil del autor.
export async function listarFotos(): Promise<Foto[]> {
	const [nueva, ...resto] = ejemplo().map(conAvatar);
	// La primera de ejemplo la "sube alguien" a los pocos segundos (ver escucharFotos)
	return [...subidas, ...(nueva ? resto : [])];
}

// TODO(B7): Supabase Realtime sobre la tabla de fotos (INSERT de fotos visibles). Devuelve cómo dejar de escuchar.
export function escucharFotos(alLlegar: (foto: Foto) => void): () => void {
	const [nueva] = ejemplo().map(conAvatar);
	if (!nueva) return () => {};
	const t = setTimeout(() => alLlegar({ ...nueva, creada: new Date().toISOString() }), 8000);
	return () => clearTimeout(t);
}

// TODO(B6): pedir una URL de subida a la Edge Function `subir-foto` (valida la clave, la ventana de fechas
// y que la descripción no pase de MAX_DESCRIPCION) y hacer PUT del blob. De momento solo la enseña en el muro.
export async function subirFoto(imagen: Blob, descripcion: string, autor: Perfil): Promise<Foto> {
	await new Promise((r) => setTimeout(r, 500));
	const foto: Foto = {
		id: `local-${Date.now()}-${subidas.length}`,
		url: URL.createObjectURL(imagen),
		descripcion: descripcion.trim().slice(0, MAX_DESCRIPCION),
		creada: new Date().toISOString(),
		autor,
	};
	subidas.unshift(foto);
	return foto;
}

// TODO(B6): RPC `borrar_foto(clave, id)`: solo si la subió ese invitado (o un organizador). Borra la fila y el archivo.
export async function borrarFoto(id: string): Promise<void> {
	await new Promise((r) => setTimeout(r, 300));
	const i = subidas.findIndex((f) => f.id === id);
	if (i >= 0) subidas.splice(i, 1);
}
