// Ruleta de casino con apuesta: 37 casillas, del 1 al 36 y el 67 (que ocupa el sitio del 0 de la ruleta europea).
// Es un juego libre (sin tirada ni límite diario): se apuestan puntos propios, se gira, y se puede repetir.
// Si se acierta se cobra según lo que se arriesga (1 a 1, 2 a 1 o 35 a 1). Si sale el 67 gana la banca, salvo a quien
// haya apostado al 67 (como al 0 en una ruleta real).
//
// El giro lo hace el SERVIDOR (`girarRuleta` en liga.ts → RPC `girar_ruleta`): aquí solo se anima la rueda hasta
// la casilla que ha salido.
// TODO(admin): las fichas y la apuesta máxima se editarán desde el admin (CONFIG en liga.ts).
import { bancaCasino, girarRuleta, type ApuestaRuleta } from './liga';
import { conSigno, crearBanca, crearCrupier, crearFichas, crearMesa, el, esperar } from './casino';
import type { Contexto, Resultado } from './partida';

export const instrucciones =
	'Elige cuántos LP apuestas y a qué, y gira. Si aciertas cobras: 1 a 1 en color y par/impar, 2 a 1 en las docenas y 35 a 1 en un número. Si sale el 67, la banca se lo queda todo, salvo que hayas apostado al 67.';

// La casilla de la banca: el 67 ocupa el sitio del 0 de la ruleta europea
const BANCA = 67;

