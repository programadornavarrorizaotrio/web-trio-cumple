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

const ESPERA_CARTEL = 'Un momento…';

export async function montarAcabados({ yo, probar, puesto }: Opciones) {
	const raiz = document.querySelector<HTMLElement>('[data-acabados]');
	if (!raiz) return;
	const $ = <T extends HTMLElement = HTMLElement>(sel: string) => raiz.querySelector<T>(sel)!;
	const lista = $('[data-ac-lista]');
	const texto = $('[data-ac-texto]');
	const llevar = $<HTMLButtonElement>('[data-ac-llevar]');
	const aviso = $('[data-ac-aviso]');

	let casillas: CasillaAcabado[];
	try {
		casillas = await misAcabados();
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
				titulo: nuevos.length === 1 ? 'Su carta ha cambiado' : 'Sus cartas han cambiado',
				destinatario: yo.nombre,
				final: {
					titulo: nuevos.length === 1 ? ACABADOS[nuevos[0]].titulo : 'Versiones nuevas',
					unidad: nuevos.length === 1 ? 'versión nueva' : 'versiones nuevas',
					texto: `Ya ${nuevos.length === 1 ? 'la' : 'las'} tiene en «Tu carta». Elija con cuál quiere salir en el álbum.`,
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

	$<HTMLFormElement>('[data-ac-palabra]').addEventListener('submit', async (ev) => {
		ev.preventDefault();
		const form = ev.currentTarget as HTMLFormElement;
		const boton = form.querySelector('button')!;
		const palabra = String(new FormData(form).get('palabra') ?? '');
		boton.disabled = true;
		aviso.textContent = ESPERA_CARTEL;
		try {
			const primera = await decirPalabra(palabra);
			form.reset();
			aviso.textContent = primera ? '' : 'Eso ya lo habías dicho.';
			if (primera) {
				casillas = await misAcabados();
				pintar();
				await estrenar();
			}
		} catch (e) {
			aviso.textContent = e instanceof Error && e.message === 'palabra' ? 'No te entiendo.' : 'No se ha podido enviar. Comprueba la conexión.';
		} finally {
			boton.disabled = false;
		}
	});

	pintar();
	await estrenar();
}
