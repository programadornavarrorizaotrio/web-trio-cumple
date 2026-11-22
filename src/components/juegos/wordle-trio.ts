// Wordle del trío: adivina la palabra del día en seis intentos. Cada letra se pinta verde si está en su
// sitio, amarilla si está en otro y gris si no está. Cuanto antes aciertes, más puntos (30, 25, 20…).
//
// Con la base de datos lo corrige el SERVIDOR (RPC `wordle_estado` y `wordle_probar`): el navegador no sabe
// la palabra hasta el final y los puntos los apunta el servidor. La partida se guarda intento a intento: si
// cierras a medias, la retomas. Sin base de datos o en modo prueba se juega con una palabra de ejemplo.
import { rpcConClave, usaBD } from '../../lib/rpc';
import { hoy, modoPrueba, type Rango } from './liga';
import type { Resultado } from './partida';

export const instrucciones =
	'Adivina la palabra del día en seis intentos. Verde: la letra está en su sitio. Amarillo: está, pero en otro sitio. Gris: no está. Cuanto antes la saques, más puntos.';

type Pista = 'ok' | 'casi' | 'no';

interface Intento {
	palabra: string;
	pistas: Pista[];
}

interface Estado {
	longitud: number;
	maxIntentos: number;
	intentos: Intento[];
	terminada: boolean;
	acertada: boolean;
	/** Solo cuando ha terminado */
	palabra: string | null;
	/** Al terminar con la base de datos: lo que ha apuntado en la liga */
	puntos?: number;
	rango?: Rango;
	subeDeRango?: boolean;
}

const MAX_INTENTOS = 6;
/** Igual que `privado.wordle_puntos` */
const puntosPorIntento = (n: number) => Math.max(0, 35 - 5 * n);

/** Palabras para jugar sin base de datos (las de verdad las ponen los admins en /admin) */
const EJEMPLO = ['TRIO', 'FIESTA', 'RANA', 'CHARCA', 'CROMO', 'CERVEZA', 'ESTANCO', 'TARTA', 'VELAS', 'CONGA', 'DADOS', 'NENUFAR', 'PIÑATA'];

const TECLADO = ['QWERTYUIOP', 'ASDFGHJKLÑ', '⏎ZXCVBNM⌫'];
const PAUSA_FINAL = 2200;
const VOLTEO = 260; // ms entre letra y letra al descubrir

/** Mayúsculas y sin tildes; la Ñ se queda. Igual que `privado.wordle_normalizar`. */
export const normalizar = (t: string) =>
	t
		.toUpperCase()
		.replace(/Ñ/g, '\u0000')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/\u0000/g, 'Ñ');

/** Igual que `privado.wordle_pistas`: con letras repetidas, cada letra de la palabra da una sola pista. */
export function pistas(intento: string, palabra: string): Pista[] {
	const a = [...intento];
	const p = [...palabra];
	const res: Pista[] = a.map((l, i) => (l === p[i] ? 'ok' : 'no'));
	const quedan: (string | null)[] = p.map((l, i) => (res[i] === 'ok' ? null : l));
	a.forEach((l, i) => {
		if (res[i] === 'ok') return;
		const pos = quedan.indexOf(l);
		if (pos >= 0) {
			res[i] = 'casi';
			quedan[pos] = null;
		}
	});
	return res;
}

// ───────────────────────── Motor: servidor o local ─────────────────────────

interface Motor {
	estado(): Promise<Estado>;
	probar(palabra: string): Promise<Estado>;
	/** Los puntos los apunta el servidor (no hay que llamar a registrarPartida) */
	servidor: boolean;
}

const motorServidor: Motor = {
	servidor: true,
	estado: () => rpcConClave<Estado>('wordle_estado'),
	probar: (intento) => rpcConClave<Estado>('wordle_probar', { intento }),
};

function motorLocal(): Motor {
	// En modo prueba, una al azar cada vez; si no, la misma todo el día
	const dia = [...hoy()].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
	const palabra = EJEMPLO[modoPrueba() ? Math.floor(Math.random() * EJEMPLO.length) : dia % EJEMPLO.length];
	const intentos: Intento[] = [];
	const foto = (): Estado => {
		const acertada = intentos.some((i) => i.palabra === palabra);
		const terminada = acertada || intentos.length >= MAX_INTENTOS;
		return { longitud: [...palabra].length, maxIntentos: MAX_INTENTOS, intentos: [...intentos], terminada, acertada, palabra: terminada ? palabra : null };
	};
	return {
		servidor: false,
		estado: async () => foto(),
		probar: async (intento) => {
			if ([...intento].length !== [...palabra].length) throw new Error('longitud');
			intentos.push({ palabra: intento, pistas: pistas(intento, palabra) });
			return foto();
		},
	};
}

