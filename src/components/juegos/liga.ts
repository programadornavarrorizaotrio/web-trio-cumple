// La liga del Trío: equipos, puntos, rangos, ranking y premios.
//
// Contrato con la base de datos. Hoy todo es simulado en el navegador (localStorage) para poder
// construir la interfaz; cada función marca la RPC que la sustituirá. Todas reciben la clave de
// sesión (`invitadoActual().clave`) y las puntuaciones las calcula el SERVIDOR, no el navegador.
import trio from '../../data/trio.json';
import { invitadoActual } from '../registro/sesion';

// ───────────────────────── Equipos ─────────────────────────

export type EquipoId = 'pencho' | 'fran' | 'juan';

export interface Equipo {
	id: EquipoId;
	nombre: string;
	lema: string;
	poster: string;
}

export const EQUIPOS: Equipo[] = trio.map((t) => ({
	id: t.slug as EquipoId,
	nombre: t.nombre,
	lema: t.lema,
	poster: t.poster,
}));

export const equipoPorId = (id: EquipoId) => EQUIPOS.find((e) => e.id === id)!;

// ───────────────────────── Rangos ─────────────────────────
// Umbrales pensados para ~3 minijuegos al día de hasta 30 puntos cada uno.

export interface Rango {
	nombre: string;
	desde: number;
}

export const RANGOS: Rango[] = [
	{ nombre: 'Hierro', desde: 0 },
	{ nombre: 'Bronce', desde: 40 },
	{ nombre: 'Plata', desde: 100 },
	{ nombre: 'Oro', desde: 200 },
	{ nombre: 'Platino', desde: 350 },
	{ nombre: 'Diamante', desde: 550 },
	{ nombre: 'Challenger', desde: 800 },
];

export function rangoDe(puntos: number): { actual: Rango; siguiente: Rango | null } {
	let i = 0;
	while (i + 1 < RANGOS.length && puntos >= RANGOS[i + 1].desde) i++;
	return { actual: RANGOS[i], siguiente: RANGOS[i + 1] ?? null };
}

// ───────────────────────── Minijuegos ─────────────────────────

export type MinijuegoId = 'quien-dijo' | 'adivina-cromo' | 'precio-justo';

export interface Minijuego {
	id: MinijuegoId;
	titulo: string;
	descripcion: string;
	/** Máximo de puntos por partida */
	maxPuntos: number;
	/** Recurso de Catan que da el hexágono en el tablero */
	recurso: string;
}

export const MINIJUEGOS: Minijuego[] = [
	{ id: 'quien-dijo', titulo: '¿Quién dijo esto?', descripcion: 'Una frase, tres sospechosos.', maxPuntos: 30, recurso: 'Papel' },
	{ id: 'adivina-cromo', titulo: 'Adivina el cromo', descripcion: 'Foto difuminada que se va aclarando.', maxPuntos: 30, recurso: 'Filtros' },
	{ id: 'precio-justo', titulo: 'El precio justo', descripcion: 'Acércate al precio del producto del estanco.', maxPuntos: 30, recurso: 'Tabaco' },
];

// ───────────────────────── Estado simulado ─────────────────────────

const CLAVE_DEMO = 'trio-demo-liga';

interface Local {
	equipo: EquipoId | null;
	/** Puntos propios por día (YYYY-MM-DD en Madrid) y minijuego */
	partidas: Record<string, Partial<Record<MinijuegoId, number>>>;
}

function leerLocal(): Local {
	try {
		return { equipo: null, partidas: {}, ...JSON.parse(localStorage.getItem(CLAVE_DEMO) ?? '{}') };
	} catch {
		return { equipo: null, partidas: {} };
	}
}

function guardarLocal(l: Local) {
	localStorage.setItem(CLAVE_DEMO, JSON.stringify(l));
}

/** Día de hoy en Madrid, para el límite de una partida diaria por minijuego. */
export function hoy(): string {
	return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
}

const puntosPropios = (l: Local) =>
	Object.values(l.partidas).reduce((suma, dia) => suma + Object.values(dia).reduce((s, p) => s + (p ?? 0), 0), 0);

// Resto de invitados de ejemplo para que el ranking tenga vida.
const EJEMPLO: { id: string; nombre: string; equipo: EquipoId; puntos: number }[] = [
	{ id: 'e1', nombre: 'Sergio Gil', equipo: 'juan', puntos: 412 },
	{ id: 'e2', nombre: 'Lucía Martín', equipo: 'fran', puntos: 365 },
	{ id: 'e3', nombre: 'Carlos Ruiz', equipo: 'pencho', puntos: 298 },
	{ id: 'e4', nombre: 'Paula Sanz', equipo: 'pencho', puntos: 240 },
	{ id: 'e5', nombre: 'Álvaro Díaz', equipo: 'fran', puntos: 171 },
	{ id: 'e6', nombre: 'Irene Vega', equipo: 'juan', puntos: 96 },
	{ id: 'e7', nombre: 'Hugo Prieto', equipo: 'fran', puntos: 38 },
];

// ───────────────────────── API ─────────────────────────

export interface EstadoLiga {
	/** Null hasta que elige equipo */
	equipo: EquipoId | null;
	puntos: number;
	rango: Rango;
	siguienteRango: Rango | null;
	/** Minijuegos ya jugados hoy */
	jugadosHoy: MinijuegoId[];
	/** Puesto individual (1 = primero) */
	puesto: number;
}

export interface FilaRanking {
	id: string;
	nombre: string;
	equipo: EquipoId;
	puntos: number;
	rango: string;
	yo: boolean;
}

