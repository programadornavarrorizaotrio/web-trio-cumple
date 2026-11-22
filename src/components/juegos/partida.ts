// Lanzador común de minijuegos: pantalla de instrucciones → partida → resultado.
// Cada minijuego es un módulo que exporta `instrucciones` y `jugar`; aquí solo se registra cuál es cuál.
import { registrarPartida, modoPrueba, type MinijuegoId, type Rango, MINIJUEGOS } from './liga';

export interface Resultado {
	/** Puntos de la partida (la liga los acota al máximo del minijuego) */
	puntos: number;
	/** Línea de resumen para la pantalla final, p. ej. "23 ranas" */
	detalle?: string;
	/** El servidor ya ha apuntado la partida (juegos que corrige el servidor, como el Wordle): no se llama a registrarPartida */
	registrada?: { puntos: number; rango: Rango; subeDeRango: boolean };
	/** Si es victoria o derrota (pantalla del LoL). Si el juego no lo dice, lo decide `desenlace`. */
	victoria?: boolean;
	/** No hay nada que apuntar: la partida queda guardada a medias en el servidor o no se ha podido jugar */
	aMedias?: boolean;
}

export interface Contexto {
	/** Imagen optimizada de la rana mascota */
	ranaSrc: string;
	/** Imagen optimizada del diablillo (el ladrón) */
	ladronSrc: string;
	/** Imagen del crupier (ruleta y blackjack) */
	crupierSrc: string;
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
	'ruleta-casino': () => import('./ruleta-casino'),
	blackjack: () => import('./blackjack'),
	'adivina-cromo': () => import('./adivina-cromo'),
	'conga-catan': () => import('./conga-catan'),
	'wordle-trio': () => import('./wordle-trio'),
};

/**
 * Victoria o derrota al estilo del LoL en la pantalla final. En los de habilidad, victoria con la mitad del
 * máximo o más (salvo que el juego lo diga, como el Wordle: acertar es ganar). En el casino, según si la
 * sesión deja puntos o los quita; si queda igual, no sale nada. Tampoco si la partida no se pudo guardar.
 */
function desenlace(info: (typeof MINIJUEGOS)[number], resultado: Resultado, puntos: number, aviso: string): 'victoria' | 'derrota' | null {
	if (aviso) return null;
	if (resultado.victoria !== undefined) return resultado.victoria ? 'victoria' : 'derrota';
	if (info.libre) return puntos > 0 ? 'victoria' : puntos < 0 ? 'derrota' : null;
	return puntos >= info.maxPuntos / 2 ? 'victoria' : 'derrota';
}

export const hayJuego =(id: string): id is MinijuegoId => id in modulos;

export async function lanzar(id: MinijuegoId) {
	const dialogo = document.querySelector<HTMLDialogElement>('[data-partida]')!;
	const q = <T extends HTMLElement>(sel: string) => dialogo.querySelector<T>(sel)!;
	const pantalla = (nombre: 'intro' | 'juego' | 'final') =>
		dialogo.querySelectorAll<HTMLElement>('[data-pantalla]').forEach((p) => (p.hidden = p.dataset.pantalla !== nombre));

	const juego = await modulos[id]!();
	const info = MINIJUEGOS.find((m) => m.id === id)!;

	q('[data-titulo]').textContent = info.titulo;
	q('[data-instrucciones]').textContent = juego.instrucciones;
	q('[data-limite]').textContent = info.libre ? 'Apuestas tus puntos · juega cuando quieras' : `Hasta ${info.maxPuntos} puntos · un intento al día`;
	pantalla('intro');
	dialogo.classList.remove('fin-victoria', 'fin-derrota');
	dialogo.showModal();

	// Cerrar la ventana antes de empezar no gasta el intento; cerrarla jugando, sí
	const control = new AbortController();
	dialogo.addEventListener('close', () => control.abort(), { once: true });

	q<HTMLButtonElement>('[data-jugar]').onclick = async () => {
		pantalla('juego');
		const area = q('[data-area]');
		area.replaceChildren();
		const resultado = await juego.jugar(area, control.signal, { ranaSrc: dialogo.dataset.ranaSrc ?? '', ladronSrc: dialogo.dataset.ladronSrc ?? '', crupierSrc: dialogo.dataset.crupierSrc ?? '' });

		let subida = '';
		let aviso = '';
		let puntos = resultado.puntos;
		// Cerrado a medias sin nada que apuntar (el Wordle se retoma al volver)
		if (resultado.aMedias) return;
		// Los de casino ya han ido apuntando cada apuesta en la liga: aquí solo se resume la sesión
		if (resultado.registrada) {
			puntos = resultado.registrada.puntos;
			if (resultado.registrada.subeDeRango) subida = `¡Subes a ${resultado.registrada.rango.nombre}!`;
		} else if (!info.libre) {
			try {
				const r = await registrarPartida(id, resultado.puntos);
				puntos = r.puntos;
				if (r.subeDeRango) subida = `¡Subes a ${r.rango.nombre}!`;
			} catch (e) {
				// El tablero ya comprueba antes de abrir si toca; si aun así falla, no suma y se avisa
				const codigo = e instanceof Error ? e.message : '';
				puntos = 0;
				aviso =
					codigo === 'ya-jugado'
						? 'Ya habías jugado hoy a este juego: esta partida no suma.'
						: codigo === 'liga-cerrada'
							? 'La liga ya ha terminado: esta partida no suma.'
							: 'No se ha podido guardar la partida. Comprueba la conexión.';
			}
		}
		document.dispatchEvent(new CustomEvent('liga:cambio'));

		if (!dialogo.open) return;
		q('[data-final-puntos]').textContent = info.libre && puntos > 0 ? `+${puntos}` : String(puntos);
		q('[data-final-etiqueta]').textContent = info.libre
			? modoPrueba()
				? 'puntos en esta sesión (modo prueba: no cuentan)'
				: 'puntos en esta sesión'
			: modoPrueba()
				? 'puntos (modo prueba: no suman)'
				: puntos < 0
					? 'puntos que te quita el diablillo'
					: 'puntos para tu equipo';
		q('[data-final-detalle]').textContent = aviso || (resultado.detalle ?? '');
		q('[data-final-subida]').textContent = subida;

		const fin = desenlace(info, resultado, puntos, aviso);
		const banner = q('[data-fin-lol]');
		banner.hidden = !fin;
		banner.classList.remove('anima');
		q('[data-pantalla="final"]').classList.toggle('con-lol', Boolean(fin));
		dialogo.classList.toggle('fin-victoria', fin === 'victoria');
		dialogo.classList.toggle('fin-derrota', fin === 'derrota');
		pantalla('final');
		if (fin) {
			q('[data-fin-texto]').textContent = fin === 'victoria' ? 'Victoria' : 'Derrota';
			void banner.offsetWidth; // para que la animación arranque de nuevo en cada partida
			banner.classList.add('anima');
			navigator.vibrate?.(fin === 'victoria' ? [40, 60, 40, 60, 120] : [200, 80, 200]);
		}
	};
}
