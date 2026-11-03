// Contrato con la base de datos (tarea B8): RPC `listar_juegos(clave)` y `proponer_juego(clave, ...)`.
export const MAX_JUEGOS = 3;

export type Lugar = 'dentro' | 'fuera' | 'igual';

export interface Juego {
	id: string;
	titulo: string;
	reglas: string;
	minJugadores: number;
	maxJugadores: number | null;
	lugar: Lugar;
	autor: string;
	/** Lo propuso el invitado actual */
	mio?: boolean;
}

const EJEMPLO: Juego[] = [
	{
		id: 'j1',
		titulo: 'Beer pong',
		reglas: 'Dos equipos, seis vasos por lado. Si la metes, el otro bebe y quita el vaso. Gana quien deje al rival sin vasos.',
		minJugadores: 4,
		maxJugadores: 4,
		lugar: 'fuera',
		autor: 'Sergio Gil',
	},
	{
		id: 'j2',
		titulo: 'Mímica por equipos',
		reglas: 'Cada equipo escribe títulos de películas. Uno los representa sin hablar y su equipo tiene un minuto para adivinarlo.',
		minJugadores: 6,
		maxJugadores: null,
		lugar: 'dentro',
		autor: 'Lucía Martín',
	},
	{
		id: 'j3',
		titulo: 'El rey de la pista',
		reglas: 'Suena una canción y todos bailan. Quien pare antes que la música queda eliminado. El último en pie elige la siguiente.',
		minJugadores: 5,
		maxJugadores: null,
		lugar: 'igual',
		autor: 'Pencho',
	},
];

const CLAVE_DEMO = 'trio-demo-juegos';

function propios(): Juego[] {
	try {
		return JSON.parse(localStorage.getItem(CLAVE_DEMO) ?? '[]');
	} catch {
		return [];
	}
}

// TODO(B8): RPC `listar_juegos(clave)`, del más nuevo al más antiguo, con `mio` marcado.
export async function listarJuegos(): Promise<Juego[]> {
	return [...propios(), ...EJEMPLO];
}

// TODO(B8): RPC `proponer_juego(clave, ...)`. Debe fallar al pasar de MAX_JUEGOS por invitado.
export async function proponerJuego(juego: Omit<Juego, 'id' | 'mio'>): Promise<Juego> {
	const lista = propios();
	if (lista.length >= MAX_JUEGOS) throw new Error('limite');
	const nuevo = { ...juego, id: `local-${Date.now()}`, mio: true };
	localStorage.setItem(CLAVE_DEMO, JSON.stringify([nuevo, ...lista]));
	return nuevo;
}

export const textoLugar: Record<Lugar, string> = { dentro: '🏠 Dentro', fuera: '🌳 Fuera', igual: '🤷 Donde sea' };

export const textoJugadores = (j: Pick<Juego, 'minJugadores' | 'maxJugadores'>) =>
	j.maxJugadores === null
		? `${j.minJugadores}+ personas`
		: j.minJugadores === j.maxJugadores
			? `${j.minJugadores} personas`
			: `${j.minJugadores}–${j.maxJugadores} personas`;
