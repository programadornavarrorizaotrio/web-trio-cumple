// Propuestas de canciones para quien no usa Spotify.
// Contrato con la base de datos (tarea B7): RPC `proponer_cancion(clave, titulo, artista)`
// y `mis_canciones(clave)`. El límite lo tiene que comprobar también la RPC.
export const MAX_CANCIONES = 4;

export interface Cancion {
	titulo: string;
	artista: string;
}

const CLAVE_DEMO = 'trio-demo-canciones';

function leerDemo(): Cancion[] {
	try {
		return JSON.parse(localStorage.getItem(CLAVE_DEMO) ?? '[]');
	} catch {
		return [];
	}
}

// TODO(B7): RPC `mis_canciones(clave)`.
export async function misCanciones(): Promise<Cancion[]> {
	return leerDemo();
}

// TODO(B7): RPC `proponer_cancion(clave, titulo, artista)`. Debe fallar al pasar de MAX_CANCIONES.
export async function proponerCancion(cancion: Cancion): Promise<Cancion[]> {
	const lista = leerDemo();
	if (lista.length >= MAX_CANCIONES) throw new Error('limite');
	const nueva = [...lista, cancion];
	localStorage.setItem(CLAVE_DEMO, JSON.stringify(nueva));
	return nueva;
}