// ───────────────────────── Partida ─────────────────────────

function el<K extends keyof HTMLElementTagNameMap>(tag: K, clase: string, texto?: string) {
	const e = document.createElement(tag);
	e.className = clase;
	if (texto !== undefined) e.textContent = texto;
	return e;
}

const AVISOS: Record<string, string> = {
	longitud: 'Faltan letras',
	letras: 'Solo letras',
	'ya-jugado': 'Ya has jugado hoy al Wordle',
	'liga-cerrada': 'La liga ya ha terminado',
	'no-asignado': 'Hoy no te ha tocado el Wordle',
	'sin-palabra': 'Los organizadores aún no han puesto palabras',
};

export async function jugar(area: HTMLElement, senal: AbortSignal): Promise<Resultado> {
	const motor = usaBD() && !modoPrueba() ? motorServidor : motorLocal();

	const aviso = el('p', 'wdl-aviso');
	aviso.setAttribute('role', 'status');
	// Cuando no hay nada que jugar: se enseña el motivo y, al cerrar, no se apunta nada
	const soloAviso = (texto: string) => {
		area.replaceChildren(aviso);
		aviso.textContent = texto;
		aviso.classList.add('visible');
		return new Promise<Resultado>((resolve) => senal.addEventListener('abort', () => resolve({ puntos: 0, aMedias: true }), { once: true }));
	};
	let estado: Estado;
	try {
		estado = await motor.estado();
	} catch (e) {
		const codigo = e instanceof Error ? e.message : '';
		return soloAviso(AVISOS[codigo] ?? 'No se ha podido cargar el Wordle. Comprueba la conexión.');
	}
	if (estado.terminada) return soloAviso(AVISOS['ya-jugado']);

	return new Promise((resolve) => {
		const n = estado.longitud;
		const hud = el('div', 'wdl-hud');
		const marcador = el('span', '');
		const premio = el('span', '');
		hud.append(marcador, premio);

		const rejilla = el('div', 'wdl-rejilla');
		rejilla.style.setProperty('--n', String(n));
		const filas = Array.from({ length: estado.maxIntentos }, () => {
			const fila = el('div', 'wdl-fila');
			const casillas = Array.from({ length: n }, () => el('span', 'wdl-casilla'));
			fila.append(...casillas);
			rejilla.append(fila);
			return { fila, casillas };
		});

		const teclas = new Map<string, HTMLButtonElement>();
		const teclado = el('div', 'wdl-teclado');
		for (const fila of TECLADO) {
			const f = el('div', 'wdl-teclas');
			for (const t of fila) {
				const especial = t === '⏎' || t === '⌫';
				const b = el('button', especial ? 'wdl-tecla ancha' : 'wdl-tecla', t === '⏎' ? 'Enviar' : t);
				b.type = 'button';
				if (t === '⌫') b.setAttribute('aria-label', 'Borrar');
				b.addEventListener('click', () => pulsar(t === '⏎' ? 'Enter' : t === '⌫' ? 'Backspace' : t));
				if (!especial) teclas.set(t, b);
				f.append(b);
			}
			teclado.append(f);
		}
		area.replaceChildren(hud, rejilla, aviso, teclado);

		let escrito = '';
		let ocupado = false;
		let terminada = false;
		let timerAviso = 0;

		const filaActual = () => filas[estado.intentos.length];

		function pintarHud() {
			const usados = estado.intentos.length;
			marcador.textContent = `Intento ${Math.min(usados + 1, estado.maxIntentos)}/${estado.maxIntentos}`;
			premio.textContent = estado.terminada ? '' : `${puntosPorIntento(usados + 1)} pts`;
		}

		function avisar(texto: string) {
			aviso.textContent = texto;
			aviso.classList.add('visible');
			clearTimeout(timerAviso);
			timerAviso = window.setTimeout(() => aviso.classList.remove('visible'), 1800);
		}

		const PESO: Record<Pista, number> = { no: 1, casi: 2, ok: 3 };
		function pintarTecla(letra: string, pista: Pista) {
			const b = teclas.get(letra);
			if (!b) return;
			const antes = (b.dataset.pista as Pista | undefined) ?? null;
			if (!antes || PESO[pista] > PESO[antes]) b.dataset.pista = pista;
		}

		/** Pinta un intento ya corregido. Con `animar`, las letras se voltean una tras otra. */
		function pintarIntento(i: number, intento: Intento, animar: boolean): Promise<void> {
			const { casillas } = filas[i];
			const letras = [...intento.palabra];
			const reducido = matchMedia('(prefers-reduced-motion: reduce)').matches;
			casillas.forEach((c, k) => {
				c.textContent = letras[k] ?? '';
				const poner = () => {
					c.dataset.pista = intento.pistas[k];
					pintarTecla(letras[k], intento.pistas[k]);
				};
				if (animar && !reducido) {
					c.style.animationDelay = `${k * VOLTEO}ms`;
					c.classList.add('volteo');
					window.setTimeout(poner, k * VOLTEO + VOLTEO);
				} else poner();
			});
			const espera = animar && !reducido ? n * VOLTEO + VOLTEO * 2 : 0;
			return new Promise((r) => window.setTimeout(r, espera));
		}

		function pintarEscrito() {
			const fila = filaActual();
			if (!fila) return;
			const letras = [...escrito];
			fila.casillas.forEach((c, k) => {
				c.textContent = letras[k] ?? '';
				c.classList.toggle('llena', k < letras.length);
			});
		}

		function sacudir() {
			const fila = filaActual()?.fila;
			if (!fila) return;
			fila.classList.remove('sacude');
			void fila.offsetWidth;
			fila.classList.add('sacude');
			navigator.vibrate?.([40, 30, 40]);
		}

		async function enviar() {
			if ([...escrito].length < n) {
				sacudir();
				return avisar(AVISOS.longitud);
			}
			ocupado = true;
			try {
				const nuevo = await motor.probar(escrito);
				const i = estado.intentos.length;
				estado = nuevo;
				escrito = '';
				await pintarIntento(i, nuevo.intentos[i], true);
				pintarHud();
				if (nuevo.terminada) return acabar();
				navigator.vibrate?.(20);
			} catch (e) {
				const codigo = e instanceof Error ? e.message : '';
				sacudir();
				avisar(AVISOS[codigo] ?? 'No se ha podido enviar. Prueba otra vez.');
			} finally {
				ocupado = false;
			}
		}

		function pulsar(tecla: string) {
			if (terminada || ocupado) return;
			if (tecla === 'Enter') return void enviar();
			if (tecla === 'Backspace') {
				escrito = [...escrito].slice(0, -1).join('');
				return pintarEscrito();
			}
			const letra = normalizar(tecla);
			if (!/^[A-ZÑ]$/.test(letra) || [...escrito].length >= n) return;
			escrito += letra;
			pintarEscrito();
		}

		function teclaFisica(ev: KeyboardEvent) {
			if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
			if (ev.key === 'Enter' || ev.key === 'Backspace' || ev.key.length === 1) {
				ev.preventDefault();
				pulsar(ev.key);
			}
		}
		document.addEventListener('keydown', teclaFisica);

		function limpiar() {
			terminada = true;
			clearTimeout(timerAviso);
			document.removeEventListener('keydown', teclaFisica);
		}

		function resultado(): Resultado {
			const usados = estado.intentos.length;
			const detalle = estado.acertada ? `¡${estado.palabra}! en ${usados}/${estado.maxIntentos}` : `La palabra era ${estado.palabra}`;
			if (motor.servidor) {
				const registrada =
					estado.puntos !== undefined && estado.rango ? { puntos: estado.puntos, rango: estado.rango, subeDeRango: Boolean(estado.subeDeRango) } : undefined;
				return { puntos: estado.puntos ?? 0, detalle, registrada, aMedias: !registrada };
			}
			return { puntos: estado.acertada ? puntosPorIntento(usados) : 0, detalle };
		}

		function acabar() {
			limpiar();
			navigator.vibrate?.(estado.acertada ? [30, 40, 30, 40, 80] : [80, 50, 80]);
			avisar(estado.acertada ? '¡Bien hecho!' : `Era ${estado.palabra}`);
			window.setTimeout(() => resolve(resultado()), PAUSA_FINAL);
		}

		// Si se cierra a medias: con el servidor queda guardada para retomarla; sin él, cuenta lo que lleve (0)
		senal.addEventListener(
			'abort',
			() => {
				if (terminada) return;
				limpiar();
				resolve(motor.servidor ? { puntos: 0, aMedias: true } : { puntos: 0, detalle: 'Partida sin terminar' });
			},
			{ once: true },
		);

		// Retomar lo que hubiera
		estado.intentos.forEach((intento, i) => void pintarIntento(i, intento, false));
		pintarHud();
	});
}
