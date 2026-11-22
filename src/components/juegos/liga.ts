// La liga del Trío: equipos, puntos, rangos, ranking y premios.
//
// Contrato con la base de datos. Cada función llama a su RPC (supabase/migrations/…_liga.sql) cuando el
// invitado está registrado en la base de datos (`usaBD()`); si no, sigue con los datos simulados en el
// navegador (localStorage), que sirven para probar la web sin Supabase. Los dados, la ruleta y las cartas
// los decide el SERVIDOR; el navegador solo manda los puntos de los minijuegos de habilidad, con tope.
// El modo prueba (`?probar=si`) nunca toca la liga, tampoco con base de datos.
import fiesta from '../../data/fiesta.json';
import trio from '../../data/trio.json';
import { invitadoActual } from '../registro/sesion';
import { rpcConClave, usaBD } from '../../lib/rpc';

// ───────────────────────── Equipos ─────────────────────────

export type EquipoId = 'pencho' | 'fran' | 'juan';

export interface Equipo {
	id: EquipoId;
	nombre: string;
	lema: string;
	poster: string;
	/** Color del equipo en marcadores y barras */
	color: string;
	/** Su campeón del LoL: sale en la selección de equipo (las imágenes, en lol/imagenes.ts) */
	campeon: Campeon;
}

export interface Campeon {
	nombre: string;
	/** Título oficial del campeón */
	titulo: string;
	/** Nombre de sus archivos en lol/ (`<clave>-splash.jpg`, `<clave>-icono.png`) */
	clave: string;
	/** Dónde está el campeón en el splash (object-position), para que no se corte al recortarlo en vertical */
	foco: string;
}

const COLORES: Record<EquipoId, string> = { pencho: '#f0bc44', fran: '#6fa43a', juan: '#4a7fc1' };

const CAMPEONES: Record<EquipoId, Campeon> = {
	pencho: { nombre: 'Ezreal', titulo: 'El Explorador Prodigio', clave: 'ezreal', foco: '70% 25%' },
	fran: { nombre: "K'Sante", titulo: 'El Orgullo de Nazumah', clave: 'ksante', foco: '38% 20%' },
	juan: { nombre: 'Gragas', titulo: 'El Alborotador', clave: 'gragas', foco: '84% 30%' },
};

export const EQUIPOS: Equipo[] = trio.map((t) => ({
	id: t.slug as EquipoId,
	nombre: t.nombre,
	lema: t.lema,
	poster: t.poster,
	color: COLORES[t.slug as EquipoId],
	campeon: CAMPEONES[t.slug as EquipoId],
}));

export const equipoPorId = (id: EquipoId) => EQUIPOS.find((e) => e.id === id)!;

// ───────────────────────── Configuración ─────────────────────────
// Valores del sistema de puntos. TODO(admin): los editarán los organizadores; hoy son fijos.

export const CONFIG = {
	/** Tiradas de dados al día: el número que sale decide a qué juego toca jugar */
	tiradasEntreSemana: 1,
	tiradasFinDeSemana: 2,
	/** Puntos que quita el diablillo (el 7 de los dados; en la ruleta el 67 es la casilla de la banca) */
	penalizacionDiablo: 10,
	/** Casino (ruleta y blackjack): las fichas que se pueden apostar y lo máximo por apuesta inicial */
	fichasCasino: [2, 5, 10],
	apuestaMaximaCasino: 10,
};

// ───────────────────────── Rangos ─────────────────────────
// Los diez del LoL, del Hierro al Challenger. Umbrales pensados para ~1 juego al día (hasta 30 puntos)
// y 2 en fin de semana; cada salto cuesta un poco más que el anterior. TODO(admin): editables.

export type Emblema = 'iron' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'emerald' | 'diamond' | 'master' | 'grandmaster' | 'challenger';

export interface Rango {
	nombre: string;
	desde: number;
	/** Emblema del rango (lol/emblema-<emblema>.png) */
	emblema: Emblema;
}

