// Lógica de "Mi ficha" del admin (el marcado está en AdminFicha.astro).
import * as admin from './datos';
import { urlFoto } from '../cromos/datos';
import { subirImagen } from '../registro/datos';
import type { FichaTrio, Persona } from '../trio/fichas';

interface Ayudas {
	/** Ejecuta algo con el botón bloqueado y avisa del resultado */
	accion: (boton: HTMLButtonElement | null, hacer: () => Promise<string | void>) => Promise<void>;
}

/** La ficha de trio.json, con la foto y el muñeco ya listos */
type Partida = Omit<FichaTrio, 'persona' | 'foto' | 'encuadre'> & { nombre: string; foto: string; encuadre: string; poster: string };
type Punto = [number, number];

const MAX_AFICIONES = 8;
const MAX_DESCRIPCION = 400;
/** Lado mayor de la foto que se sube (px) */
const MAX_LADO = 1200;
/** Encuadre de una foto recién elegida: algo por encima del centro, donde suelen estar las caras */
const ENCUADRE_NUEVA: Punto = [50, 30];

/** Reduce la foto sin recortarla (el encuadre va aparte) y la deja en WebP o, en Safari, JPEG. Nunca pasa de 1 MB. */
async function reducir(archivo: File): Promise<Blob> {
	const imagen = await createImageBitmap(archivo, { imageOrientation: 'from-image' }).catch(() => {
		throw new Error('foto-tipo');
	});
	const escala = Math.min(1, MAX_LADO / Math.max(imagen.width, imagen.height));
	const lienzo = document.createElement('canvas');
	lienzo.width = Math.round(imagen.width * escala);
	lienzo.height = Math.round(imagen.height * escala);
	lienzo.getContext('2d')!.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
	imagen.close();
	const aBlob = (tipo: string, calidad: number) => new Promise<Blob | null>((r) => lienzo.toBlob(r, tipo, calidad));
	for (const calidad of [0.82, 0.6, 0.4]) {
		let blob = await aBlob('image/webp', calidad);
		if (blob?.type !== 'image/webp') blob = await aBlob('image/jpeg', calidad);
		if (blob && blob.size <= 1024 * 1024) return blob;
	}
	throw new Error('foto-tipo');
}

/** "50% 62%" → [50, 62]; "top" → [50, 0] */
function leerEncuadre(texto: string): Punto {
	const m = texto.match(/^(\d+)% (\d+)%$/);
	return m ? [Number(m[1]), Number(m[2])] : [50, texto === 'top' ? 0 : 50];
}

