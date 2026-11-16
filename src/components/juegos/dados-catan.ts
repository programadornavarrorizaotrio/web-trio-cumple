// Dados de Catan: una tirada de dos dados al día. Dos puntos por cada punto del dado (de 4 a 24),
// salvo el 7: sale el ladrón y te quedas sin nada. Es el juego de suerte de la liga.
//
// TODO(DB): la tirada debería hacerla el SERVIDOR (RPC `tirar_dados(clave)` que devuelva los dos
// dados), para que nadie pueda elegir su resultado. Aquí, en modo simulado, se tira en el navegador.
import { MINIJUEGOS } from './liga';
import type { Resultado } from './partida';

export const instrucciones = 'Tira los dos dados: cada punto vale 2 puntos para tu equipo. Pero si sale un 7, aparece el ladrón y te lo quita todo.';

const MAX = MINIJUEGOS.find((m) => m.id === 'dados-catan')!.maxPuntos;
const DURACION_TIRADA = 1100;
const PAUSA_FINAL = 1800;

// Casillas (0-8 en una cuadrícula 3×3) que llevan punto en cada cara
const CARAS: Record<number, number[]> = {
	1: [4],
	2: [0, 8],
	3: [0, 4, 8],
	4: [0, 2, 6, 8],
	5: [0, 2, 4, 6, 8],
	6: [0, 2, 3, 5, 6, 8],
};

const dado6 = () => 1 + (crypto.getRandomValues(new Uint32Array(1))[0] % 6);

function el<K extends keyof HTMLElementTagNameMap>(tag: K, clase: string, texto?: string) {
	const e = document.createElement(tag);
	e.className = clase;
	if (texto !== undefined) e.textContent = texto;
	return e;
}

function pintarCara(dado: HTMLElement, valor: number) {
	dado.setAttribute('aria-label', `Dado: ${valor}`);
	dado.replaceChildren(
		...Array.from({ length: 9 }, (_, i) => el('span', CARAS[valor].includes(i) ? 'dado-pip' : '')),
	);
}

export function jugar(area: HTMLElement, senal: AbortSignal): Promise<Resultado> {
	return new Promise((resolve) => {
		const escena = el('div', 'dados-escena');
		const dados = [el('span', 'dado'), el('span', 'dado')];
		dados.forEach((d, i) => pintarCara(d, i + 3));
		const par = el('button', 'dados-par');
		par.type = 'button';
		par.setAttribute('aria-label', 'Tirar los dados');
		par.append(...dados);

		const total = el('p', 'dados-total', '');
		total.setAttribute('aria-live', 'polite');
		const mensaje = el('p', 'dados-mensaje', 'Toca los dados para tirar');
		escena.append(par, total, mensaje);
		area.replaceChildren(escena);

		let estado: 'esperando' | 'tirando' | 'fin' = 'esperando';

		function terminar(puntos: number, detalle: string) {
			if (estado === 'fin') return;
			estado = 'fin';
			resolve({ puntos, detalle });
		}

		function tirar() {
			if (estado !== 'esperando') return;
			estado = 'tirando';
			mensaje.textContent = '';
			dados.forEach((d) => d.classList.add('rodando'));
			// Mientras ruedan, las caras cambian al azar
			const baraja = window.setInterval(() => dados.forEach((d) => pintarCara(d, dado6())), 90);

			window.setTimeout(() => {
				clearInterval(baraja);
				const a = dado6();
				const b = dado6();
				[a, b].forEach((v, i) => pintarCara(dados[i], v));
				dados.forEach((d) => d.classList.remove('rodando'));
				const suma = a + b;
				const ladron = suma === 7;
				total.textContent = String(suma);
				escena.classList.toggle('ladron', ladron);
				mensaje.textContent = ladron ? '¡El ladrón! Te lo quita todo' : `${suma} × 2 = ${suma * 2} puntos`;
				navigator.vibrate?.(ladron ? [80, 40, 80] : 30);
				window.setTimeout(
					() => terminar(ladron ? 0 : Math.min(MAX, suma * 2), ladron ? 'Salió un 7: el ladrón' : `Sacaste un ${suma}`),
					PAUSA_FINAL,
				);
			}, DURACION_TIRADA);
		}

		par.addEventListener('click', tirar);
		// Si cierra antes de tirar, no hay tirada: se pierde el intento sin puntos
		senal.addEventListener('abort', () => terminar(0, 'Sin tirar'), { once: true });
	});
}
