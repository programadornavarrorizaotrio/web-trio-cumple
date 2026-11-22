// Blackjack contra la banca. Es un juego libre (sin tirada ni límite diario): se apuestan puntos propios por mano.
// Reglas: gana quien se acerque más a 21 sin pasarse. El blackjack (21 con las dos primeras cartas) paga 3 a 2,
// lo demás 1 a 1 y el empate devuelve la apuesta. Se puede pedir, plantarse o doblar (una sola carta más y el doble
// de apuesta). No hay separar ni seguro. La banca se planta con 17 o más, también con un 17 "blando".
//
// Las cartas las reparte el SERVIDOR (`repartirBlackjack` / `jugarBlackjack` en liga.ts → RPC `blackjack_*`), con la
// segunda carta de la banca oculta hasta el final. Aquí solo se pintan y se animan. La mano en curso queda guardada:
// si se cierra la ventana a mitad, al volver se sigue donde estaba.
// TODO(admin): las fichas y la apuesta máxima se editarán desde el admin (CONFIG en liga.ts).
import { bancaCasino, esBlackjack, jugarBlackjack, manoBlackjackAbierta, repartirBlackjack, valorMano, type AccionBlackjack, type Carta, type ManoBlackjack } from './liga';
import { conSigno, crearBanca, crearCrupier, crearFichas, crearMesa, el, esperar } from './casino';
import type { Contexto, Resultado } from './partida';

export const instrucciones =
	'Elige cuántos LP apuestas y reparte. Acércate a 21 sin pasarte y por encima de la banca. Puedes pedir carta, plantarte o doblar. El blackjack paga 3 a 2 y la banca se planta con 17.';

const ROJOS = new Set(['♥', '♦']);

const PAUSA_CARTA = 650;

const MENSAJES_ERROR: Record<string, string> = {
	'sin-puntos': 'No tienes tantos LP para apostar',
	'liga-cerrada': 'La liga ya ha terminado: el casino está cerrado',
	'sin-equipo': 'Elige equipo antes de apostar',
};

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

/** Texto del final de una mano a partir de las cartas y lo ganado */
function desenlace(m: ManoBlackjack): string {
	const mia = valorMano(m.jugador);
	const suya = valorMano(m.banca);
	const neto = m.neto ?? 0;
	if (mia > 21) return `Te pasas de 21. Pierdes ${m.apuesta}`;
	if (esBlackjack(m.jugador) && esBlackjack(m.banca)) return 'Blackjack para los dos: empate';
	if (esBlackjack(m.jugador)) return `¡Blackjack! ${conSigno(neto)}`;
	if (esBlackjack(m.banca)) return `Blackjack de la banca. Pierdes ${m.apuesta}`;
	if (suya > 21) return `La banca se pasa (${suya}). ¡Ganas! ${conSigno(neto)}`;
	if (neto > 0) return `${mia} contra ${suya}. ¡Ganas! ${conSigno(neto)}`;
	if (neto < 0) return `${mia} contra ${suya}. Pierdes ${m.apuesta}`;
	return `Empate a ${mia}: recuperas lo apostado`;
}

