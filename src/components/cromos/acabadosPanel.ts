// Rellena "Tu carta" (Acabados.astro): la colección de acabados, el sobre de los nuevos y la palabra secreta.
import { ACABADOS, acabadosVistos, decirPalabra, misAcabados, ponerAcabado, type AcabadoId, type CasillaAcabado } from './acabados';
import { inicial } from './pintar';
import { abrirSobre } from './sobre';
import type { Cromo } from './tipos';

interface Opciones {
	/** El cromo del propio invitado */
	yo: Cromo;
	/** Enseña su carta grande con ese acabado, sin guardarlo */
	probar: (acabado: AcabadoId | null) => void;
	/** Ha elegido acabado: la carta del álbum cambia */
	puesto: (acabado: AcabadoId | null) => void;
}

/** Lo que dice la rana del acertijo. Nunca repite la misma dos veces seguidas. */
const RANA = {
	inicio: ['Está claro que aquí hay algo oculto…'],
	no: ['Sigue pensando.', 'Frío, frío.', 'Eso no es.', 'Ni de lejos.', '¿Me estás vacilando?', 'Pregúntale a otro, anda.', 'Está claro que hay algo oculto. Pero no es eso.', 'Dale otra vuelta.'],
	casi: ['Casi…', '¡Uy! Casi, casi.', 'Caliente, caliente.', 'Por un pelo de rana.'],
	si: ['¡Shhh! Ahora lo sabemos los dos.'],
	repetida: ['Eso ya me lo habías dicho.'],
	fallo: ['Se me ha ido la conexión a la charca. Prueba otra vez.'],
};

