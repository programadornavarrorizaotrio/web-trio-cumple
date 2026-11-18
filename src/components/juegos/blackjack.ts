// Blackjack contra la banca. Es un juego libre (sin tirada ni límite diario): se apuestan puntos propios por mano.
// Reglas: gana quien se acerque más a 21 sin pasarse. El blackjack (21 con las dos primeras cartas) paga 3 a 2,
// lo demás 1 a 1 y el empate devuelve la apuesta. Se puede pedir, plantarse o doblar (una sola carta más y el doble
// de apuesta). No hay separar ni seguro. La banca se planta con 17 o más, también con un 17 "blando".
//
// TODO(DB): las cartas debería repartirlas el SERVIDOR (RPC `apostar_casino(clave, 'blackjack', ...)` por jugada),
// con la segunda carta de la banca oculta hasta el final; si se reparten en el navegador, se podrían elegir.
// Hoy cerrar la ventana a media mano cuenta como perderla, pero recargar la página no: el servidor debe
// guardar la mano en curso.
// TODO(admin): las fichas y la apuesta máxima se editarán desde el admin (CONFIG en liga.ts).
import { apostarEnCasino, bancaCasino } from './liga';
import { conSigno, crearBanca, crearCrupier, crearFichas, crearMesa, el, esperar } from './casino';
import type { Contexto, Resultado } from './partida';

export const instrucciones =
	'Elige cuántos puntos apuestas y reparte. Acércate a 21 sin pasarte y por encima de la banca. Puedes pedir carta, plantarte o doblar. El blackjack paga 3 a 2 y la banca se planta con 17.';

const PALOS = ['♠', '♥', '♦', '♣'];
const ROJOS = new Set(['♥', '♦']);
const RANGOS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

const PAUSA_CARTA = 650;

interface Carta {
	rango: string;
	palo: string;
}

const azar = (n: number) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
const sacar = (): Carta => ({ rango: RANGOS[azar(13)], palo: PALOS[azar(4)] });