export function montarFicha(raiz: HTMLElement, { accion }: Ayudas) {
	const $ = <T extends HTMLElement = HTMLElement>(sel: string) => raiz.querySelector<T>(sel)!;
	const form = $<HTMLFormElement>('[data-form-ficha]');
	const campo = (n: string) => form.elements.namedItem(n) as HTMLInputElement | HTMLTextAreaElement;
	const partidas: Record<Persona, Partida> = JSON.parse($('[data-ficha-partida]').dataset.fichaPartida!);
	const listaAficiones = $<HTMLUListElement>('[data-lista-aficiones]');
	const otra = $<HTMLButtonElement>('[data-otra-aficion]');
	const elegir = $<HTMLInputElement>('[data-elegir-foto]');
	const quitarFoto = $<HTMLButtonElement>('[data-quitar-foto-ficha]');
	const marco = $('[data-mf-foto]');
	const img = $<HTMLImageElement>('[data-mf-img]');

	let partida: Partida;
	/** Lo que hay en la base de datos, o null si aún no la ha cambiado */
	let guardada: FichaTrio | null = null;
	/** Foto elegida y aún sin subir */
	let nueva: Blob | null = null;
	/** Se vuelve a la foto de la web al guardar */
	let quitar = false;
	let encuadre: Punto = [50, 50];
	/** Si se ha elegido un encuadre; si no, sigue el de la web */
	let encuadrePropio = false;

	const aficiones = () => [...listaAficiones.querySelectorAll('input')].map((i) => i.value.trim()).filter(Boolean);

	// ── Vista previa ──
	function refrescar() {
		$('[data-mf-nombre]').textContent = partida.nombre;
		$('[data-mf-edad]').textContent = `${campo('edad').value || '—'} años`;
		$('[data-mf-lema]').textContent = campo('lema').value;
		$('[data-mf-descripcion]').textContent = campo('descripcion').value;
		$('[data-mf-advertencia]').textContent = campo('advertencia').value || '…';
		$('[data-mf-quedan]').textContent = `${campo('descripcion').value.length}/${MAX_DESCRIPCION}`;
		$('[data-mf-aficiones]').replaceChildren(
			...aficiones().map((a) => {
				const li = document.createElement('li');
				li.textContent = a;
				return li;
			}),
		);
		const filas = listaAficiones.children.length;
		otra.hidden = filas >= MAX_AFICIONES;
		listaAficiones.querySelectorAll('button').forEach((b) => (b.disabled = filas === 1));
	}
	form.addEventListener('input', refrescar);

	// ── Aficiones: una fila por cada una ──
	function filaAficion(texto = '') {
		const li = document.createElement('li');
		li.className = 'flex gap-2';
		const input = document.createElement('input');
		input.className = 'block w-full min-w-0 rounded border-2 border-granate/25 bg-white px-3 py-2.5 text-tinta placeholder:text-tinta-suave/50 focus:border-granate focus:outline-none';
		input.maxLength = 30;
		input.value = texto;
		input.placeholder = '🎮 Gaming';
		input.autocomplete = 'off';
		input.setAttribute('aria-label', 'Afición');
		const borrar = document.createElement('button');
		borrar.type = 'button';
		borrar.className = 'w-11 shrink-0 rounded border-2 border-granate/20 text-xl leading-none text-granate active:bg-amarillo-claro disabled:opacity-30';
		borrar.textContent = '×';
		borrar.setAttribute('aria-label', 'Quitar esta afición');
		borrar.addEventListener('click', () => {
			li.remove();
			refrescar();
		});
		li.append(input, borrar);
		listaAficiones.append(li);
		return input;
	}
	otra.addEventListener('click', () => {
		const input = filaAficion();
		refrescar();
		input.focus();
	});

	// ── Foto y encuadre ──
	let url: string | null = null;
	function pintarFoto() {
		if (url) URL.revokeObjectURL(url);
		url = nueva ? URL.createObjectURL(nueva) : null;
		const propia = quitar ? null : urlFoto(guardada?.foto ?? null);
		img.src = url ?? propia ?? partida.foto;
		quitarFoto.hidden = !nueva && !propia;
		pintarEncuadre();
	}
	function pintarEncuadre() {
		img.style.objectPosition = `${encuadre[0]}% ${encuadre[1]}%`;
	}
	/** Arrastra la foto lo que se mueva el dedo, solo hacia donde no cabe entera */
	function mover(dx: number, dy: number) {
		const escala = Math.max(marco.clientWidth / img.naturalWidth, marco.clientHeight / img.naturalHeight);
		const sobra: Punto = [img.naturalWidth * escala - marco.clientWidth, img.naturalHeight * escala - marco.clientHeight];
		const eje = (valor: number, d: number, s: number) => (s > 1 ? Math.min(100, Math.max(0, valor - (d / s) * 100)) : valor);
		encuadre = [eje(encuadre[0], dx, sobra[0]), eje(encuadre[1], dy, sobra[1])];
		encuadrePropio = true;
		pintarEncuadre();
	}
	let dedo: Punto | null = null;
	marco.addEventListener('pointerdown', (ev) => {
		dedo = [ev.clientX, ev.clientY];
		marco.setPointerCapture(ev.pointerId);
	});
	marco.addEventListener('pointermove', (ev) => {
		if (!dedo) return;
		mover(ev.clientX - dedo[0], ev.clientY - dedo[1]);
		dedo = [ev.clientX, ev.clientY];
	});
	marco.addEventListener('pointerup', () => (dedo = null));
	marco.addEventListener('pointercancel', () => (dedo = null));
	marco.addEventListener('keydown', (ev) => {
		const pasos: Record<string, Punto> = { ArrowLeft: [8, 0], ArrowRight: [-8, 0], ArrowUp: [0, 8], ArrowDown: [0, -8] };
		const paso = pasos[ev.key];
		if (!paso) return;
		ev.preventDefault();
		mover(...paso);
	});

	elegir.addEventListener('change', () => {
		const archivo = elegir.files?.[0];
		elegir.value = '';
		if (!archivo) return;
		void accion(null, async () => {
			nueva = await reducir(archivo);
			encuadre = ENCUADRE_NUEVA;
			encuadrePropio = true;
			pintarFoto();
		});
	});
	// Una recién elegida se descarta; una ya guardada se quita y vuelve la de la web
	quitarFoto.addEventListener('click', () => {
		if (nueva) nueva = null;
		else quitar = true;
		ponerEncuadre(quitar ? null : guardada);
		pintarFoto();
	});
	function ponerEncuadre(ficha: FichaTrio | null) {
		encuadre = leerEncuadre(ficha?.encuadre ?? partida.encuadre);
		encuadrePropio = !!ficha?.encuadre;
	}

	// ── Cargar y guardar ──
	function poner(ficha: FichaTrio | null) {
		guardada = ficha;
		nueva = null;
		quitar = false;
		const f = ficha ?? partida;
		campo('edad').value = String(f.edad);
		campo('lema').value = f.lema;
		campo('descripcion').value = f.descripcion;
		campo('advertencia').value = f.advertencia;
		listaAficiones.replaceChildren();
		f.aficiones.forEach((a) => filaAficion(a));
		$<HTMLImageElement>('[data-mf-poster]').src = partida.poster;
		ponerEncuadre(ficha);
		pintarFoto();
		refrescar();
	}

	form.addEventListener('submit', (ev) => {
		ev.preventDefault();
		void accion((ev as SubmitEvent).submitter as HTMLButtonElement, async () => {
			const ficha = await admin.guardarFicha({
				edad: Number(campo('edad').value),
				lema: campo('lema').value,
				descripcion: campo('descripcion').value,
				aficiones: aficiones(),
				advertencia: campo('advertencia').value,
				encuadre: encuadrePropio ? encuadre.map((n) => `${Math.round(n)}%`).join(' ') : null,
				fotoRuta: nueva ? await subirImagen(nueva) : null,
				quitarFoto: quitar,
			});
			poner(ficha);
			return 'Ficha guardada: ya se ve en la portada';
		});
	});

	/** Error 'sin-ficha' si el admin no es uno de los tres */
	async function pintar() {
		const { persona, ficha } = await admin.miFicha();
		partida = partidas[persona];
		poner(ficha);
	}

	return { pintar };
}