export const RANGOS: Rango[] = [
	{ nombre: 'Hierro', desde: 0, emblema: 'iron' },
	{ nombre: 'Bronce', desde: 25, emblema: 'bronze' },
	{ nombre: 'Plata', desde: 60, emblema: 'silver' },
	{ nombre: 'Oro', desde: 100, emblema: 'gold' },
	{ nombre: 'Platino', desde: 145, emblema: 'platinum' },
	{ nombre: 'Esmeralda', desde: 195, emblema: 'emerald' },
	{ nombre: 'Diamante', desde: 250, emblema: 'diamond' },
	{ nombre: 'Maestro', desde: 305, emblema: 'master' },
	{ nombre: 'Gran Maestro', desde: 360, emblema: 'grandmaster' },
	{ nombre: 'Challenger', desde: 420, emblema: 'challenger' },
];

export function rangoDe(puntos: number): { actual: Rango; siguiente: Rango | null } {
	let i = 0;
	while (i + 1 < RANGOS.length && puntos >= RANGOS[i + 1].desde) i++;
	return { actual: RANGOS[i], siguiente: RANGOS[i + 1] ?? null };
}

// ───────────────────────── Minijuegos ─────────────────────────

export type MinijuegoId = 'memory-cromos' | 'golpea-rana' | 'ruleta-casino' | 'blackjack' | 'adivina-cromo' | 'conga-catan' | 'wordle-trio';

export interface Minijuego {
	id: MinijuegoId;
	titulo: string;
	descripcion: string;
	/** Máximo de puntos por partida (0 en los de casino, donde se apuestan los puntos propios) */
	maxPuntos: number;
	/** Recurso de Catan que da el hexágono en el tablero */
	recurso: string;
	/** Ficha numerada del hexágono: si la tirada del día saca este número, toca jugar a este juego. Null en los libres */
	numero: number | null;
	/** Juego de casino: sin tirada ni ficha, se puede jugar siempre y se apuestan puntos propios (ver `girarRuleta` y `repartirBlackjack`) */
	libre?: boolean;
	/** Si ya se puede jugar. Los que no, no producen: si sale su número se vuelve a tirar */
	disponible: boolean;
}