function valor(mano: Carta[]) {
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

const esBlackjack = (mano: Carta[]) => mano.length === 2 && valor(mano) === 21;

function carta(c: Carta | null) {
	const e = el('span', c ? 'bj-carta' : 'bj-carta bj-oculta');
	if (!c) {
		e.setAttribute('aria-label', 'Carta boca abajo');
		return e;
	}
	if (ROJOS.has(c.palo)) e.classList.add('roja');
	e.setAttribute('aria-label', `${c.rango} de ${c.palo}`);
	e.append(el('span', 'bj-rango', c.rango), el('span', 'bj-palo', c.palo));
	return e;
}

export async function jugar(area: HTMLElement, senal: AbortSignal, ctx: Contexto): Promise<Resultado> {
	const inicial = await bancaCasino();
	return new Promise((resolve) => {
		let banca = inicial.puntos;
		let terminada = false;
		let neto = 0;
		let manos = 0;
		let ganadas = 0;
		// Mano en curso: lo que hay en juego y si aún no se ha resuelto
		let enMano = false;
		let apostado = 0;
		let jugador: Carta[] = [];
		let casa: Carta[] = [];

		const escena = el('div', 'casino-escena');
		const marcador = crearBanca();
		const crupier = crearCrupier(ctx.crupierSrc, 'Siéntate, que reparto.');
		const casaEl = el('div', 'bj-mano');
		const casaTotal = el('p', 'bj-total');
		const jugadorEl = el('div', 'bj-mano');
		const jugadorTotal = el('p', 'bj-total');
		const mensaje = el('p', 'ruleta-resultado', 'Elige tu apuesta y reparte');
		mensaje.setAttribute('aria-live', 'polite');
		const fichas = crearFichas();
		const acciones = el('div', 'bj-acciones');

		const mesa = el('div', 'bj-mesa');
		mesa.append(el('p', 'bj-etiqueta', 'Banca'), casaEl, casaTotal, el('p', 'bj-etiqueta', 'Tú'), jugadorEl, jugadorTotal);

		marcador.poner(banca, inicial.prueba);
		fichas.refrescar(banca);

		function boton(texto: string, alPulsar: () => void, secundario = false) {
			const b = el('button', secundario ? 'tirada-boton tirada-boton-sec' : 'tirada-boton', texto);
			b.type = 'button';
			b.addEventListener('click', alPulsar);
			return b;
		}

		function pintar(ocultarCasa: boolean) {
			casaEl.replaceChildren(...casa.map((c, i) => carta(ocultarCasa && i === 1 ? null : c)));
			jugadorEl.replaceChildren(...jugador.map((c) => carta(c)));
			casaTotal.textContent = casa.length ? (ocultarCasa ? `${valor(casa.slice(0, 1))}` : String(valor(casa))) : '';
			jugadorTotal.textContent = jugador.length ? String(valor(jugador)) : '';
		}

		function terminar() {
			if (terminada) return;
			terminada = true;
			// Cerrar la ventana a media mano es perderla
			if (enMano) {
				enMano = false;
				neto -= apostado;
				void apostarEnCasino('blackjack', apostado, -apostado)
					.catch(() => undefined)
					.then(() => document.dispatchEvent(new CustomEvent('liga:cambio')));
			}
			resolve({
				puntos: neto,
				detalle: manos ? `${manos} ${manos === 1 ? 'mano' : 'manos'}, ${ganadas} ${ganadas === 1 ? 'ganada' : 'ganadas'}` : 'Sin jugar',
			});
		}

		/** Pantalla de entre manos: elegir apuesta y repartir, o salir */
		function entreManos() {
			fichas.bloquear(false);
			fichas.refrescar(banca);
			marcador.poner(banca, inicial.prueba);
			const sinPuntos = fichas.valor() === 0;
			if (sinPuntos) {
				mensaje.className = 'ruleta-resultado';
				mensaje.textContent = 'No te quedan puntos para apostar';
			}
			acciones.replaceChildren(...(sinPuntos ? [] : [boton(manos ? 'Repartir otra vez' : 'Repartir', repartir)]), boton('Salir del casino', terminar, true));
		}

		async function resolver(motivo: 'blackjack' | 'pierde-pasado' | 'compara') {
			enMano = false;
			acciones.replaceChildren();
			const mia = valor(jugador);
			const suya = valor(casa);
			let ganancia = 0;
			let texto = '';
			if (motivo === 'pierde-pasado') {
				ganancia = -apostado;
				texto = `Te pasas de 21. Pierdes ${apostado}`;
			} else if (esBlackjack(jugador) && esBlackjack(casa)) {
				texto = 'Blackjack para los dos: empate';
			} else if (esBlackjack(jugador)) {
				ganancia = Math.floor(apostado * 1.5);
				texto = `¡Blackjack! ${conSigno(ganancia)}`;
			} else if (esBlackjack(casa)) {
				ganancia = -apostado;
				texto = `Blackjack de la banca. Pierdes ${apostado}`;
			} else if (suya > 21) {
				ganancia = apostado;
				texto = `La banca se pasa (${suya}). ¡Ganas! ${conSigno(ganancia)}`;
			} else if (mia > suya) {
				ganancia = apostado;
				texto = `${mia} contra ${suya}. ¡Ganas! ${conSigno(ganancia)}`;
			} else if (mia < suya) {
				ganancia = -apostado;
				texto = `${mia} contra ${suya}. Pierdes ${apostado}`;
			} else {
				texto = `Empate a ${mia}: recuperas lo apostado`;
			}

			pintar(false);
			try {
				banca = (await apostarEnCasino('blackjack', apostado, ganancia)).puntos;
			} catch {
				mensaje.className = 'ruleta-resultado mal';
				mensaje.textContent = 'No se ha podido anotar la mano';
				entreManos();
				return;
			}
			neto += ganancia;
			manos++;
			if (ganancia > 0) ganadas++;
			if (terminada) return;
			document.dispatchEvent(new CustomEvent('liga:cambio'));
			navigator.vibrate?.(ganancia > 0 ? 30 : 10);
			entreManos();
			mensaje.className = `ruleta-resultado ${ganancia > 0 ? 'bien' : ganancia < 0 ? 'mal' : ''}`;
			mensaje.textContent = texto;
			crupier.decir(ganancia > 0 ? '¡Bien jugado!' : ganancia < 0 ? 'La banca gana esta mano.' : 'Tablas. Otra vuelta.');
		}

		/** Le toca a la banca: enseña la carta oculta y roba hasta 17 */
		async function turnoBanca() {
			acciones.replaceChildren();
			mensaje.className = 'ruleta-resultado';
			mensaje.textContent = 'Juega la banca…';
			crupier.decir('Me toca a mí…');
			pintar(false);
			await esperar(PAUSA_CARTA);
			while (!terminada && valor(casa) < 17) {
				casa.push(sacar());
				pintar(false);
				await esperar(PAUSA_CARTA);
			}
			if (terminada) return;
			await resolver('compara');
		}

		function turnoJugador() {
			const puedeDoblar = jugador.length === 2 && banca >= apostado * 2;
			mensaje.className = 'ruleta-resultado';
			mensaje.textContent = 'Tu turno';
			crupier.decir('¿Carta o te plantas?');
			acciones.replaceChildren(
				boton('Pedir carta', pedir),
				boton('Plantarme', () => void turnoBanca()),
				...(puedeDoblar ? [boton(`Doblar (${apostado * 2})`, doblar, true)] : []),
			);
		}

		async function pedir() {
			jugador.push(sacar());
			pintar(true);
			const total = valor(jugador);
			if (total > 21) return void (await resolver('pierde-pasado'));
			if (total === 21) return void (await turnoBanca());
			turnoJugador();
		}

		async function doblar() {
			apostado *= 2;
			jugador.push(sacar());
			pintar(true);
			if (valor(jugador) > 21) return void (await resolver('pierde-pasado'));
			await turnoBanca();
		}

		async function repartir() {
			const puntos = fichas.valor();
			if (enMano || puntos === 0 || terminada) return;
			enMano = true;
			apostado = puntos;
			fichas.bloquear(true);
			jugador = [sacar(), sacar()];
			casa = [sacar(), sacar()];
			acciones.replaceChildren();
			pintar(true);
			// Con blackjack de alguien (la banca lo mira antes de seguir) se acaba la mano al momento
			if (esBlackjack(jugador) || esBlackjack(casa)) {
				await esperar(PAUSA_CARTA);
				if (terminada) return;
				return void (await resolver('blackjack'));
			}
			turnoJugador();
		}

		escena.append(crupier.el, crearMesa(marcador.el, mesa, mensaje, fichas.el, acciones));
		area.replaceChildren(escena);
		entreManos();
		senal.addEventListener('abort', terminar, { once: true });
	});
}
