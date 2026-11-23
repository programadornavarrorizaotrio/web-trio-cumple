import { obtenerAlbum } from '../cromos/datos';
import { rpcConClave, usaBD } from '../../lib/rpc';

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

// Nombres de los invitados que han confirmado que vienen, sin los tres cumpleañeros (salen con su foto).
// RPC `listar_confirmados(clave)`. Sin registro en la base de datos, los confirmados del álbum de ejemplo.
export async function obtenerConfirmados(): Promise<string[]> {
	if (usaBD()) return rpcConClave<string[]>('listar_confirmados');
	const { cromos } = await obtenerAlbum();
	return cromos.filter((c) => !c.especial).map((c) => c.nombre);
}
