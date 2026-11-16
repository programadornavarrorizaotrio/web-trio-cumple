// La liga del Trío: equipos, puntos, rangos, ranking y premios.
//
// Contrato con la base de datos. Hoy todo es simulado en el navegador (localStorage) para poder
// construir la interfaz; cada función marca la RPC que la sustituirá. Todas reciben la clave de
// sesión (`invitadoActual().clave`) y las puntuaciones las calcula el SERVIDOR, no el navegador.
import fiesta from '../../data/fiesta.json';
import trio from '../../data/trio.json';
import { invitadoActual } from '../registro/sesion';

// ───────────────────────── Equipos ─────────────────────────

export type EquipoId = 'pencho' | 'fran' | 'juan';

export interface Equipo {
	id: EquipoId;
	nombre: string;
	lema: string;
	poster: string;
	/** Color del equipo en marcadores y barras */
	color: string;
}

const COLORES: Record<EquipoId, string> = { pencho: '#f0bc44', fran: '#6fa43a', juan: '#4a7fc1' };

export const EQUIPOS: Equipo[] = trio.map((t) => ({
	id: t.slug as EquipoId,
	nombre: t.nombre,
	lema: t.lema,
	poster: t.poster,
	color: COLORES[t.slug as EquipoId],
}));

export const equipoPorId = (id: EquipoId) => EQUIPOS.find((e) => e.id === id)!;

// ───────────────────────── Configuración ─────────────────────────
// Valores del sistema de puntos. TODO(admin): los editarán los organizadores; hoy son fijos.

export const CONFIG = {
	/** Tiradas de dados al día: el número que sale decide a qué juego toca jugar */
	tiradasEntreSemana: 1,
	tiradasFinDeSemana: 2,
	/** Puntos que quita el diablillo (el 7 de los dados o el 67 de la ruleta) */
	penalizacionDiablo: 10,
};

// ───────────────────────── Rangos ─────────────────────────
// Umbrales pensados para ~1 juego al día (hasta 30 puntos) y 2 en fin de semana.

export interface Rango {
	nombre: string;
	desde: number;
}

export const RANGOS: Rango[] = [
	{ nombre: 'Hierro', desde: 0 },
	{ nombre: 'Bronce', desde: 30 },
	{ nombre: 'Plata', desde: 80 },
	{ nombre: 'Oro', desde: 150 },
	{ nombre: 'Platino', desde: 230 },
	{ nombre: 'Diamante', desde: 320 },
	{ nombre: 'Challenger', desde: 420 },
];

export function rangoDe(puntos: number): { actual: Rango; siguiente: Rango | null } {
	let i = 0;
	while (i + 1 < RANGOS.length && puntos >= RANGOS[i + 1].desde) i++;
	return { actual: RANGOS[i], siguiente: RANGOS[i + 1] ?? null };
}

// ───────────────────────── Minijuegos ─────────────────────────

export type MinijuegoId = 'memory-cromos' | 'golpea-rana' | 'ruleta-casino' | 'adivina-cromo' | 'conga-catan' | 'wordle-trio';

export interface Minijuego {
	id: MinijuegoId;
	titulo: string;
	descripcion: string;
	/** Máximo de puntos por partida */
	maxPuntos: number;
	/** Recurso de Catan que da el hexágono en el tablero */
	recurso: string;
	/** Ficha numerada del hexágono: si la tirada del día saca este número, toca jugar a este juego */
	numero: number;
	/** Si ya se puede jugar. Los que no, no producen: si sale su número se vuelve a tirar */
	disponible: boolean;
}

export const MINIJUEGOS: Minijuego[] = [
	{ id: 'memory-cromos', titulo: 'Memory de cromos', descripcion: 'Encuentra las parejas de caras.', maxPuntos: 30, recurso: 'Papel', numero: 8, disponible: true },
	{ id: 'golpea-rana', titulo: 'Golpea la rana', descripcion: 'La rana asoma por los agujeros: tócala antes de que se esconda.', maxPuntos: 30, recurso: 'Filtros', numero: 6, disponible: true },
	{ id: 'ruleta-casino', titulo: 'Ruleta de casino', descripcion: 'Apuesta a un color, un par o un número y gira. Cuidado con el 67: es el diablillo.', maxPuntos: 30, recurso: 'Mechero', numero: 4, disponible: true },
	{ id: 'adivina-cromo', titulo: 'Adivina el cromo', descripcion: 'Una foto muy difuminada que se va aclarando: acierta quién es.', maxPuntos: 30, recurso: 'Tabaco', numero: 9, disponible: true },
	{ id: 'conga-catan', titulo: 'La conga de Catan', descripcion: 'Guía a la rana: cada cosa que comes suma a un invitado a la conga. Esquiva al diablillo.', maxPuntos: 30, recurso: 'Cebada', numero: 5, disponible: true },
	{ id: 'wordle-trio', titulo: 'Wordle del trío', descripcion: 'Adivina la palabra del día en pocos intentos.', maxPuntos: 30, recurso: 'Cerveza', numero: 10, disponible: false },
];

