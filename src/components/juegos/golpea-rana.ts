// Golpea la rana: 9 agujeros, la rana asoma y hay que tocarla antes de que se esconda.
// 1 punto por rana; la dorada (poco frecuente) vale 3. Se acelera a medida que pasa el tiempo.
import { MINIJUEGOS } from './liga';
import type { Contexto, Resultado } from './partida';

export const instrucciones = 'La rana asoma por los agujeros: tócala antes de que se esconda. Dura 30 segundos y la rana dorada vale 3.';

// Ajustes de dificultad (ms): al principio es tranquilo y al final va rápido
const DURACION = 30_000;
const INTERVALO = [1400, 850] as const; // entre apariciones: inicio → final
const VIDA = [750, 400] as const; // cuánto se queda fuera: inicio → final
const AGUJEROS = 9;
const PROB_DORADA = 0.08;
const MAX = MINIJUEGOS.find((m) => m.id === 'golpea-rana')!.maxPuntos;

const entre = (rango: readonly [number, number], p: number) => rango[0] + (rango[1] - rango[0]) * p;

export function jugar(area: HTMLElement, senal: AbortSignal, { ranaSrc }: Contexto): Promise<Resultado> {
	return new Promise((resolve) => {
		const hud = document.createElement('div');
		hud.className = 'rana-hud';
		const barra = document.createElement('div');
		barra.className = 'rana-tiempo';
		const relleno = document.createElement('i');
		barra.append(relleno);
		const marcador = document.createElement('output');
		marcador.textContent = '0 pts';
		hud.append(barra, marcador);

		const campo = document.createElement('div');
		campo.className = 'rana-campo';
		const agujeros = Array.from({ length: AGUJEROS }, (_, i) => {
			const b = document.createElement('button');
			b.type = 'button';
			b.className = 'rana-agujero';
			b.setAttribute('aria-label', `Agujero ${i + 1}`);
			const fondo = document.createElement('span');
			fondo.className = 'rana-fondo';
			const bicho = document.createElement('img');
			bicho.className = 'rana-bicho';
			bicho.src = ranaSrc;
			bicho.alt = '';
			bicho.draggable = false;
			const borde = document.createElement('span');
			borde.className = 'rana-borde';
			b.append(fondo, bicho, borde);
			campo.append(b);
			return b;
		});
		area.replaceChildren(hud, campo);

		let puntos = 0;
		let golpes = 0;
		let terminada = false;
		const inicio = performance.now();
		const bajadas = new Map<HTMLElement, number>();

		function bajar(b: HTMLElement) {
			clearTimeout(bajadas.get(b));
			bajadas.delete(b);
			b.classList.remove('arriba', 'golpeada', 'dorada');
		}

		function subir(p: number) {
			const libres = agujeros.filter((b) => !b.classList.contains('arriba'));
			if (!libres.length) return;
			const b = libres[Math.floor(Math.random() * libres.length)];
			b.classList.toggle('dorada', Math.random() < PROB_DORADA);
			b.classList.add('arriba');
			bajadas.set(b, window.setTimeout(() => bajar(b), entre(VIDA, p)));
		}

		// Aparece una rana cada cierto tiempo, y dos a la vez en el último tramo
		function turno() {
			if (terminada) return;
			const p = Math.min(1, (performance.now() - inicio) / DURACION);
			const fuera = agujeros.filter((b) => b.classList.contains('arriba')).length;
			if (fuera < (p < 0.6 ? 1 : 2)) subir(p);
			timerTurno = window.setTimeout(turno, entre(INTERVALO, p) * (0.8 + Math.random() * 0.4));
		}
		let timerTurno = window.setTimeout(turno, 600);

		agujeros.forEach((b) => {
			// pointerdown responde antes que click en el móvil
			b.addEventListener('pointerdown', () => {
				if (terminada || !b.classList.contains('arriba') || b.classList.contains('golpeada')) return;
				const valor = b.classList.contains('dorada') ? 3 : 1;
				puntos += valor;
				golpes++;
				marcador.textContent = `${Math.min(MAX, puntos)} pts`;
				navigator.vibrate?.(25);
				clearTimeout(bajadas.get(b));
				b.classList.add('golpeada');
				const pop = document.createElement('span');
				pop.className = 'rana-pop';
				pop.textContent = `+${valor}`;
				b.append(pop);
				setTimeout(() => pop.remove(), 650);
				bajadas.set(b, window.setTimeout(() => bajar(b), 220));
			});
		});

		const reloj = window.setInterval(() => {
			const restante = DURACION - (performance.now() - inicio);
			relleno.style.width = `${Math.max(0, restante / DURACION) * 100}%`;
			if (restante <= 0) terminar();
		}, 100);

		function terminar() {
			if (terminada) return;
			terminada = true;
			clearTimeout(timerTurno);
			clearInterval(reloj);
			bajadas.forEach((t) => clearTimeout(t));
			resolve({ puntos: Math.min(MAX, puntos), detalle: `${golpes} ${golpes === 1 ? 'rana golpeada' : 'ranas golpeadas'}` });
		}
		senal.addEventListener('abort', terminar, { once: true });
	});
}
