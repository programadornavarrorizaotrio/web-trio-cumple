import type { Cromo } from './tipos';
import { pintarCromo } from './pintar';

interface Opciones {
	/** Id del invitado que abre el sobre: su cromo sale casi al final */
	propio?: string;
	/** Cuál de los dos sobres: la oferta de empleo del registro o el de cartas coleccionables */
	variante?: Variante;
	titulo?: string;
	/** Nombre que sale en la ventanilla de la oferta de empleo */
	destinatario?: string;
	/** Lo que pone al terminar (por defecto, lo del álbum) */
	final?: { titulo: string; unidad: string; texto: string };
}

type Variante = 'empleo' | 'cartas';

const FINAL_ALBUM = { titulo: 'Plantilla completa', unidad: 'cromos', texto: 'Incorporados a su álbum: todos sus compañeros de fiesta.' };

/** Textos de cada sobre */
const TEXTOS: Record<Variante, { antetitulo: string; titulo: string; pieza: string; piezas: [string, string]; cab: string; fin: string }> = {
	empleo: { antetitulo: 'SEPE del Trío', titulo: 'Tiene una oferta de empleo', pieza: 'Documento', piezas: ['cromo', 'cromos'], cab: 'Resolución', fin: 'Ver el álbum' },
	cartas: { antetitulo: 'Trio Feliz · Cartas', titulo: '¡Te ha tocado un sobre!', pieza: 'Carta', piezas: ['carta', 'cartas'], cab: '¡Nueva!', fin: 'Ver mi carta' },
};

/** Orden de salida: primero el resto, luego el del propio invitado y, al final, el trío (los especiales) */
function ordenar(cromos: Cromo[], propio?: string) {
	const peso = (c: Cromo) => (c.especial ? 2 : c.id === propio ? 1 : 0);
	return [...cromos].sort((a, b) => peso(a) - peso(b) || a.numero - b.numero);
}

/**
 * Abre el sobre con las cartas dadas (hay que tener <Sobre /> en la página).
 * Se resuelve cuando el invitado cierra el diálogo, termine o no de pasar las cartas.
 */
export function abrirSobre(cromos: Cromo[], { propio, variante = 'empleo', titulo, destinatario = 'Invitado/a', final = FINAL_ALBUM }: Opciones = {}): Promise<void> {
	const dialogo = document.querySelector<HTMLDialogElement>('[data-sobre-dialogo]')!;
	const $ = <T extends HTMLElement = HTMLElement>(sel: string) => dialogo.querySelector<T>(sel)!;
	const plantilla = $<HTMLTemplateElement>('[data-plantilla-carta]').content.firstElementChild!;
	const cartas = ordenar(cromos, propio);

	const pasoSobre = $('[data-paso-sobre]');
	const pasoCartas = $('[data-paso-cartas]');
	const pasoFinal = $('[data-paso-final]');
	const paquete = $(`[data-paquete="${variante}"]`);
	const textos = TEXTOS[variante];
	const escenario = $('[data-escenario]');
	const botonSiguiente = $('[data-siguiente]');
	const botonSaltar = $('[data-saltar]');

	// Estado inicial (el diálogo se reutiliza entre aperturas)
	let indice = 0;
	let ocupado = false;
	dialogo.dataset.variante = variante;
	dialogo.querySelectorAll<HTMLElement>('[data-paquete]').forEach((p) => {
		p.hidden = p !== paquete;
		p.classList.remove('abierto');
	});
	pasoSobre.hidden = false;
	pasoCartas.hidden = true;
	pasoFinal.hidden = true;
	escenario.replaceChildren();
	$('[data-antetitulo]').textContent = textos.antetitulo;
	$('[data-titulo-sobre]').textContent = titulo ?? textos.titulo;
	$('[data-pieza]').textContent = textos.pieza;
	$('[data-final-cab]').textContent = textos.cab;
	$('[data-fin]').textContent = textos.fin;
	$('[data-destinatario]').textContent = destinatario;
	$(`[data-paquete="${variante}"] [data-n-cartas]`).textContent = `Contiene ${cartas.length} ${textos.piezas[cartas.length === 1 ? 0 : 1]}`;
	$('[data-total]').textContent = String(cartas.length);
	$('[data-final-n]').textContent = String(cartas.length);
	$('[data-final-titulo]').textContent = final.titulo;
	$('[data-final-unidad]').textContent = final.unidad;
	$('[data-final-texto]').textContent = final.texto;

	function mostrarCarta() {
		const c = cartas[indice];
		const carta = plantilla.cloneNode(true) as HTMLElement;
		pintarCromo(carta.querySelector<HTMLElement>('[data-cromo]')!, c);
		carta.classList.add('entra');
		escenario.replaceChildren(carta);
		$('[data-actual]').textContent = String(indice + 1);
		$('[data-anuncio]').textContent = `${textos.pieza} ${indice + 1} de ${cartas.length}: ${c.apodo} (${c.nombre})`;
		botonSiguiente.textContent = indice === cartas.length - 1 ? 'Terminar' : 'Siguiente →';
	}

	function terminar() {
		pasoCartas.hidden = true;
		pasoFinal.hidden = false;
		$('[data-fin]').focus();
	}

	function siguiente() {
		if (ocupado) return;
		if (indice >= cartas.length - 1) return terminar();
		ocupado = true;
		escenario.firstElementChild?.classList.replace('entra', 'sale');
		setTimeout(() => {
			indice++;
			mostrarCarta();
			ocupado = false;
		}, 300);
	}

	function rasgar() {
		if (paquete.classList.contains('abierto')) return;
		paquete.classList.add('abierto');
		if (navigator.vibrate) navigator.vibrate([30, 40, 60]);
		setTimeout(() => {
			pasoSobre.hidden = true;
			if (!cartas.length) return terminar();
			pasoCartas.hidden = false;
			mostrarCarta();
			botonSiguiente.focus();
		}, 1100);
	}

	return new Promise((resolver) => {
		const ac = new AbortController();
		const { signal } = ac;
		const cerrar = () => dialogo.open && dialogo.close();

		paquete.addEventListener('click', rasgar, { signal });
		$('[data-mazo]').addEventListener('click', siguiente, { signal });
		botonSiguiente.addEventListener('click', siguiente, { signal });
		botonSaltar.addEventListener('click', terminar, { signal });
		$('[data-cerrar]').addEventListener('click', cerrar, { signal });
		$('[data-fin]').addEventListener('click', cerrar, { signal });
		dialogo.addEventListener(
			'close',
			() => {
				ac.abort();
				resolver();
			},
			{ once: true },
		);

		dialogo.showModal();
		paquete.focus();
	});
}
