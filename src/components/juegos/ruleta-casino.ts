// Ruleta de casino con apuesta: ruleta europea de 37 casillas (0-36). Eliges una apuesta y giras una vez.
// Acertar da puntos (más cuanto más arriesgas). El 0 es el diablillo: te quita puntos.
//
// TODO(DB): el giro debería hacerlo el SERVIDOR (RPC `girar_ruleta(clave, apuesta)` que devuelva el número);
// si se gira en el navegador, alguien podría elegir el resultado.
// TODO(admin): los puntos de cada apuesta y la penalización del 0 se editarán desde el admin.
import { CONFIG, MINIJUEGOS } from './liga';
import type { Resultado } from './partida';

export const instrucciones = 'Elige una apuesta y gira la ruleta una vez. Acertar da puntos: cuanto más arriesgas, más ganas. Pero si sale el 0, aparece el diablillo y te quita puntos.';

const MAX = MINIJUEGOS.find((m) => m.id === 'ruleta-casino')!.maxPuntos;

// Orden de las casillas en la ruleta europea, en el sentido de las agujas del reloj
const ORDEN = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const ROJOS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const colorDe = (n: number) => (n === 0 ? 'verde' : ROJOS.has(n) ? 'rojo' : 'negro');
const PINTURA = { verde: '#2e8b3d', rojo: '#c0392b', negro: '#1d1d1f' };

const DURACION_GIRO = 4300;
const PAUSA_FINAL = 2000;
const VUELTAS = 5;

interface Apuesta {
	id: string;
	texto: string;
	/** Puntos que da si se acierta */
	puntos: number;
	gana: (n: number, elegido: number | null) => boolean;
}

const APUESTAS: Apuesta[] = [
	{ id: 'rojo', texto: 'Rojo', puntos: 12, gana: (n) => colorDe(n) === 'rojo' },
	{ id: 'negro', texto: 'Negro', puntos: 12, gana: (n) => colorDe(n) === 'negro' },
	{ id: 'par', texto: 'Par', puntos: 12, gana: (n) => n > 0 && n % 2 === 0 },
	{ id: 'impar', texto: 'Impar', puntos: 12, gana: (n) => n % 2 === 1 },
	{ id: 'd1', texto: '1–12', puntos: 20, gana: (n) => n >= 1 && n <= 12 },
	{ id: 'd2', texto: '13–24', puntos: 20, gana: (n) => n >= 13 && n <= 24 },
	{ id: 'd3', texto: '25–36', puntos: 20, gana: (n) => n >= 25 && n <= 36 },
	{ id: 'numero', texto: 'Un número', puntos: MAX, gana: (n, elegido) => n === elegido },
];

const esperar = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const casillaAlAzar = () => crypto.getRandomValues(new Uint32Array(1))[0] % 37;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, clase: string, texto?: string) {
	const e = document.createElement(tag);
	e.className = clase;
	if (texto !== undefined) e.textContent = texto;
	return e;
}

/** Dibuja la ruleta con la casilla 0 centrada arriba y el resto en sentido horario */
function dibujarRueda(lienzo: HTMLCanvasElement, lado: number) {
	const dpr = window.devicePixelRatio || 1;
	lienzo.width = lado * dpr;
	lienzo.height = lado * dpr;
	const ctx = lienzo.getContext('2d')!;
	ctx.scale(dpr, dpr);
	const c = lado / 2;
	const R = c - 2;
	const paso = (Math.PI * 2) / ORDEN.length;

	ctx.translate(c, c);
	ORDEN.forEach((n, i) => {
		ctx.beginPath();
		ctx.moveTo(0, 0);
		ctx.arc(0, 0, R, -Math.PI / 2 + i * paso - paso / 2, -Math.PI / 2 + i * paso + paso / 2);
		ctx.closePath();
		ctx.fillStyle = PINTURA[colorDe(n)];
		ctx.fill();
		ctx.lineWidth = 1;
		ctx.strokeStyle = '#f0c14b';
		ctx.stroke();
		// Número, en radial
		ctx.save();
		ctx.rotate(i * paso);
		ctx.fillStyle = '#fbf4e4';
		ctx.font = `900 ${R * 0.12}px sans-serif`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(String(n), 0, -R * 0.84);
		ctx.restore();
	});
	// Centro de la rueda
	ctx.beginPath();
	ctx.arc(0, 0, R * 0.62, 0, Math.PI * 2);
	ctx.fillStyle = '#46290f';
	ctx.fill();
	ctx.lineWidth = 3;
	ctx.strokeStyle = '#f0c14b';
	ctx.stroke();
	ctx.beginPath();
	ctx.arc(0, 0, R * 0.2, 0, Math.PI * 2);
	ctx.fillStyle = '#f0c14b';
	ctx.fill();
}

