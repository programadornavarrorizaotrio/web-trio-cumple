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

// Grupos de invitados del cartel de /canciones: de dónde viene cada uno.
export const GRUPOS = [
	['cartageneros', 'Cartageneros'],
	['bioquimicos', 'Bioquímicos'],
	['popurri', 'Popurrí'],
	['totaneros', 'Totaneros'],
] as const;

export type Grupo = (typeof GRUPOS)[number][0];

export interface Confirmado {
	nombre: string;
	grupo: Grupo;
}

// Invitados que han confirmado asistencia, con su grupo (nombre corto, como en un cartel).
// TODO(B): RPC `listar_confirmados(clave)` que devuelva solo los que han dicho que vienen, con su grupo.
export async function obtenerConfirmados(): Promise<Confirmado[]> {
	const demo: Record<Grupo, string[]> = {
		cartageneros: ['Marta', 'Álvaro', 'Sergio', 'Dani', 'Rubén', 'Javi', 'Hugo'],
		bioquimicos: ['Lucía', 'Paula', 'Irene', 'Andrea', 'Laura', 'Elena'],
		popurri: ['Pablo', 'Marcos', 'Nerea', 'Carmen', 'Alba', 'Íñigo', 'Claudia', 'Víctor'],
		totaneros: ['Sara', 'Adri', 'Noelia', 'Mario', 'Cris', 'Toni'],
	};
	return GRUPOS.flatMap(([grupo]) => demo[grupo].map((nombre) => ({ nombre, grupo })));
}
