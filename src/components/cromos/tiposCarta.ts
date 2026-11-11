// Tipos de las cartas: a cada invitado le toca uno "al azar", pero siempre el mismo
// (sale de su id), igual que los PS, el ataque y la retirada.
import type { Cromo } from './tipos';

export const TIPOS = {
	planta: {
		nombre: 'Planta',
		debil: 'fuego',
		resiste: null,
		ataque: 'Siesta en el césped',
		habilidad: 'Fotosíntesis',
		texto: 'Mientras este invitado esté al aire libre, recupera 20 puntos de resaca al final de cada canción.',
	},
	fuego: {
		nombre: 'Fuego',
		debil: 'agua',
		resiste: null,
		ataque: 'Chupito ardiente',
		habilidad: 'Alma de la Fiesta',
		texto: 'Mientras este invitado esté en la pista, los invitados de tu banco bailan el doble (antes de aplicar Vergüenza).',
	},
	agua: {
		nombre: 'Agua',
		debil: 'rayo',
		resiste: null,
		ataque: 'Ronda de agua',
		habilidad: 'Hidratación',
		texto: 'Una vez por fiesta, puedes intercambiar una copa de tu rival por un vaso de agua.',
	},
	rayo: {
		nombre: 'Rayo',
		debil: 'lucha',
		resiste: 'metalico',
		ataque: 'Subidón',
		habilidad: 'Pilas Cargadas',
		texto: 'Este invitado no puede quedarse dormido mientras suene reguetón.',
	},
	psiquico: {
		nombre: 'Psíquico',
		debil: 'oscuridad',
		resiste: 'lucha',
		ataque: 'Leer la mente',
		habilidad: 'Adivinar Canción',
		texto: 'Antes de que empiece una canción, di su título. Si aciertas, tu rival bebe.',
	},
	lucha: {
		nombre: 'Lucha',
		debil: 'psiquico',
		resiste: null,
		ataque: 'Pogo',
		habilidad: 'Primera Fila',
		texto: 'Mientras este invitado esté en el Puesto Activo, nadie puede ponerse delante de él en la pista.',
	},
	oscuridad: {
		nombre: 'Oscuridad',
		debil: 'planta',
		resiste: null,
		ataque: 'After hasta las 8',
		habilidad: 'Ave Nocturna',
		texto: 'A partir de las 3:00, los ataques de este invitado hacen 30 puntos de daño más.',
	},
	metalico: {
		nombre: 'Metálico',
		debil: 'fuego',
		resiste: 'planta',
		ataque: 'Barra libre',
		habilidad: 'Hígado de Acero',
		texto: 'Este invitado no recibe daño de los chupitos de tu rival.',
	},
	dragon: {
		nombre: 'Dragón',
		debil: null,
		resiste: null,
		ataque: 'Aliento de garrafón',
		habilidad: 'Leyenda Local',
		texto: 'Cuando este invitado llega a la fiesta, todos los invitados en juego le saludan.',
	},
	incoloro: {
		nombre: 'Incoloro',
		debil: 'lucha',
		resiste: null,
		ataque: 'Bailar sin ritmo',
		habilidad: 'Comodín',
		texto: 'Este invitado puede unirse a cualquier juego, aunque no sepa las reglas.',
	},
} as const satisfies Record<
	string,
	{ nombre: string; debil: string | null; resiste: string | null; ataque: string; habilidad: string; texto: string }
>;

export type TipoCarta = keyof typeof TIPOS;
export const LISTA_TIPOS = Object.keys(TIPOS) as TipoCarta[];

export interface DatosCarta {
	tipo: TipoCarta;
	ps: number;
	/** Energías del coste del ataque: las del tipo primero, luego incoloras */
	coste: TipoCarta[];
	dano: number;
	retirada: number;
	/** Para la barra de especie: "Altura: 1,75 m  Peso: 72,0 kg" */
	altura: string;
	peso: string;
}

// Generador pseudoaleatorio con semilla (FNV-1a + mulberry32): mismo id, misma carta
function aleatorio(semilla: string) {
	let h = 2166136261;
	for (let i = 0; i < semilla.length; i++) h = Math.imul(h ^ semilla.charCodeAt(i), 16777619);
	return () => {
		h = (h + 0x6d2b79f5) | 0;
		let t = Math.imul(h ^ (h >>> 15), 1 | h);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function datosCarta(c: Pick<Cromo, 'id' | 'especial'>): DatosCarta {
	const azar = aleatorio(c.id);
	const entre = (min: number, max: number) => min + Math.floor(azar() * (max - min + 1));

	const tipo = LISTA_TIPOS[entre(0, LISTA_TIPOS.length - 1)];
	const delTipo = entre(1, 2);
	const incoloras = tipo === 'incoloro' ? 0 : entre(0, 1);
	return {
		tipo,
		// Los cumpleañeros son más fuertes
		ps: c.especial ? entre(22, 34) * 10 : entre(6, 15) * 10,
		coste: [...Array(delTipo).fill(tipo), ...Array(incoloras).fill('incoloro')],
		dano: (c.especial ? entre(12, 25) : entre(1, 12)) * 10,
		retirada: entre(1, 3),
		altura: (entre(155, 198) / 100).toLocaleString('es-ES', { minimumFractionDigits: 2 }),
		peso: entre(50, 105).toLocaleString('es-ES', { minimumFractionDigits: 1 }),
	};
}
