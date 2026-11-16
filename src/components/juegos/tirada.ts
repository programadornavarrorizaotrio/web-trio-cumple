// La tirada diaria: dos dados. El número que sale es la ficha de un hexágono, y ese es el juego del día
// (como en Catan, donde el número decide qué casilla produce). El 7 es el diablillo y quita puntos.
// Si sale un número que no produce nada, se vuelve a tirar sin gastar la tirada.
import { MINIJUEGOS, tirarDados, type ResultadoTirada, type Tirada } from './liga';
import { lanzar } from './partida';

// Casillas (0-8 en una cuadrícula 3×3) que llevan punto en cada cara
const CARAS: Record<number, number[]> = {
	1: [4],
	2: [0, 8],
	3: [0, 4, 8],
	4: [0, 2, 6, 8],
	5: [0, 2, 4, 6, 8],
	6: [0, 2, 3, 5, 6, 8],
};

const DURACION_RODAR = 1000;
const PAUSA_SIN_PRODUCCION = 1300;

const esperar = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const azar6 = () => 1 + Math.floor(Math.random() * 6);

function el<K extends keyof HTMLElementTagNameMap>(tag: K, clase: string, texto?: string) {
	const e = document.createElement(tag);
	e.className = clase;
	if (texto !== undefined) e.textContent = texto;
	return e;
}

function pintarCara(dado: HTMLElement, valor: number) {
	dado.setAttribute('aria-label', `Dado: ${valor}`);
	dado.replaceChildren(...Array.from({ length: 9 }, (_, i) => el('span', CARAS[valor].includes(i) ? 'dado-pip' : '')));
}

export async function abrirTirada(opciones: { tiradaActual: number; tiradasMax: number }) {
	const dialogo = document.querySelector<HTMLDialogElement>('[data-tirada]')!;
	const area = dialogo.querySelector<HTMLElement>('[data-tirada-area]')!;
	const ladronSrc = document.querySelector<HTMLElement>('[data-partida]')?.dataset.ladronSrc ?? '';
	let cerrado = false;
	dialogo.addEventListener('close', () => (cerrado = true), { once: true });

	// --- Escena ---
	const escena = el('div', 'dados-escena');
	const titulo = el('p', 'text-xs font-bold uppercase tracking-[0.3em] text-amarillo-claro', opciones.tiradasMax > 1 ? `Tirada ${opciones.tiradaActual} de ${opciones.tiradasMax}` : 'Tirada del día');
	const dados = [el('span', 'dado'), el('span', 'dado')];
	dados.forEach((d, i) => pintarCara(d, i + 3));
	const par = el('button', 'dados-par');
	par.type = 'button';
	par.setAttribute('aria-label', 'Tirar los dados');
	par.append(...dados);
	const total = el('p', 'dados-total', '');
	total.setAttribute('aria-live', 'polite');
	const mensaje = el('p', 'dados-mensaje', 'Toca los dados para tirar');
	const acciones = el('div', 'tirada-acciones');
	escena.append(titulo, par, total, mensaje, acciones);
	area.replaceChildren(escena);
	dialogo.showModal();

	let tirando = false;
	par.addEventListener('click', async () => {
		if (tirando) return;
		tirando = true;
		let resultado: ResultadoTirada;
		try {
			resultado = await tirarDados();
		} catch {
			mensaje.textContent = 'No tienes más tiradas hoy.';
			return;
		}
		mensaje.textContent = '';
		await secuencia(resultado);
		document.dispatchEvent(new CustomEvent('liga:cambio'));
	});

	async function rodar(t: Tirada) {
		dados.forEach((d) => d.classList.add('rodando'));
		const baraja = window.setInterval(() => dados.forEach((d) => pintarCara(d, azar6())), 90);
		await esperar(DURACION_RODAR);
		clearInterval(baraja);
		pintarCara(dados[0], t.a);
		pintarCara(dados[1], t.b);
		dados.forEach((d) => d.classList.remove('rodando'));
		total.textContent = String(t.suma);
	}

	// Cada tirada que no da nada se explica y se repite; la última es el resultado
	async function secuencia(resultado: ResultadoTirada) {
		const { tiradas } = resultado;
		for (let i = 0; i < tiradas.length; i++) {
			if (cerrado) return;
			if (i > 0) {
				total.textContent = '';
				mensaje.textContent = '';
			}
			await rodar(tiradas[i]);
			if (i < tiradas.length - 1) {
				mensaje.textContent = `El ${tiradas[i].suma} no produce nada hoy. ¡Otra vez!`;
				await esperar(PAUSA_SIN_PRODUCCION);
			}
		}
		if (cerrado) return;
		navigator.vibrate?.(resultado.tipo === 'diablo' ? [80, 40, 80] : 30);
		resultado.tipo === 'diablo' ? mostrarDiablo(resultado.perdidos) : mostrarJuego(resultado.juego, tiradas[tiradas.length - 1].suma);
	}

	function boton(texto: string, alPulsar: () => void, secundario = false) {
		const b = el('button', secundario ? 'tirada-boton tirada-boton-sec' : 'tirada-boton', texto);
		b.type = 'button';
		b.addEventListener('click', alPulsar);
		return b;
	}

	function mostrarJuego(id: string, numero: number) {
		const juego = MINIJUEGOS.find((m) => m.id === id)!;
		escena.classList.add('premio');
		mensaje.textContent = `¡Con el ${numero} te toca ${juego.titulo}!`;
		acciones.replaceChildren(
			boton('Jugar ahora', () => {
				dialogo.close();
				void lanzar(juego.id);
			}),
			boton('Jugar luego', () => dialogo.close(), true),
		);
	}

	function mostrarDiablo(perdidos: number) {
		escena.classList.add('ladron');
		mensaje.textContent = perdidos > 0 ? `¡El diablillo! Te quita ${perdidos} puntos` : '¡El diablillo! Por suerte no tenías nada que perder';
		if (ladronSrc) {
			const img = el('img', 'tirada-diablillo');
			img.src = ladronSrc;
			img.alt = '';
			acciones.replaceChildren(img, boton('Vale…', () => dialogo.close(), true));
		} else {
			acciones.replaceChildren(boton('Vale…', () => dialogo.close(), true));
		}
	}
}
