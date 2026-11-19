// Piezas comunes de los juegos de casino (ruleta y blackjack): el marcador de puntos y las fichas de apuesta.
// Se apuestan puntos PROPIOS (ver el casino en liga.ts), así que lo máximo que se puede jugar es lo que se tiene.
import { CONFIG } from './liga';

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, clase: string, texto?: string) {
	const e = document.createElement(tag);
	e.className = clase;
	if (texto !== undefined) e.textContent = texto;
	return e;
}

export const esperar = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** "+5", "−3" (con el signo menos de verdad) y "0" */
export const conSigno = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

export interface Banca {
	el: HTMLElement;
	poner(puntos: number, prueba: boolean): void;
}

/** Marcador "Tus puntos: N" con la etiqueta de modo prueba cuando toca */
export function crearBanca(): Banca {
	const caja = el('p', 'casino-banca');
	const valor = el('strong', '', '0');
	const nota = el('small', '');
	caja.append('Tus puntos: ', valor, nota);
	return {
		el: caja,
		poner(puntos, prueba) {
			valor.textContent = String(puntos);
			nota.textContent = prueba ? ' (modo prueba)' : '';
		},
	};
}

export interface Crupier {
	el: HTMLElement;
	decir(texto: string): void;
}

/**
 * El crupier de pie detrás de la mesa: se ve de cintura para arriba y el borde de la mesa le tapa lo demás.
 * Su bocadillo va comentando la partida. Debajo de `el` va el fieltro (`crearMesa`).
 */
export function crearCrupier(src: string, inicial: string): Crupier {
	const caja = el('div', 'casino-crupier');
	const img = el('img', 'casino-crupier-img');
	img.src = src;
	img.alt = 'El crupier';
	const dicho = el('p', 'casino-dicho', inicial);
	dicho.setAttribute('aria-live', 'polite');
	caja.append(img, dicho, el('div', 'casino-borde'));
	return {
		el: caja,
		decir(texto) {
			dicho.textContent = texto;
		},
	};
}

/** El fieltro verde donde se apuesta: todo lo que se juega va dentro */
export function crearMesa(...hijos: HTMLElement[]) {
	const mesa = el('div', 'casino-mesa');
	mesa.append(...hijos);
	return mesa;
}

export interface Fichas {
	el: HTMLElement;
	/** Lo apostado: 0 si no se puede apostar nada (sin puntos) */
	valor(): number;
	/** Habilita solo las fichas que se pueden pagar con `banca` puntos */
	refrescar(banca: number): void;
	bloquear(bloqueadas: boolean): void;
}

export function crearFichas(): Fichas {
	const caja = el('div', 'casino-fichas');
	caja.setAttribute('role', 'group');
	caja.setAttribute('aria-label', 'Puntos a apostar');
	let elegida = 0;
	let banca = 0;
	let bloqueadas = false;
	const botones = CONFIG.fichasCasino
		.filter((f) => f <= CONFIG.apuestaMaximaCasino)
		.map((valor) => {
			const b = el('button', 'casino-ficha', String(valor));
			b.type = 'button';
			b.addEventListener('click', () => {
				if (bloqueadas || valor > banca) return;
				elegida = valor;
				pintar();
			});
			return { valor, b };
		});
	caja.append(...botones.map((x) => x.b));

	function pintar() {
		const pagables = botones.filter((x) => x.valor <= banca);
		// Si la elegida ya no se puede pagar, baja a la mayor que sí
		if (!pagables.some((x) => x.valor === elegida)) elegida = pagables.length ? pagables[pagables.length - 1].valor : 0;
		botones.forEach(({ valor, b }) => {
			b.disabled = bloqueadas || valor > banca;
			b.classList.toggle('sel', valor === elegida);
			b.setAttribute('aria-pressed', String(valor === elegida));
		});
	}
	pintar();

	return {
		el: caja,
		valor: () => elegida,
		refrescar(nueva) {
			banca = nueva;
			pintar();
		},
		bloquear(b) {
			bloqueadas = b;
			pintar();
		},
	};
}