function filas(): FilaRanking[] {
	const yo = invitadoActual();
	const l = leerLocal();
	const todas = EJEMPLO.map((e) => ({ ...e, yo: false }));
	if (yo && l.equipo) todas.push({ id: yo.id, nombre: yo.nombre, equipo: l.equipo, puntos: puntosPropios(l), yo: true });
	return todas
		.sort((a, b) => b.puntos - a.puntos)
		.map((f) => ({ ...f, rango: rangoDe(f.puntos).actual.nombre }));
}

// TODO(DB): RPC `estado_liga(clave)`
export async function estadoLiga(): Promise<EstadoLiga> {
	const l = leerLocal();
	const puntos = puntosPropios(l);
	const { actual, siguiente } = rangoDe(puntos);
	const puesto = filas().findIndex((f) => f.yo) + 1;
	return {
		equipo: l.equipo,
		puntos,
		rango: actual,
		siguienteRango: siguiente,
		jugadosHoy: Object.keys(l.partidas[hoy()] ?? {}) as MinijuegoId[],
		puesto: puesto || filas().length + 1,
	};
}

// TODO(DB): RPC `elegir_equipo(clave, equipo)`. Solo se puede una vez: debe fallar con 'ya-elegido'.
export async function elegirEquipo(equipo: EquipoId): Promise<void> {
	const l = leerLocal();
	if (l.equipo) throw new Error('ya-elegido');
	guardarLocal({ ...l, equipo });
}

// TODO(DB): RPC `ranking_liga(clave, limite)`: individual, ordenado por puntos.
export async function ranking(limite = 20): Promise<FilaRanking[]> {
	return filas().slice(0, limite);
}

// TODO(DB): RPC `marcador_equipos(clave)`: suma de puntos de cada equipo.
export async function marcadorEquipos(): Promise<{ equipo: Equipo; puntos: number; miembros: number }[]> {
	const todas = filas();
	return EQUIPOS.map((equipo) => {
		const suyas = todas.filter((f) => f.equipo === equipo.id);
		return { equipo, puntos: suyas.reduce((s, f) => s + f.puntos, 0), miembros: suyas.length };
	}).sort((a, b) => b.puntos - a.puntos);
}

/**
 * TODO(DB): RPC `registrar_partida(clave, minijuego, respuestas)`.
 * El servidor corrige las respuestas (las soluciones NO viajan al navegador) y calcula los puntos.
 * Debe fallar con 'sin-equipo' si no ha elegido equipo y con 'ya-jugado' si ya jugó hoy ese minijuego.
 * Aquí, en modo simulado, el cliente manda los puntos que ha calculado el propio minijuego.
 */
export async function registrarPartida(minijuego: MinijuegoId, puntos: number): Promise<{ puntos: number; rango: Rango; subeDeRango: boolean }> {
	const l = leerLocal();
	if (!l.equipo) throw new Error('sin-equipo');
	const dia = (l.partidas[hoy()] ??= {});
	if (dia[minijuego] !== undefined) throw new Error('ya-jugado');
	const max = MINIJUEGOS.find((m) => m.id === minijuego)!.maxPuntos;
	const antes = rangoDe(puntosPropios(l)).actual;
	dia[minijuego] = Math.max(0, Math.min(max, Math.round(puntos)));
	guardarLocal(l);
	const despues = rangoDe(puntosPropios(l)).actual;
	return { puntos: dia[minijuego]!, rango: despues, subeDeRango: despues.nombre !== antes.nombre };
}

// ───────────────────────── Premios ─────────────────────────

export type Requisito = { tipo: 'puesto'; hasta: number } | { tipo: 'rango'; rango: string };

export interface Premio {
	id: string;
	titulo: string;
	descripcion: string;
	requisito: Requisito;
}

export interface PremioEstado extends Premio {
	conseguido: boolean;
	/** Código para enseñar en la fiesta; solo si está conseguido */
	codigo: string | null;
}

// Los premios salen del estanco; el texto es de ejemplo hasta cerrar cuáles son.
const PREMIOS: Premio[] = [
	{ id: 'oro', titulo: 'Campeón de la liga', descripcion: 'Una cajetilla a elegir del estanco.', requisito: { tipo: 'puesto', hasta: 1 } },
	{ id: 'podio', titulo: 'Podio', descripcion: 'Un mechero del estanco.', requisito: { tipo: 'puesto', hasta: 3 } },
	{ id: 'oro-rango', titulo: 'Rango Oro', descripcion: 'Un chupito de la casa.', requisito: { tipo: 'rango', rango: 'Oro' } },
];

// TODO(DB): RPC `listar_premios(clave)`. El código lo genera el servidor, único por invitado y premio,
// y debe poder marcarse como entregado desde el panel de Supabase.
export async function premios(): Promise<PremioEstado[]> {
	const l = leerLocal();
	const yo = invitadoActual();
	const puesto = filas().findIndex((f) => f.yo) + 1;
	const indiceRango = (nombre: string) => RANGOS.findIndex((r) => r.nombre === nombre);
	const mio = rangoDe(puntosPropios(l)).actual.nombre;
	return PREMIOS.map((p) => {
		const conseguido =
			!!l.equipo &&
			(p.requisito.tipo === 'puesto'
				? puesto > 0 && puesto <= p.requisito.hasta
				: indiceRango(mio) >= indiceRango(p.requisito.rango));
		const codigo = conseguido && yo ? `${p.id.toUpperCase()}-${yo.id.toUpperCase()}`.slice(0, 14) : null;
		return { ...p, conseguido, codigo };
	});
}
