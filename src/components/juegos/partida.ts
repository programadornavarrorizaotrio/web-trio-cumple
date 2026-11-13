// Lanzador común de minijuegos: pantalla de instrucciones → partida → resultado.
// Cada minijuego es un módulo que exporta `instrucciones` y `jugar`; aquí solo se registra cuál es cuál.
import { registrarPartida, type MinijuegoId, MINIJUEGOS } from './liga';

export interface Resultado {
	/** Puntos de la partida (la liga los acota al máximo del minijuego) */
	puntos: number;
	/** Línea de resumen para la pantalla final, p. ej. "23 ranas" */
	detalle?: string;
}

export interface Contexto {
	/** Imagen optimizada de la rana mascota */
	ranaSrc: string;
}

export interface Minijuego {
	instrucciones: string;
	/**
	 * Juega una partida dentro de `area`. Debe terminar sola y, si salta `senal`
	 * (el invitado cierra la ventana), resolver al momento con lo que lleve.
	 */
	jugar(area: HTMLElement, senal: AbortSignal, ctx: Contexto): Promise<Resultado>;
}

const modulos: Partial<Record<MinijuegoId, () => Promise<Minijuego>>> = {
	'golpea-rana': () => import('./golpea-rana'),
	'memory-cromos': () => import('./memory-cromos'),
};

export const hayJuego = (id: string): id is MinijuegoId => id in modulos;

export async function lanzar(id: MinijuegoId) {
	const dialogo = document.querySelector<HTMLDialogElement>('[data-partida]')!;
	const q = <T extends HTMLElement>(sel: string) => dialogo.querySelector<T>(sel)!;
	const pantalla = (nombre: 'intro' | 'juego' | 'final') =>
		dialogo.querySelectorAll<HTMLElement>('[data-pantalla]').forEach((p) => (p.hidden = p.dataset.pantalla !== nombre));

	const juego = await modulos[id]!();
	const info = MINIJUEGOS.find((m) => m.id === id)!;

	q('[data-titulo]').textContent = info.titulo;
	q('[data-instrucciones]').textContent = juego.instrucciones;
	q('[data-maximo]').textContent = String(info.maxPuntos);
	pantalla('intro');
	dialogo.showModal();

	// Cerrar la ventana antes de empezar no gasta el intento; cerrarla jugando, sí
	const control = new AbortController();
	dialogo.addEventListener('close', () => control.abort(), { once: true });

	q<HTMLButtonElement>('[data-jugar]').onclick = async () => {
		pantalla('juego');
		const area = q('[data-area]');
		area.replaceChildren();
		const resultado = await juego.jugar(area, control.signal, { ranaSrc: dialogo.dataset.ranaSrc ?? '' });

		let subida = '';
		let puntos = resultado.puntos;
		try {
			const r = await registrarPartida(id, resultado.puntos);
			puntos = r.puntos;
			if (r.subeDeRango) subida = `¡Subes a ${r.rango.nombre}!`;
		} catch {
			// 'ya-jugado' o 'sin-equipo': no suma; el tablero ya lo comprueba antes de abrir
		}
		document.dispatchEvent(new CustomEvent('liga:cambio'));

		if (!dialogo.open) return;
		q('[data-final-puntos]').textContent = String(puntos);
		q('[data-final-detalle]').textContent = resultado.detalle ?? '';
		q('[data-final-subida]').textContent = subida;
		pantalla('final');
	};
}