// ───────────────────────── Estado simulado ─────────────────────────

const CLAVE_DEMO = 'trio-demo-liga';

interface DiaLocal {
	/** Tiradas de dados gastadas ese día */
	tiradas: number;
	/** Juegos que le han tocado ese día (jugados o no) */
	asignados: MinijuegoId[];
	/** Veces que le ha salido el diablillo ese día */
	diablos?: number;
}

interface Local {
	equipo: EquipoId | null;
	/** Puntos propios por día (YYYY-MM-DD en Madrid) y minijuego. La clave `diablo` guarda lo que le quitó el 7 */
	partidas: Record<string, Record<string, number>>;
	dias: Record<string, DiaLocal>;
}

function leerLocal(): Local {
	try {
		return { equipo: null, partidas: {}, dias: {}, ...JSON.parse(localStorage.getItem(CLAVE_DEMO) ?? '{}') };
	} catch {
		return { equipo: null, partidas: {}, dias: {} };
	}
}

function guardarLocal(l: Local) {
	localStorage.setItem(CLAVE_DEMO, JSON.stringify(l));
}

/** Día de hoy en Madrid, para el límite de una partida diaria por minijuego. */
export function hoy(): string {
	return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
}

/** Fin de semana en Madrid (en pruebas se fuerza con `?finde=si`). */
export function esFinDeSemana(): boolean {
	if (new URLSearchParams(location.search).get('finde') === 'si') return true;
	const dia = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Madrid', weekday: 'short' }).format(new Date());
	return dia === 'Sat' || dia === 'Sun';
}

const tiradasDelDia = () => (esFinDeSemana() ? CONFIG.tiradasFinDeSemana : CONFIG.tiradasEntreSemana);

/** Puntos totales: nunca por debajo de 0, aunque el diablillo haya quitado de más. */
const puntosPropios = (l: Local) =>
	Math.max(0, Object.values(l.partidas).reduce((suma, dia) => suma + Object.values(dia).reduce((s, p) => s + p, 0), 0));

