// Adivina el cromo: la foto de un invitado empieza muy difuminada y se va aclarando. Eliges su nombre
// entre cuatro. Cuanto antes aciertes, más puntos; si fallas, cero en esa ronda.
// Hasta 5 rondas; si hay pocas fotos (hoy solo las del trío), menos rondas con más puntos cada una.
import { obtenerAlbum } from '../cromos/datos';
import type { Cromo } from '../cromos/tipos';
import { MINIJUEGOS } from './liga';
import type { Resultado } from './partida';

export const instrucciones = 'Una foto muy difuminada se va aclarando: elige quién es. Cuanto antes aciertes, más LP.';

const MAX_RONDAS = 5;
const MAX = MINIJUEGOS.find((m) => m.id === 'adivina-cromo')!.maxPuntos;
const TIEMPO_ACLARADO = 8000; // la foto se ve entera pasado este tiempo
const DIFUMINADO = 26; // px de blur al empezar
const SUELO = 0.25; // fracción de los puntos que queda aunque esperes a ver la foto entera
const PAUSA = 1300;

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

export async function jugar(area: HTMLElement, senal: AbortSignal): Promise<Resultado> {
	const { cromos } = await obtenerAlbum();
	const conFoto = barajar(cromos.filter((c) => c.foto));
	const rondas = conFoto.slice(0, MAX_RONDAS);
	const porRonda = MAX / Math.max(1, rondas.length);

	return new Promise((resolve) => {
		const hud = el('div', 'adv-hud');
		const marcadorRonda = el('span', '');
		const marcadorPuntos = el('span', '', '0 LP');
		hud.append(marcadorRonda, marcadorPuntos);

		const marco = el('div', 'adv-marco');
		const foto = el('img', 'adv-foto');
		foto.alt = '';
		foto.draggable = false;
		const quien = el('p', 'adv-quien');
		marco.append(foto, quien);
		const opciones = el('div', 'adv-opciones');
		area.replaceChildren(hud, marco, opciones);

		let puntos = 0;
		let aciertos = 0;
		let ronda = 0;
		let terminada = false;
		let inicioRonda = 0;
		let contestada = false;
		const timers = new Set<number>();

		function terminar() {
			if (terminada) return;
			terminada = true;
			timers.forEach(clearTimeout);
			resolve({ puntos: Math.min(MAX, Math.round(puntos)), detalle: `${aciertos}/${rondas.length} aciertos` });
		}

		function empezarRonda() {
			if (terminada) return;
			if (ronda >= rondas.length) return terminar();
			const cromo = rondas[ronda];
			contestada = false;
			marcadorRonda.textContent = `Ronda ${ronda + 1}/${rondas.length}`;
			marcadorPuntos.textContent = `${Math.round(puntos)} LP`;
			quien.textContent = '';
			quien.hidden = true;

			// La foto arranca difuminada y se aclara sola de forma lineal
			foto.style.transition = 'none';
			foto.style.filter = `blur(${DIFUMINADO}px)`;
			foto.src = cromo.foto!;
			void foto.offsetWidth;
			foto.style.transition = `filter ${TIEMPO_ACLARADO}ms linear`;
			foto.style.filter = 'blur(0px)';
			inicioRonda = performance.now();

			// Tres nombres falsos de cualquier otro cromo, y el correcto, mezclados
			const falsos = barajar(cromos.filter((c) => c.id !== cromo.id)).slice(0, 3);
			opciones.replaceChildren(
				...barajar([cromo, ...falsos]).map((c) => {
					const b = el('button', 'adv-opcion', c.nombre);
					b.type = 'button';
					b.addEventListener('click', () => responder(b, c, cromo));
					return b;
				}),
			);
		}

		function responder(boton: HTMLButtonElement, elegido: Cromo, cromo: Cromo) {
			if (terminada || contestada) return;
			contestada = true;
			const acierto = elegido.id === cromo.id;
			const f = Math.min(1, (performance.now() - inicioRonda) / TIEMPO_ACLARADO);
			if (acierto) {
				puntos += porRonda * (1 - (1 - SUELO) * f);
				aciertos++;
			}
			marcadorPuntos.textContent = `${Math.round(puntos)} LP`;
			navigator.vibrate?.(acierto ? 25 : [60, 40, 60]);

			// Se enseña la foto entera y se marca la buena y, si falló, la elegida
			// (el valor final ya era blur(0), así que se congela el actual para que arranque una transición nueva)
			const actual = getComputedStyle(foto).filter;
			foto.style.transition = 'none';
			foto.style.filter = actual;
			void foto.offsetWidth;
			foto.style.transition = 'filter 0.3s ease-out';
			foto.style.filter = 'blur(0px)';
			quien.textContent = cromo.nombre;
			quien.hidden = false;
			opciones.querySelectorAll<HTMLButtonElement>('.adv-opcion').forEach((b) => {
				b.disabled = true;
				if (b.textContent === cromo.nombre) b.classList.add('bien');
			});
			if (!acierto) boton.classList.add('mal');

			ronda++;
			timers.add(window.setTimeout(empezarRonda, PAUSA));
		}

		if (!rondas.length) return terminar();
		empezarRonda();
		senal.addEventListener('abort', terminar, { once: true });
	});
}