export function jugar(area: HTMLElement, senal: AbortSignal): Promise<Resultado> {
	return new Promise((resolve) => {
		let apuesta: Apuesta | null = null;
		let numero: number | null = null;
		let girando = false;
		let terminada = false;

		const escena = el('div', 'ruleta-escena');
		const rueda = el('div', 'ruleta-rueda');
		const lienzo = document.createElement('canvas');
		rueda.append(lienzo, el('span', 'ruleta-marca'));
		dibujarRueda(lienzo, 264);

		const apuestasEl = el('div', 'ruleta-apuestas');
		const numerosEl = el('div', 'ruleta-numeros');
		numerosEl.hidden = true;
		const resultado = el('p', 'ruleta-resultado', 'Elige tu apuesta');
		resultado.setAttribute('aria-live', 'polite');
		const girar = el('button', 'tirada-boton', '¡Girar!');
		girar.type = 'button';
		girar.disabled = true;

		function actualizar() {
			const lista = apuesta?.id === 'numero' ? numero !== null : apuesta !== null;
			girar.disabled = !lista || girando;
			if (!girando) {
				resultado.textContent = !apuesta
					? 'Elige tu apuesta'
					: apuesta.id === 'numero'
						? numero === null
							? 'Elige un número del 1 al 36'
							: `Apuestas al ${numero}: ${apuesta.puntos} puntos si sale`
						: `Apuestas a ${apuesta.texto.toLowerCase()}: ${apuesta.puntos} puntos si sale`;
			}
		}

		APUESTAS.forEach((a) => {
			const b = el('button', 'ruleta-apuesta');
			b.type = 'button';
			b.dataset.color = a.id === 'rojo' || a.id === 'negro' ? a.id : '';
			b.append(a.texto, el('small', '', `+${a.puntos}`));
			b.addEventListener('click', () => {
				if (girando) return;
				apuesta = a;
				numero = a.id === 'numero' ? numero : null;
				apuestasEl.querySelectorAll('.ruleta-apuesta').forEach((x) => x.classList.toggle('sel', x === b));
				numerosEl.hidden = a.id !== 'numero';
				actualizar();
			});
			apuestasEl.append(b);
		});
		for (let n = 1; n <= 36; n++) {
			const b = el('button', 'ruleta-numero', String(n));
			b.type = 'button';
			b.dataset.color = colorDe(n);
			b.addEventListener('click', () => {
				if (girando) return;
				numero = n;
				numerosEl.querySelectorAll('.ruleta-numero').forEach((x) => x.classList.toggle('sel', x === b));
				actualizar();
			});
			numerosEl.append(b);
		}

		function terminar(puntos: number, detalle: string) {
			if (terminada) return;
			terminada = true;
			resolve({ puntos, detalle });
		}

		girar.addEventListener('click', async () => {
			if (!apuesta || girando) return;
			girando = true;
			girar.disabled = true;
			resultado.textContent = 'Girando…';
			const ganador = casillaAlAzar();
			const paso = 360 / ORDEN.length;
			// La rueda gira hasta dejar la casilla ganadora bajo la marca de arriba
			const grados = 360 * VUELTAS - ORDEN.indexOf(ganador) * paso;
			void lienzo.offsetWidth;
			lienzo.style.transform = `rotate(${grados}deg)`;
			await esperar(DURACION_GIRO);
			if (terminada) return;

			const color = colorDe(ganador);
			const acierta = ganador !== 0 && apuesta.gana(ganador, numero);
			let puntos = 0;
			let texto = `Salió el ${ganador} ${color}.`;
			if (ganador === 0) {
				puntos = -CONFIG.penalizacionDiablo;
				texto = '¡Salió el 0! El diablillo te quita puntos';
				resultado.classList.add('mal');
			} else if (acierta) {
				puntos = apuesta.puntos;
				texto += ` ¡Aciertas! +${puntos}`;
				resultado.classList.add('bien');
			} else {
				texto += ' No has acertado';
			}
			resultado.textContent = texto;
			navigator.vibrate?.(ganador === 0 ? [80, 40, 80] : acierta ? 30 : 10);
			await esperar(PAUSA_FINAL);
			terminar(puntos, ganador === 0 ? 'Salió el 0: el diablillo' : `Salió el ${ganador} ${color}${acierta ? ' y acertaste' : ''}`);
		});

		escena.append(rueda, resultado, apuestasEl, numerosEl, girar);
		area.replaceChildren(escena);
		senal.addEventListener('abort', () => terminar(0, 'Sin girar'), { once: true });
	});
}
