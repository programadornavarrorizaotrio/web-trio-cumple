import type { Cromo } from './tipos';
import { pintarCromo } from './pintar';

interface Opciones {
	/** Id del invitado que abre el sobre: su cromo sale casi al final */
	propio?: string;
	titulo?: string;
}

/** Orden de salida: primero el resto, luego el del propio invitado y, al final, el trío (los especiales) */
function ordenar(cromos: Cromo[], propio?: string) {
	const peso = (c: Cromo) => (c.especial ? 2 : c.id === propio ? 1 : 0);
	return [...cromos].sort((a, b) => peso(a) - peso(b) || a.numero - b.numero);
}

/**
 * Abre el sobre con las cartas dadas (hay que tener <Sobre /> en la página).
 * Se resuelve cuando el invitado cierra el diálogo, termine o no de pasar las cartas.
 */
export function abrirSobre(cromos: Cromo[], { propio, titulo = 'Tu sobre' }: Opciones = {}): Promise<void> {
	const dialogo = document.querySelector<HTMLDialogElement>('[data-sobre-dialogo]')!;
	const $ = <T extends HTMLElement = HTMLElement>(sel: string) => dialogo.querySelector<T>(sel)!;
	const plantilla = $<HTMLTemplateElement>('[data-plantilla-carta]').content.firstElementChild!;
	const cartas = ordenar(cromos, propio);

	const pasoSobre = $('[data-paso-sobre]');
	const pasoCartas = $('[data-paso-cartas]');
	const pasoFinal = $('[data-paso-final]');
	const paquete = $('[data-paquete]');
	const escenario = $('[data-escenario]');
	const botonSiguiente = $('[data-siguiente]');
	const botonSaltar = $('[data-saltar]');

	// Estado inicial (el diálogo se reutiliza entre aperturas)
	let indice = 0;
	let ocupado = false;
	paquete.classList.remove('abierto');
	pasoSobre.hidden = false;
	pasoCartas.hidden = true;
	pasoFinal.hidden = true;
	escenario.replaceChildren();
	$('[data-titulo-sobre]').textContent = titulo;
	$('[data-n-cartas]').textContent = `${cartas.length} cromo${cartas.length === 1 ? '' : 's'}`;
	$('[data-total]').textContent = String(cartas.length);
	$('[data-final-n]').textContent = String(cartas.length);

	function mostrarCarta() {
		const c = cartas[indice];
		const carta = plantilla.cloneNode(true) as HTMLElement;
		pintarCromo(carta.querySelector<HTMLElement>('[data-cromo]')!, c);
		carta.classList.add('entra');
		escenario.replaceChildren(carta);
		$('[data-actual]').textContent = String(indice + 1);
		$('[data-anuncio]').textContent = `Cromo ${indice + 1} de ${cartas.length}: ${c.apodo} (${c.nombre})`;
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
