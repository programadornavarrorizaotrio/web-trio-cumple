// Memory de cromos: 6 parejas de caras de invitados, boca abajo. Das la vuelta a dos; si coinciden
// se quedan, si no se tapan. Sin límite de tiempo: puntúan los fallos (30 - 2 por fallo, mínimo 5).
import { obtenerAlbum } from '../cromos/datos';
import type { Cromo } from '../cromos/tipos';
import { MINIJUEGOS } from './liga';
import type { Resultado } from './partida';

export const instrucciones = 'Da la vuelta a dos cartas: si son la misma cara, se quedan. Encuentra las 6 parejas con los menos fallos posibles.';

const PAREJAS = 6;
const MAX = MINIJUEGOS.find((m) => m.id === 'memory-cromos')!.maxPuntos;
const PUNTOS_POR_FALLO = 2;
const MINIMO_SI_TERMINA = 5;
const PAUSA_FALLO = 750;

const barajar = <T>(lista: T[]) => {
	const a = [...lista];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, clase: string, texto?: string) {
	const e = document.createElement(tag);
	e.className = clase;
	if (texto !== undefined) e.textContent = texto;
	return e;
}

function frente(c: Cromo) {
	const cara = el('span', 'memo-cara memo-frente');
	if (c.foto) {
		const img = el('img', '');
		img.src = c.foto;
		img.alt = '';
		img.draggable = false;
		cara.append(img);
	} else {
		cara.append(el('span', 'memo-numero', `Nº ${c.numero}`));
	}
	cara.append(el('span', 'memo-nombre', c.nombre.split(' ')[0]));
	return cara;
}

export async function jugar(area: HTMLElement, senal: AbortSignal): Promise<Resultado> {
	const { cromos } = await obtenerAlbum();
	// Mejor los que tienen foto; si faltan, se completa con cromos de número
	const elegidos = [...barajar(cromos.filter((c) => c.foto)), ...barajar(cromos.filter((c) => !c.foto))].slice(0, PAREJAS);
	const mazo = barajar([...elegidos, ...elegidos]);

	return new Promise((resolve) => {
		const hud = el('div', 'memo-hud');
		const marcadorPares = el('span', '', `Parejas 0/${elegidos.length}`);
		const marcadorFallos = el('span', '', 'Fallos 0');
		hud.append(marcadorPares, marcadorFallos);

		const campo = el('div', 'memo-campo');
		let pares = 0;
		let fallos = 0;
		let primera: HTMLButtonElement | null = null;
		let bloqueado = false;
		let terminada = false;
		const timers = new Set<number>();

		mazo.forEach((c) => {
			const b = el('button', 'memo-carta');
			b.type = 'button';
			b.dataset.id = c.id;
			b.setAttribute('aria-label', 'Carta boca abajo');
			const interior = el('span', 'memo-int');
			interior.append(el('span', 'memo-cara memo-dorso'), frente(c));
			b.append(interior);
			b.addEventListener('click', () => voltear(b, c));
			campo.append(b);
		});
		area.replaceChildren(hud, campo);

		function puntos() {
			return pares === elegidos.length ? Math.max(MINIMO_SI_TERMINA, MAX - fallos * PUNTOS_POR_FALLO) : Math.round(pares * 2);
		}

		function terminar() {
			if (terminada) return;
			terminada = true;
			timers.forEach(clearTimeout);
			resolve({
				puntos: puntos(),
				detalle: `${pares}/${elegidos.length} parejas · ${fallos} ${fallos === 1 ? 'fallo' : 'fallos'}`,
			});
		}

		function voltear(b: HTMLButtonElement, c: Cromo) {
			if (terminada || bloqueado || b === primera || b.classList.contains('vuelta')) return;
			b.classList.add('vuelta');
			b.setAttribute('aria-label', c.nombre);
			navigator.vibrate?.(10);
			if (!primera) {
				primera = b;
				return;
			}
			const anterior = primera;
			primera = null;
			if (anterior.dataset.id === b.dataset.id) {
				anterior.classList.add('pareja');
				b.classList.add('pareja');
				marcadorPares.textContent = `Parejas ${++pares}/${elegidos.length}`;
				if (pares === elegidos.length) timers.add(window.setTimeout(terminar, 900));
				return;
			}
			fallos++;
			marcadorFallos.textContent = `Fallos ${fallos}`;
			bloqueado = true;
			timers.add(
				window.setTimeout(() => {
					for (const x of [anterior, b]) {
						x.classList.remove('vuelta');
						x.setAttribute('aria-label', 'Carta boca abajo');
					}
					bloqueado = false;
				}, PAUSA_FALLO),
			);
		}

		senal.addEventListener('abort', terminar, { once: true });
	});
}