export async function jugar(area: HTMLElement, senal: AbortSignal, ctx: Contexto): Promise<Resultado> {
	const inicial = await bancaCasino();
	const abierta = await manoBlackjackAbierta().catch(() => null);
	return new Promise((resolve) => {
		let banca = abierta?.puntos ?? inicial.puntos;
		let terminada = false;
		let neto = 0;
		let manos = 0;
		let ganadas = 0;

		const escena = el('div', 'casino-escena');
		const marcador = crearBanca();
		const crupier = crearCrupier(ctx.crupierSrc, abierta ? 'Te guardé la mano. ¿Seguimos?' : 'Siéntate, que reparto.');
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

		/** Pinta las cartas. `casa` son las que se ven de la banca; `oculta` añade la que está boca abajo */
		function pintar(jugador: Carta[], casa: Carta[], oculta: boolean) {
			casaEl.replaceChildren(...casa.map((c) => carta(c)), ...(oculta ? [carta(null)] : []));
			jugadorEl.replaceChildren(...jugador.map((c) => carta(c)));
			casaTotal.textContent = casa.length ? String(valorMano(casa)) : '';
			jugadorTotal.textContent = jugador.length ? String(valorMano(jugador)) : '';
		}

		function fallo(e: unknown) {
			mensaje.className = 'ruleta-resultado mal';
			mensaje.textContent = MENSAJES_ERROR[e instanceof Error ? e.message : ''] ?? 'No se ha podido jugar la mano. Inténtalo otra vez';
		}

		function terminar() {
			if (terminada) return;
			terminada = true;
			// Una mano a medias se queda guardada: al volver al blackjack se sigue
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
				mensaje.textContent = 'No te quedan LP para apostar';
			}
			acciones.replaceChildren(...(sinPuntos ? [] : [boton(manos ? 'Repartir otra vez' : 'Repartir', () => void repartir())]), boton('Salir del casino', terminar, true));
		}

		/** Mano terminada: se destapa la banca carta a carta y se cuenta el resultado */
		async function cerrar(m: ManoBlackjack) {
			acciones.replaceChildren();
			const cuentaBanca = m.banca.length > 2 || !esBlackjack(m.jugador);
			if (valorMano(m.jugador) <= 21 && cuentaBanca) {
				mensaje.className = 'ruleta-resultado';
				mensaje.textContent = 'Juega la banca…';
				crupier.decir('Me toca a mí…');
			}
			for (let i = 2; i <= m.banca.length; i++) {
				pintar(m.jugador, m.banca.slice(0, i), false);
				await esperar(PAUSA_CARTA);
				if (terminada) return;
			}
			const ganancia = m.neto ?? 0;
			banca = m.puntos;
			neto += ganancia;
			manos++;
			if (ganancia > 0) ganadas++;
			document.dispatchEvent(new CustomEvent('liga:cambio'));
			navigator.vibrate?.(ganancia > 0 ? 30 : 10);
			entreManos();
			mensaje.className = `ruleta-resultado ${ganancia > 0 ? 'bien' : ganancia < 0 ? 'mal' : ''}`;
			mensaje.textContent = desenlace(m);
			crupier.decir(ganancia > 0 ? '¡Bien jugado!' : ganancia < 0 ? 'La banca gana esta mano.' : 'Tablas. Otra vuelta.');
		}

		/** Pinta lo que devuelve el servidor y sigue: turno del jugador o fin de la mano */
		async function mostrar(m: ManoBlackjack) {
			banca = m.puntos;
			marcador.poner(banca, inicial.prueba);
			if (m.estado === 'terminada') {
				pintar(m.jugador, m.banca.slice(0, 1), true);
				await esperar(PAUSA_CARTA);
				if (!terminada) await cerrar(m);
				return;
			}
			pintar(m.jugador, m.banca, true);
			const puedeDoblar = m.puedeDoblar && banca >= m.apuesta;
			mensaje.className = 'ruleta-resultado';
			mensaje.textContent = 'Tu turno';
			crupier.decir('¿Carta o te plantas?');
			acciones.replaceChildren(
				boton('Pedir carta', () => void jugada('pedir')),
				boton('Plantarme', () => void jugada('plantarse')),
				...(puedeDoblar ? [boton(`Doblar (${m.apuesta * 2})`, () => void jugada('doblar'), true)] : []),
			);
		}

		async function jugada(accion: AccionBlackjack) {
			acciones.querySelectorAll('button').forEach((b) => (b.disabled = true));
			try {
				await mostrar(await jugarBlackjack(accion));
			} catch (e) {
				fallo(e);
				const m = await manoBlackjackAbierta().catch(() => null);
				if (m) await mostrar(m);
				else entreManos();
			}
		}

		async function repartir() {
			const puntos = fichas.valor();
			if (puntos === 0 || terminada) return;
			fichas.bloquear(true);
			acciones.replaceChildren();
			try {
				await mostrar(await repartirBlackjack(puntos));
			} catch (e) {
				fallo(e);
				entreManos();
			}
		}

		escena.append(crupier.el, crearMesa(marcador.el, mesa, mensaje, fichas.el, acciones));
		area.replaceChildren(escena);
		if (abierta) {
			fichas.bloquear(true);
			void mostrar(abierta);
		} else {
			entreManos();
		}
		senal.addEventListener('abort', terminar, { once: true });
	});
}
