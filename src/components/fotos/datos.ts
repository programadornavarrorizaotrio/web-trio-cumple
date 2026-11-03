// Contrato con la base de datos (tareas B6 y B7). Si cambia algo aquí, avisar a quien lleve `supabase/`.
export interface Foto {
	id: string;
	/** URL de la imagen (firmada o pública) */
	url: string;
	/** Nombre de quien la subió */
	autor: string;
}

// Fotos subidas en esta sesión (solo modo demo: se pierden al recargar)
const subidas: Foto[] = [];

// TODO(B7): RPC `listar_fotos(clave)`: solo las visibles, de la más nueva a la más antigua.
export async function listarFotos(): Promise<Foto[]> {
	const json = document.getElementById('fotos-galeria-demo')?.textContent;
	const ejemplo: Foto[] = json ? JSON.parse(json) : [];
	return [...subidas, ...ejemplo];
}

// TODO(B6): pedir una URL de subida a la Edge Function `subir-foto` (valida la clave y la ventana
// de fechas) y hacer PUT del blob. De momento solo la enseña en la galería.
export async function subirFoto(imagen: Blob, autor: string): Promise<Foto> {
	await new Promise((r) => setTimeout(r, 400));
	const foto = { id: `local-${Date.now()}-${subidas.length}`, url: URL.createObjectURL(imagen), autor };
	subidas.unshift(foto);
	return foto;
}