// Orden de las casillas, en el sentido de las agujas del reloj (como la ruleta europea)
const ORDEN = [BANCA, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const ROJOS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const colorDe = (n: number) => (n === BANCA ? 'verde' : ROJOS.has(n) ? 'rojo' : 'negro');
const PINTURA = { verde: '#2e8b3d', rojo: '#c0392b', negro: '#1d1d1f' };

const DURACION_GIRO = 4300;
const VUELTAS = 5;

interface Apuesta {
	id: ApuestaRuleta;
	texto: string;
	/** Puntos que se cobran por cada punto apostado (además de recuperar lo apostado) */
	paga: number;
}

const APUESTAS: Apuesta[] = [
	{ id: 'rojo', texto: 'Rojo', paga: 1 },
	{ id: 'negro', texto: 'Negro', paga: 1 },
	{ id: 'par', texto: 'Par', paga: 1 },
	{ id: 'impar', texto: 'Impar', paga: 1 },
	{ id: 'd1', texto: '1–12', paga: 2 },
	{ id: 'd2', texto: '13–24', paga: 2 },
	{ id: 'd3', texto: '25–36', paga: 2 },
	{ id: 'numero', texto: 'Un número', paga: 35 },
];

const MENSAJES_ERROR: Record<string, string> = {
	'sin-puntos': 'No tienes tantos LP para apostar',
	'liga-cerrada': 'La liga ya ha terminado: el casino está cerrado',
	'sin-equipo': 'Elige equipo antes de apostar',
};

/** Dibuja la ruleta con la casilla de la banca centrada arriba y el resto en sentido horario */
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
		// Número, escrito a lo largo del radio (de dentro hacia fuera) para que quepan los de dos cifras
		ctx.save();
		ctx.rotate(i * paso);
		ctx.translate(0, -R * 0.8);
		ctx.rotate(-Math.PI / 2);
		ctx.fillStyle = '#fbf4e4';
		ctx.font = `500 ${R * 0.15}px sans-serif`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(String(n), 0, 0);
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

export async function jugar(area: HTMLElement, senal: AbortSignal, ctx: Contexto): Promise<Resultado> {
	const inicial = await bancaCasino();
	return new Promise((resolve) => {
		let apuesta: Apuesta | null = null;
		let numero: number | null = null;
		let girando = false;
		let terminada = false;
		let banca = inicial.puntos;
		let rotacion = 0;
		let neto = 0;
		let giros = 0;
		let aciertos = 0;

		const escena = el('div', 'casino-escena');
		const marcador = crearBanca();
		const crupier = crearCrupier(ctx.crupierSrc, '¡Hagan juego, señores!');
		const rueda = el('div', 'ruleta-rueda');
		const lienzo = document.createElement('canvas');
		rueda.append(lienzo, el('span', 'ruleta-marca'));
		dibujarRueda(lienzo, 288);

		const fichas = crearFichas();
		const apuestasEl = el('div', 'ruleta-apuestas');
		const numerosEl = el('div', 'ruleta-numeros');
		numerosEl.hidden = true;
		const resultado = el('p', 'ruleta-resultado', 'Elige tu apuesta');
		resultado.setAttribute('aria-live', 'polite');
		const girar = el('button', 'tirada-boton', '¡Girar!');
		girar.type = 'button';
		girar.disabled = true;
		const salir = el('button', 'tirada-boton tirada-boton-sec', 'Salir del casino');
		salir.type = 'button';

		marcador.poner(banca, inicial.prueba);
		fichas.refrescar(banca);

		function actualizar() {
			const apostado = fichas.valor();
			const lista = apostado > 0 && (apuesta?.id === 'numero' ? numero !== null : apuesta !== null);
			girar.disabled = !lista || girando;
			if (girando) return;
			resultado.className = 'ruleta-resultado';
			if (apostado === 0) {
				resultado.textContent = 'No te quedan LP para apostar';
				return;
			}
			resultado.textContent = !apuesta
				? 'Elige tu apuesta'
				: apuesta.id === 'numero'
					? numero === null
						? 'Elige un número del 1 al 36 o el 67'
						: `${apostado} al ${numero}: cobras ${apostado * apuesta.paga} si sale`
					: `${apostado} a ${apuesta.texto.toLowerCase()}: cobras ${apostado * apuesta.paga} si sale`;
		}

		fichas.el.addEventListener('click', actualizar);

		APUESTAS.forEach((a) => {
			const b = el('button', 'ruleta-apuesta');
			b.type = 'button';
			b.dataset.color = a.id === 'rojo' || a.id === 'negro' ? a.id : '';
			b.append(a.texto, el('small', '', `${a.paga} a 1`));
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
		// Como en la mesa real: 3 filas de 12 (arriba 3, 6, 9… 36; abajo 1, 4, 7… 34) y el 67 en su propia fila
		const mesa = [3, 2, 1].flatMap((fila) => Array.from({ length: 12 }, (_, col) => col * 3 + fila));
		for (const n of [...mesa, BANCA]) {
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

		function terminar() {
			if (terminada) return;
			terminada = true;
			resolve({
				puntos: neto,
				detalle: giros ? `${giros} ${giros === 1 ? 'giro' : 'giros'}, ${aciertos} ${aciertos === 1 ? 'acierto' : 'aciertos'}` : 'Sin girar',
			});
		}

		girar.addEventListener('click', async () => {
			const apostado = fichas.valor();
			if (!apuesta || girando || apostado === 0) return;
			girando = true;
			girar.disabled = true;
			salir.disabled = true;
			fichas.bloquear(true);
			resultado.className = 'ruleta-resultado';
			resultado.textContent = 'Girando…';
			crupier.decir('¡No va más!');

			// El servidor gira y apunta el resultado ANTES de la animación: cerrar la ventana no evita perder
			let ganador: number;
			let acierta: boolean;
			let ganancia: number;
			try {
				const giro = await girarRuleta(apuesta.id, apostado, apuesta.id === 'numero' ? numero : null);
				({ casilla: ganador, gana: acierta, neto: ganancia, puntos: banca } = giro);
			} catch (e) {
				girando = false;
				salir.disabled = false;
				fichas.bloquear(false);
				actualizar();
				resultado.textContent = MENSAJES_ERROR[e instanceof Error ? e.message : ''] ?? 'No se ha podido apostar. Inténtalo otra vez';
				crupier.decir('Vaya, no ha entrado la apuesta.');
				return;
			}
			neto += ganancia;
			giros++;
			if (acierta) aciertos++;

			// La rueda gira hasta dejar la casilla ganadora bajo la marca de arriba, siempre hacia delante
			const paso = 360 / ORDEN.length;
			const destino = (360 - ((ORDEN.indexOf(ganador) * paso) % 360)) % 360;
			rotacion = Math.floor(rotacion / 360) * 360 + 360 * VUELTAS + destino;
			void lienzo.offsetWidth;
			lienzo.style.transform = `rotate(${rotacion}deg)`;
			await esperar(DURACION_GIRO);
			// Se avisa al parar (si no, el ascenso saldría antes que el número) y, si ha ganado, con un momento para celebrarlo
			window.setTimeout(() => document.dispatchEvent(new CustomEvent('liga:cambio')), acierta ? 1800 : 0);
			if (terminada) return;

			const color = colorDe(ganador);
			let texto = `Salió el ${ganador} ${color}. `;
			let clase = 'mal';
			if (ganador === BANCA && acierta) {
				texto = `¡Salió el 67 y apostaste al 67! ${conSigno(ganancia)}${inicial.prueba ? '' : '. Mira tu carta en Participantes'}`;
				clase = 'bien';
				crupier.decir('¡Six seven, six seven!');
			} else if (ganador === BANCA) {
				texto = `¡Salió el 67! La banca se queda tus ${apostado}`;
				crupier.decir('¡Six seven, six seven!');
			} else if (acierta) {
				texto += `¡Aciertas! ${conSigno(ganancia)}`;
				clase = 'bien';
				crupier.decir('¡Enhorabuena! Eso se cobra.');
			} else {
				texto += `Pierdes ${apostado}`;
				crupier.decir('Suerte para la próxima.');
			}
			navigator.vibrate?.(ganador === BANCA && !acierta ? [80, 40, 80] : acierta ? 30 : 10);

			girando = false;
			salir.disabled = false;
			marcador.poner(banca, inicial.prueba);
			fichas.bloquear(false);
			fichas.refrescar(banca);
			girar.textContent = 'Girar otra vez';
			actualizar();
			// Se deja a la vista lo que acaba de pasar hasta que cambie la apuesta
			if (fichas.valor() > 0) {
				resultado.className = `ruleta-resultado ${clase}`;
				resultado.textContent = texto;
			}
		});

		salir.addEventListener('click', terminar);

		escena.append(crupier.el, crearMesa(marcador.el, rueda, resultado, fichas.el, apuestasEl, numerosEl, girar, salir));
		area.replaceChildren(escena);
		actualizar();
		senal.addEventListener('abort', terminar, { once: true });
	});
}