export async function montarAcabados({ yo, probar, puesto }: Opciones) {
	const raiz = document.querySelector<HTMLElement>('[data-acabados]');
	if (!raiz) return;
	const $ = <T extends HTMLElement = HTMLElement>(sel: string) => raiz.querySelector<T>(sel)!;
	const lista = $('[data-ac-lista]');
	const texto = $('[data-ac-texto]');
	const llevar = $<HTMLButtonElement>('[data-ac-llevar]');
	const aviso = $('[data-ac-aviso]');

	const formPalabra = $<HTMLFormElement>('[data-ac-palabra]');

	let casillas: CasillaAcabado[];
	let hayPalabra: boolean;
	try {
		({ casillas, hayPalabra } = await misAcabados());
	} catch {
		return; // sin conexión: el álbum funciona igual, sin este apartado
	}

	let llevado: AcabadoId | null = null;
	let elegido: AcabadoId | null = null;

	function el<K extends keyof HTMLElementTagNameMap>(tag: K, clase: string, contenido?: string) {
		const e = document.createElement(tag);
		e.className = clase;
		if (contenido !== undefined) e.textContent = contenido;
		return e;
	}

	function muestra(acabado: AcabadoId | null) {
		const carta = el('span', 'muestra cromo mini');
		if (acabado) carta.dataset.acabado = acabado;
		if (yo.foto) {
			const img = el('img', 'muestra-foto');
			img.src = yo.foto;
			img.alt = '';
			carta.append(img);
		} else carta.append(el('span', 'muestra-foto', inicial(yo.nombre)));
		return carta;
	}

	function casilla(nombre: string, carta: HTMLElement, alPulsar: () => void, conseguido: boolean, etiqueta = nombre) {
		const li = el('li', '');
		const boton = el('button', 'muestra-boton');
		boton.type = 'button';
		boton.setAttribute('aria-label', etiqueta);
		boton.setAttribute('aria-pressed', 'false');
		boton.append(carta, el('span', `muestra-nombre${conseguido ? '' : ' falta-nombre'}`, nombre));
		boton.addEventListener('click', () => {
			lista.querySelectorAll('.muestra-boton').forEach((b) => b.setAttribute('aria-pressed', String(b === boton)));
			alPulsar();
		});
		li.append(boton);
		return li;
	}

	/** Detalle de una carta que tiene: se prueba en grande y se puede llevar */
	function ver(acabado: AcabadoId | null) {
		elegido = acabado;
		probar(acabado);
		texto.textContent = acabado ? ACABADOS[acabado].logro : 'La de siempre.';
		const laLleva = acabado === llevado;
		llevar.hidden = false;
		llevar.disabled = laLleva;
		llevar.textContent = laLleva ? 'La llevas' : 'Llevar esta';
	}
	/** Detalle de una que le falta */
	function verFalta(t: string) {
		texto.textContent = t;
		llevar.hidden = true;
	}

	function pintar() {
		llevado = casillas.flatMap((c) => (!c.oculto && c.puesto ? [c.id] : []))[0] ?? null;
		const conseguidas = casillas.filter((c) => !c.oculto && c.conseguido).length;
		$('[data-ac-cuenta]').textContent = `${conseguidas} de ${casillas.length}`;
		lista.replaceChildren(
			casilla('Normal', muestra(null), () => ver(null), true),
			...casillas.map((c) => {
				if (c.oculto)
					return casilla('???', el('span', 'muestra muestra-falta', '?'), () => verFalta('Nadie sabe cómo se consigue. O eso dicen.'), false, 'Carta secreta sin descubrir');
				const { titulo } = ACABADOS[c.id];
				if (c.conseguido) return casilla(titulo, muestra(c.id), () => ver(c.id), true);
				return casilla(titulo, el('span', 'muestra muestra-falta', '🔒'), () => verFalta(`${titulo}: llega a ${c.rango} en la liga (${c.desde} LP).`), false, `${titulo}, sin conseguir`);
			}),
		);
		const indice = llevado === null ? 0 : casillas.findIndex((c) => !c.oculto && c.id === llevado) + 1;
		const llevada = lista.children[indice] as HTMLElement | undefined;
		llevada?.querySelector('.muestra-boton')?.setAttribute('aria-pressed', 'true');
		elegido = llevado;
		texto.textContent = llevado ? ACABADOS[llevado].logro : 'Toca una para verla.';
		llevar.hidden = false;
		llevar.disabled = true;
		llevar.textContent = 'La llevas';
		raiz!.hidden = false;
		// El acertijo, solo si hay palabra puesta y aún no la ha adivinado
		formPalabra.hidden = !hayPalabra || casillas.some((c) => !c.oculto && c.id === 'fantasma' && c.conseguido);
		// Que se vea en la fila la que lleva puesta
		if (llevada) lista.scrollLeft = llevada.offsetLeft - lista.offsetLeft - (lista.clientWidth - llevada.offsetWidth) / 2;
	}

	async function llevarla(acabado: AcabadoId | null) {
		await ponerAcabado(acabado);
		casillas = casillas.map((c) => (c.oculto ? c : { ...c, puesto: c.id === acabado }));
		puesto(acabado);
		pintar();
	}

	/** Si hay acabados sin estrenar, salen en un sobre. El último se lo lleva puesto si no llevaba ninguno. */
	async function estrenar() {
		const nuevos = casillas.flatMap((c) => (!c.oculto && c.nuevo ? [c.id] : []));
		if (!nuevos.length) return;
		await abrirSobre(
			nuevos.map((acabado) => ({ ...yo, acabado })),
			{
				variante: 'cartas',
				final: {
					titulo: nuevos.length === 1 ? ACABADOS[nuevos[0]].titulo : 'Versiones nuevas',
					unidad: nuevos.length === 1 ? 'versión nueva' : 'versiones nuevas',
					texto: `Ya ${nuevos.length === 1 ? 'la' : 'las'} tienes en «Tu carta». Elige con cuál quieres salir en el álbum.`,
				},
			},
		);
		await acabadosVistos().catch(() => {});
		casillas = casillas.map((c) => (c.oculto ? c : { ...c, nuevo: false }));
		if (llevado === null) await llevarla(nuevos[nuevos.length - 1]).catch(() => {});
	}

	llevar.addEventListener('click', async () => {
		llevar.disabled = true;
		aviso.textContent = '';
		try {
			await llevarla(elegido);
		} catch {
			llevar.disabled = false;
			aviso.textContent = 'No se ha podido guardar. Prueba otra vez.';
		}
	});

	// ── La rana del acertijo ──
	const rana = $('[data-ac-rana]');
	const ranaImg = $<HTMLImageElement>('[data-ac-rana-img]');
	const ranaTexto = $('[data-ac-rana-texto]');
	const poses = JSON.parse(formPalabra.dataset.poses!) as Record<string, string>;
	let ultima = '';
	function ranaDice(que: keyof typeof RANA, pose: string) {
		const opciones = RANA[que].filter((f) => f !== ultima || RANA[que].length === 1);
		ultima = opciones[Math.floor(Math.random() * opciones.length)];
		ranaTexto.textContent = ultima;
		rana.dataset.pose = pose;
		ranaImg.src = poses[pose];
		rana.classList.remove('salta');
		void rana.offsetWidth;
		rana.classList.add('salta');
	}
	ranaTexto.textContent = RANA.inicio[0];

	const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
	formPalabra.addEventListener('submit', async (ev) => {
		ev.preventDefault();
		const boton = formPalabra.querySelector('button')!;
		const campo = formPalabra.elements.namedItem('palabra') as HTMLInputElement;
		boton.disabled = true;
		try {
			const primera = await decirPalabra(campo.value);
			campo.value = '';
			if (!primera) return ranaDice('repetida', 'saluda');
			ranaDice('si', 'fiesta');
			navigator.vibrate?.([30, 40, 80]);
			await esperar(1600); // que se lea antes de que salga el sobre
			({ casillas, hayPalabra } = await misAcabados());
			pintar();
			await estrenar();
		} catch (e) {
			const codigo = e instanceof Error ? e.message : '';
			if (codigo === 'casi') ranaDice('casi', 'prisa');
			else if (codigo === 'palabra') ranaDice('no', 'triste');
			else return ranaDice('fallo', 'triste');
			campo.select();
		} finally {
			boton.disabled = false;
		}
	});

	pintar();
	await estrenar();
}