// Resto de invitados de ejemplo para que el ranking tenga vida.
const EJEMPLO: { id: string; nombre: string; equipo: EquipoId; puntos: number }[] = [
	{ id: 'e1', nombre: 'Sergio Gil', equipo: 'juan', puntos: 206 },
	{ id: 'e2', nombre: 'Lucía Martín', equipo: 'fran', puntos: 182 },
	{ id: 'e3', nombre: 'Carlos Ruiz', equipo: 'pencho', puntos: 149 },
	{ id: 'e4', nombre: 'Paula Sanz', equipo: 'pencho', puntos: 120 },
	{ id: 'e5', nombre: 'Álvaro Díaz', equipo: 'fran', puntos: 85 },
	{ id: 'e6', nombre: 'Irene Vega', equipo: 'juan', puntos: 48 },
	{ id: 'e7', nombre: 'Hugo Prieto', equipo: 'fran', puntos: 19 },
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
	/** Juegos que le han tocado hoy con la tirada de dados (jugados o no) */
	asignadosHoy: MinijuegoId[];
	/** Veces que le ha salido el diablillo hoy */
	diablosHoy: number;
	tiradasHoy: number;
	tiradasMax: number;
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
		jugadosHoy: Object.keys(l.partidas[hoy()] ?? {}).filter((k) => MINIJUEGOS.some((m) => m.id === k)) as MinijuegoId[],
		asignadosHoy: l.dias[hoy()]?.asignados ?? [],
		diablosHoy: l.dias[hoy()]?.diablos ?? 0,
		tiradasHoy: l.dias[hoy()]?.tiradas ?? 0,
		tiradasMax: tiradasDelDia(),
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

export interface Tirada {
	a: number;
	b: number;
	suma: number;
}

export type ResultadoTirada =
	| { tipo: 'juego'; juego: MinijuegoId; tiradas: Tirada[] }
	| { tipo: 'diablo'; perdidos: number; tiradas: Tirada[] };

const dado6 = () => 1 + (crypto.getRandomValues(new Uint32Array(1))[0] % 6);

/**
 * TODO(DB): RPC `tirar_dados(clave)`. Tira el SERVIDOR (si lo hace el navegador se podría elegir el resultado)
 * y devuelve todas las tiradas hasta dar con algo: el 7 es el diablillo (quita CONFIG.penalizacionDiablo,
 * sin bajar de 0) y cualquier otro número que sea de un juego disponible no asignado ya hoy es el juego del día.
 * Si sale un número sin juego se vuelve a tirar sin gastar la tirada del día. Debe fallar con 'sin-equipo' y 'sin-tiradas'.
 */
export async function tirarDados(): Promise<ResultadoTirada> {
	const l = leerLocal();
	if (!l.equipo) throw new Error('sin-equipo');
	const dia = (l.dias[hoy()] ??= { tiradas: 0, asignados: [] });
	if (dia.tiradas >= tiradasDelDia()) throw new Error('sin-tiradas');

	const tiradas: Tirada[] = [];
	for (let i = 0; i < 200; i++) {
		const a = dado6();
		const b = dado6();
		const suma = a + b;
		tiradas.push({ a, b, suma });
		if (suma === 7) {
			const perdidos = Math.min(CONFIG.penalizacionDiablo, puntosPropios(l));
			const partidas = (l.partidas[hoy()] ??= {});
			partidas.diablo = (partidas.diablo ?? 0) - perdidos;
			dia.tiradas++;
			dia.diablos = (dia.diablos ?? 0) + 1;
			guardarLocal(l);
			return { tipo: 'diablo', perdidos, tiradas };
		}
		const juego = MINIJUEGOS.find((m) => m.numero === suma && m.disponible && !dia.asignados.includes(m.id));
		if (juego) {
			dia.asignados.push(juego.id);
			dia.tiradas++;
			guardarLocal(l);
			return { tipo: 'juego', juego: juego.id, tiradas };
		}
	}
	throw new Error('sin-juegos');
}

/**
 * TODO(DB): RPC `registrar_partida(clave, minijuego, respuestas)`.
 * El servidor corrige las respuestas (las soluciones NO viajan al navegador) y calcula los puntos.
 * Debe fallar con 'sin-equipo', con 'no-asignado' si hoy no le ha tocado ese juego con los dados y con
 * 'ya-jugado' si ya lo jugó hoy. Los puntos pueden ser negativos (el 67 de la ruleta es el diablillo).
 * Aquí, en modo simulado, el cliente manda los puntos que ha calculado el propio minijuego.
 */
export async function registrarPartida(minijuego: MinijuegoId, puntos: number): Promise<{ puntos: number; rango: Rango; subeDeRango: boolean }> {
	const l = leerLocal();
	if (!l.equipo) throw new Error('sin-equipo');
	if (!l.dias[hoy()]?.asignados.includes(minijuego)) throw new Error('no-asignado');
	const dia = (l.partidas[hoy()] ??= {});
	if (dia[minijuego] !== undefined) throw new Error('ya-jugado');
	const max = MINIJUEGOS.find((m) => m.id === minijuego)!.maxPuntos;
	const antes = rangoDe(puntosPropios(l)).actual;
	let valor = Math.min(max, Math.round(puntos));
	// Lo que se quita no puede pasar de la penalización ni de lo que ya tiene
	if (valor < 0) valor = -Math.min(-valor, CONFIG.penalizacionDiablo, puntosPropios(l));
	dia[minijuego] = valor;
	guardarLocal(l);
	const despues = rangoDe(puntosPropios(l)).actual;
	return { puntos: valor, rango: despues, subeDeRango: despues.nombre !== antes.nombre };
}

// ───────────────────────── Premios ─────────────────────────
//
// Los premios y su texto son contenido EDITABLE: hoy son datos de relleno ("por anunciar"); cuando
// exista el admin de los organizadores saldrán de la base de datos (TODO(admin)).

/** Cierre de la liga: el comienzo de la fiesta. Hasta entonces, podio y equipo ganador están "en juego". */
const CIERRE_LIGA = new Date(fiesta.inicio).getTime();

/** En pruebas se puede forzar con `?liga=cerrada` o `?liga=abierta` (como `?estanco=cerrado`). */
export function ligaCerrada(): boolean {
	const forzado = new URLSearchParams(location.search).get('liga');
	if (forzado === 'cerrada') return true;
	if (forzado === 'abierta') return false;
	return Date.now() >= CIERRE_LIGA;
}

export type Requisito =
	| { tipo: 'rango'; rango: string }
	| { tipo: 'podio'; hasta: number }
	| { tipo: 'equipo' };

export interface Premio {
	id: string;
	titulo: string;
	descripcion: string;
	requisito: Requisito;
}

export type EstadoPremio = 'conseguido' | 'bloqueado' | 'en-juego' | 'perdido';

export interface PremioEstado extends Premio {
	estado: EstadoPremio;
	/** Texto de progreso: "Te faltan 40 puntos para Plata", "Vas el 4º", etc. */
	detalle: string;
	/** Código para enseñar en la fiesta; solo si está conseguido */
	codigo: string | null;
	/** Ya se lo han dado en la fiesta */
	entregado: boolean;
}

const PREMIOS: Premio[] = [
	{ id: 'rango-plata', titulo: 'Rango Plata', descripcion: 'Premio por anunciar.', requisito: { tipo: 'rango', rango: 'Plata' } },
	{ id: 'rango-oro', titulo: 'Rango Oro', descripcion: 'Premio por anunciar.', requisito: { tipo: 'rango', rango: 'Oro' } },
	{ id: 'podio', titulo: 'Podio de la liga', descripcion: 'Premio por anunciar. Para los 3 primeros al cierre.', requisito: { tipo: 'podio', hasta: 3 } },
	{ id: 'campeon', titulo: 'Campeón de la liga', descripcion: 'Premio por anunciar. Para el primero al cierre.', requisito: { tipo: 'podio', hasta: 1 } },
	{ id: 'equipo', titulo: 'Equipo ganador', descripcion: 'Premio por anunciar. Para todo el equipo que gane.', requisito: { tipo: 'equipo' } },
];

const ordinal = (n: number) => `${n}º`;

/**
 * TODO(DB): RPC `listar_premios(clave)`. El servidor decide el estado y genera el código (único por
 * invitado y premio, no adivinable: si lo calcula el navegador se podría inventar uno válido). Debe poder
 * marcarse como entregado desde el panel de Supabase / el admin, y no repetirse una vez entregado.
 * TODO(admin): la lista de premios y sus textos se editan desde el admin.
 */
export async function premios(): Promise<PremioEstado[]> {
	const l = leerLocal();
	const yo = invitadoActual();
	const cerrada = ligaCerrada();
	const todas = filas();
	const puesto = todas.findIndex((f) => f.yo) + 1;
	const puntos = puntosPropios(l);
	const mio = rangoDe(puntos).actual.nombre;
	const indiceRango = (nombre: string) => RANGOS.findIndex((r) => r.nombre === nombre);
	const lider = l.equipo ? marcadorDe(todas)[0]?.id : null;
	const puestoEquipo = l.equipo ? marcadorDe(todas).findIndex((m) => m.id === l.equipo) + 1 : 0;

	return PREMIOS.map((p) => {
		let estado: EstadoPremio = 'bloqueado';
		let detalle = '';
		const r = p.requisito;

		if (!l.equipo) {
			detalle = 'Elige un equipo para empezar a puntuar.';
		} else if (r.tipo === 'rango') {
			if (indiceRango(mio) >= indiceRango(r.rango)) {
				estado = 'conseguido';
				detalle = `Has llegado a ${r.rango}.`;
			} else {
				detalle = `Te faltan ${RANGOS[indiceRango(r.rango)].desde - puntos} puntos para ${r.rango}.`;
			}
		} else if (r.tipo === 'podio') {
			if (!cerrada) {
				estado = 'en-juego';
				detalle = `Vas el ${ordinal(puesto)}. Se decide al cierre de la liga.`;
			} else if (puesto > 0 && puesto <= r.hasta) {
				estado = 'conseguido';
				detalle = `Terminaste el ${ordinal(puesto)}.`;
			} else {
				estado = 'perdido';
				detalle = `Terminaste el ${ordinal(puesto)}.`;
			}
		} else {
			if (!cerrada) {
				estado = 'en-juego';
				detalle = `Tu equipo va el ${ordinal(puestoEquipo)}. Se decide al cierre de la liga.`;
			} else if (lider === l.equipo) {
				estado = 'conseguido';
				detalle = 'Tu equipo ha ganado la liga.';
			} else {
				estado = 'perdido';
				detalle = `Tu equipo terminó el ${ordinal(puestoEquipo)}.`;
			}
		}

		const codigo = estado === 'conseguido' && yo ? `${p.id.replace(/-/g, '').toUpperCase().slice(0, 8)}-${yo.id.toUpperCase()}` : null;
		return { ...p, estado, detalle, codigo, entregado: false };
	});
}

function marcadorDe(todas: FilaRanking[]) {
	return EQUIPOS.map((e) => ({ id: e.id, puntos: todas.filter((f) => f.equipo === e.id).reduce((s, f) => s + f.puntos, 0) })).sort((a, b) => b.puntos - a.puntos);
}