export const MINIJUEGOS: Minijuego[] = [
	{ id: 'memory-cromos', titulo: 'Memory de cromos', descripcion: 'Encuentra las parejas de caras.', maxPuntos: 30, recurso: 'Papel', numero: 8, disponible: true },
	{ id: 'golpea-rana', titulo: 'Golpea la rana', descripcion: 'La rana asoma por los agujeros: tócala antes de que se esconda.', maxPuntos: 30, recurso: 'Filtros', numero: 6, disponible: true },
	{ id: 'ruleta-casino', titulo: 'Ruleta de casino', descripcion: 'Apuesta LP a un color, un par o un número y gira. Si sale el 67, la banca se lo queda todo.', maxPuntos: 0, recurso: 'Casino', numero: null, libre: true, disponible: true },
	{ id: 'blackjack', titulo: 'Blackjack', descripcion: 'Apuesta LP y acércate a 21 sin pasarte, más que la banca.', maxPuntos: 0, recurso: 'Casino', numero: null, libre: true, disponible: true },
	{ id: 'adivina-cromo', titulo: 'Adivina el cromo', descripcion: 'Una foto muy difuminada que se va aclarando: acierta quién es.', maxPuntos: 30, recurso: 'Tabaco', numero: 9, disponible: true },
	{ id: 'conga-catan', titulo: 'La conga de Catan', descripcion: 'Guía a la rana: cada cosa que comes suma a un invitado a la conga. Esquiva al diablillo.', maxPuntos: 30, recurso: 'Cebada', numero: 5, disponible: true },
	{ id: 'wordle-trio', titulo: 'Wordle del trío', descripcion: 'Adivina la palabra del día en pocos intentos.', maxPuntos: 30, recurso: 'Cerveza', numero: 10, disponible: true },
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
	/** Puntos propios por día (YYYY-MM-DD en Madrid) y minijuego. La clave `diablo` guarda lo que le quitó el 7 y `casino` el neto de la ruleta y el blackjack */
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

const CLAVE_PRUEBA = 'trio-modo-prueba';

/**
 * Modo prueba para los desarrolladores: `?probar=si` lo activa (y se recuerda en el navegador) y `?probar=no`
 * lo desactiva. Dentro se puede jugar a cualquier juego disponible sin tirar los dados y las veces que se
 * quiera, pero NO suma puntos ni toca la liga.
 */
export function modoPrueba(): boolean {
	try {
		const param = new URLSearchParams(location.search).get('probar');
		if (param === 'si') localStorage.setItem(CLAVE_PRUEBA, '1');
		if (param === 'no') localStorage.removeItem(CLAVE_PRUEBA);
		return localStorage.getItem(CLAVE_PRUEBA) === '1';
	} catch {
		return false;
	}
}

export function salirModoPrueba() {
	try {
		localStorage.removeItem(CLAVE_PRUEBA);
	} catch {
		// sin almacenamiento: nada que borrar
	}
}

/**
 * Para los desarrolladores (botón "Cambiar equipo" del modo prueba): olvida el equipo elegido, sin tocar los
 * puntos, para volver a pasar por la selección de campeón. Solo con los datos simulados: en la base de datos
 * el equipo es para siempre (habría que borrarlo desde el panel de Supabase).
 */
export const puedeOlvidarEquipo = () => !usaBD();

export function olvidarEquipo() {
	if (!puedeOlvidarEquipo()) return;
	try {
		guardarLocal({ ...leerLocal(), equipo: null });
	} catch {
		// sin almacenamiento: no había equipo guardado
	}
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

// RPC `estado_liga(clave)`
export async function estadoLiga(): Promise<EstadoLiga> {
	if (usaBD()) return rpcConClave<EstadoLiga>('estado_liga');
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

// RPC `elegir_equipo(clave, equipo)`. Solo se puede una vez: falla con 'ya-elegido'.
export async function elegirEquipo(equipo: EquipoId): Promise<void> {
	if (usaBD()) return rpcConClave<void>('elegir_equipo', { equipo });
	const l = leerLocal();
	if (l.equipo) throw new Error('ya-elegido');
	guardarLocal({ ...l, equipo });
}

// RPC `ranking_liga(clave, limite)`: individual, ordenado por puntos.
export async function ranking(limite = 20): Promise<FilaRanking[]> {
	if (usaBD()) return (await rpcConClave<FilaRanking[] | null>('ranking_liga', { limite })) ?? [];
	return filas().slice(0, limite);
}

// RPC `marcador_equipos(clave)`: suma de puntos de cada equipo.
export async function marcadorEquipos(): Promise<{ equipo: Equipo; puntos: number; miembros: number }[]> {
	if (usaBD()) {
		const filas = (await rpcConClave<{ equipo: EquipoId; puntos: number; miembros: number }[] | null>('marcador_equipos')) ?? [];
		return filas.map((f) => ({ ...f, equipo: equipoPorId(f.equipo) })).sort((a, b) => b.puntos - a.puntos);
	}
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
 * RPC `tirar_dados(clave)`. Tira el SERVIDOR (si lo hace el navegador se podría elegir el resultado)
 * y devuelve todas las tiradas hasta dar con algo: el 7 es el diablillo (quita CONFIG.penalizacionDiablo,
 * sin bajar de 0) y cualquier otro número que sea de un juego disponible no asignado ya hoy es el juego del día.
 * Si sale un número sin juego se vuelve a tirar sin gastar la tirada del día. Debe fallar con 'sin-equipo' y 'sin-tiradas'.
 */
export async function tirarDados(): Promise<ResultadoTirada> {
	if (usaBD()) return rpcConClave<ResultadoTirada>('tirar_dados');
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
 * RPC `registrar_partida(clave, minijuego, puntos)`. El navegador manda los puntos que calcula el minijuego y el
 * servidor los acota al máximo del juego. Falla con 'sin-equipo', con 'no-asignado' si hoy no le ha tocado ese
 * juego con los dados, con 'ya-jugado' si ya lo jugó hoy y con 'liga-cerrada'.
 * El Wordle no pasa por aquí: lo corrige y lo apunta el servidor (ver wordle-trio.ts).
 * TODO: que el servidor corrija también adivina el cromo.
 */
export async function registrarPartida(minijuego: MinijuegoId, puntos: number): Promise<{ puntos: number; rango: Rango; subeDeRango: boolean }> {
	if (modoPrueba()) {
		// Modo prueba: se juega sin tocar la liga
		const tope = MINIJUEGOS.find((m) => m.id === minijuego)!.maxPuntos;
		return { puntos: Math.min(tope, Math.round(puntos)), rango: rangoDe(puntosPropios(leerLocal())).actual, subeDeRango: false };
	}
	if (usaBD()) return rpcConClave('registrar_partida', { minijuego, puntos: Math.round(puntos) });
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

// ───────────────────────── Casino ─────────────────────────
// La ruleta y el blackjack no tienen tirada ni límite diario: se puede jugar siempre, pero apostando puntos
// PROPIOS. Como la banca gana de media, no se pueden "fabricar" puntos jugando sin parar.

export type CasinoId = 'ruleta-casino' | 'blackjack';

/** Banca virtual del modo prueba: se juega con ella y no se toca la liga */
const BANCA_PRUEBA = 100;
let bancaPrueba = BANCA_PRUEBA;

/** Mueve los puntos del casino simulado: la banca virtual en modo prueba, o la liga guardada en el navegador */
function moverLocal(puntos: number): number {
	if (modoPrueba()) {
		bancaPrueba = Math.max(0, bancaPrueba + puntos);
		return bancaPrueba;
	}
	const l = leerLocal();
	const dia = (l.partidas[hoy()] ??= {});
	dia.casino = (dia.casino ?? 0) + puntos;
	guardarLocal(l);
	return puntosPropios(l);
}

const puntosLocales = () => (modoPrueba() ? bancaPrueba : puntosPropios(leerLocal()));

/** Lo mismo que comprueba el servidor antes de cada apuesta */
function validarLocal(cantidad: number) {
	if (!modoPrueba() && !leerLocal().equipo) throw new Error('sin-equipo');
	if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > CONFIG.apuestaMaximaCasino) throw new Error('apuesta-invalida');
	if (cantidad > puntosLocales()) throw new Error('sin-puntos');
}

/** Con base de datos y fuera del modo prueba, el casino lo lleva el servidor */
const casinoEnBD = () => usaBD() && !modoPrueba();

/** RPC `banca_casino(clave)`: los puntos que se pueden apostar (= los puntos de la liga). */
export async function bancaCasino(): Promise<{ puntos: number; prueba: boolean }> {
	if (modoPrueba()) return { puntos: bancaPrueba, prueba: true };
	if (usaBD()) return { ...(await rpcConClave<{ puntos: number }>('banca_casino')), prueba: false };
	return { puntos: puntosPropios(leerLocal()), prueba: false };
}

// ── Ruleta ──

export type ApuestaRuleta = 'rojo' | 'negro' | 'par' | 'impar' | 'd1' | 'd2' | 'd3' | 'numero';

export interface GiroRuleta {
	casilla: number;
	gana: boolean;
	/** Lo ganado (positivo) o perdido (negativo) en este giro */
	neto: number;
	/** Puntos tras el giro */
	puntos: number;
}

const ROJOS_RULETA = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const PAGO_RULETA: Record<ApuestaRuleta, number> = { rojo: 1, negro: 1, par: 1, impar: 1, d1: 2, d2: 2, d3: 2, numero: 35 };

/** ¿Gana la apuesta si sale `n`? El 67 es la casilla de la banca (el 0 de la ruleta europea). */
function ganaRuleta(apuesta: ApuestaRuleta, n: number, numero: number | null): boolean {
	const banca = n === 67;
	switch (apuesta) {
		case 'rojo':
			return ROJOS_RULETA.has(n);
		case 'negro':
			return !banca && !ROJOS_RULETA.has(n);
		case 'par':
			return !banca && n % 2 === 0;
		case 'impar':
			return !banca && n % 2 === 1;
		case 'd1':
			return n >= 1 && n <= 12;
		case 'd2':
			return n >= 13 && n <= 24;
		case 'd3':
			return n >= 25 && n <= 36;
		case 'numero':
			return n === numero;
	}
}

/**
 * RPC `girar_ruleta(clave, apuesta, cantidad, numero)`: gira el SERVIDOR y apunta lo ganado o perdido.
 * Falla con 'sin-equipo', 'apuesta-invalida', 'sin-puntos' y 'liga-cerrada'.
 */
export async function girarRuleta(apuesta: ApuestaRuleta, cantidad: number, numero: number | null): Promise<GiroRuleta> {
	if (casinoEnBD()) return rpcConClave<GiroRuleta>('girar_ruleta', { apuesta, cantidad, numero });
	validarLocal(cantidad);
	if (apuesta === 'numero' && (numero === null || !((numero >= 1 && numero <= 36) || numero === 67))) throw new Error('apuesta-invalida');
	const azar = crypto.getRandomValues(new Uint32Array(1))[0] % 37;
	const casilla = azar === 0 ? 67 : azar;
	const gana = ganaRuleta(apuesta, casilla, numero);
	const neto = gana ? cantidad * PAGO_RULETA[apuesta] : -cantidad;
	return { casilla, gana, neto, puntos: moverLocal(neto) };
}

// ── Blackjack ──
// Baraja infinita (cada carta al azar). Gana quien se acerque más a 21 sin pasarse; el blackjack paga 3 a 2,
// el empate devuelve la apuesta y la banca roba hasta 17. Mientras se juega, de la banca solo se ve la primera carta.

export interface Carta {
	rango: string;
	palo: string;
}

export interface ManoBlackjack {
	id: string;
	/** Lo que hay en juego (el doble si dobló) */
	apuesta: number;
	jugador: Carta[];
	/** En juego, solo la primera carta; terminada, todas */
	banca: Carta[];
	estado: 'en-juego' | 'terminada';
	/** Lo ganado o perdido, cuando ha terminado */
	neto: number | null;
	puedeDoblar: boolean;
	/** Puntos tras la jugada (lo apostado se descuenta al repartir) */
	puntos: number;
}

export type AccionBlackjack = 'pedir' | 'plantarse' | 'doblar';

export function valorMano(mano: Carta[]): number {
	let total = 0;
	let ases = 0;
	for (const { rango } of mano) {
		if (rango === 'A') {
			ases++;
			total += 11;
		} else {
			total += 'JQK'.includes(rango) || rango === '10' ? 10 : Number(rango);
		}
	}
	while (total > 21 && ases > 0) {
		total -= 10;
		ases--;
	}
	return total;
}

export const esBlackjack = (mano: Carta[]) => mano.length === 2 && valorMano(mano) === 21;

// Mano del blackjack simulado (sin base de datos o en modo prueba). Se pierde al recargar la página.
interface ManoLocal {
	id: string;
	apuesta: number;
	jugador: Carta[];
	banca: Carta[];
	estado: 'en-juego' | 'terminada';
	neto: number | null;
	doblada: boolean;
}
let manoLocal: ManoLocal | null = null;

const azarCarta = (n: number) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
const cartaAlAzar = (): Carta => ({
	rango: ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'][azarCarta(13)],
	palo: ['♠', '♥', '♦', '♣'][azarCarta(4)],
});

function verManoLocal(m: ManoLocal, puntos: number): ManoBlackjack {
	return {
		id: m.id,
		apuesta: m.apuesta,
		jugador: [...m.jugador],
		banca: m.estado === 'terminada' ? [...m.banca] : m.banca.slice(0, 1),
		estado: m.estado,
		neto: m.neto,
		puedeDoblar: m.estado === 'en-juego' && !m.doblada && m.jugador.length === 2,
		puntos,
	};
}

/** Igual que `privado.resolver_mano`: la banca roba hasta 17 y se devuelve lo apostado más la ganancia */
function resolverLocal(m: ManoLocal, pasado: boolean): number {
	if (!pasado && !esBlackjack(m.jugador)) while (valorMano(m.banca) < 17) m.banca.push(cartaAlAzar());
	const mia = valorMano(m.jugador);
	const suya = valorMano(m.banca);
	let neto: number;
	if (pasado) neto = -m.apuesta;
	else if (esBlackjack(m.jugador) && esBlackjack(m.banca)) neto = 0;
	else if (esBlackjack(m.jugador)) neto = Math.floor(m.apuesta * 1.5);
	else if (esBlackjack(m.banca)) neto = -m.apuesta;
	else if (suya > 21 || mia > suya) neto = m.apuesta;
	else if (mia < suya) neto = -m.apuesta;
	else neto = 0;
	m.estado = 'terminada';
	m.neto = neto;
	manoLocal = null;
	return moverLocal(m.apuesta + neto);
}

/**
 * RPC `blackjack_repartir(clave, cantidad)`: reparte el SERVIDOR y descuenta la apuesta. Si hay blackjack la mano
 * ya viene terminada. Falla con 'sin-equipo', 'apuesta-invalida', 'sin-puntos', 'mano-abierta' y 'liga-cerrada'.
 */
export async function repartirBlackjack(cantidad: number): Promise<ManoBlackjack> {
	if (casinoEnBD()) return rpcConClave<ManoBlackjack>('blackjack_repartir', { cantidad });
	if (manoLocal) throw new Error('mano-abierta');
	validarLocal(cantidad);
	const m: ManoLocal = {
		id: String(Date.now()),
		apuesta: cantidad,
		jugador: [cartaAlAzar(), cartaAlAzar()],
		banca: [cartaAlAzar(), cartaAlAzar()],
		estado: 'en-juego',
		neto: null,
		doblada: false,
	};
	manoLocal = m;
	let puntos = moverLocal(-cantidad);
	if (esBlackjack(m.jugador) || esBlackjack(m.banca)) puntos = resolverLocal(m, false);
	return verManoLocal(m, puntos);
}

/** RPC `blackjack_mano(clave)`: la mano que quedó a medias (si se cerró la página), o null. */
export async function manoBlackjackAbierta(): Promise<ManoBlackjack | null> {
	if (casinoEnBD()) return rpcConClave<ManoBlackjack | null>('blackjack_mano');
	return manoLocal ? verManoLocal(manoLocal, puntosLocales()) : null;
}

/** RPC `blackjack_jugar(clave, accion)`. Falla con 'sin-mano', 'accion-invalida' y 'sin-puntos' (al doblar). */
export async function jugarBlackjack(accion: AccionBlackjack): Promise<ManoBlackjack> {
	if (casinoEnBD()) return rpcConClave<ManoBlackjack>('blackjack_jugar', { accion });
	const m = manoLocal;
	if (!m) throw new Error('sin-mano');
	let puntos = puntosLocales();
	if (accion === 'pedir') {
		m.jugador.push(cartaAlAzar());
		const total = valorMano(m.jugador);
		if (total >= 21) puntos = resolverLocal(m, total > 21);
	} else if (accion === 'plantarse') {
		puntos = resolverLocal(m, false);
	} else if (accion === 'doblar') {
		if (m.doblada || m.jugador.length !== 2) throw new Error('accion-invalida');
		if (m.apuesta > puntos) throw new Error('sin-puntos');
		moverLocal(-m.apuesta);
		m.apuesta *= 2;
		m.doblada = true;
		m.jugador.push(cartaAlAzar());
		puntos = resolverLocal(m, valorMano(m.jugador) > 21);
	} else {
		throw new Error('accion-invalida');
	}
	return verManoLocal(m, puntos);
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
 * RPC `listar_premios(clave)`. El servidor decide el estado y genera el código (único por
 * invitado y premio, no adivinable: si lo calcula el navegador se podría inventar uno válido). Debe poder
 * marcarse como entregado desde el panel de Supabase / el admin, y no repetirse una vez entregado.
 * TODO(admin): la lista de premios y sus textos se editan desde el admin.
 */
export async function premios(): Promise<PremioEstado[]> {
	if (usaBD()) return (await rpcConClave<PremioEstado[] | null>('listar_premios')) ?? [];
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
				detalle = `Te faltan ${RANGOS[indiceRango(r.rango)].desde - puntos} LP para ${r.rango}.`;
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
