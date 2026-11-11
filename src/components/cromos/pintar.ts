import type { Cromo } from './tipos';
import { TIPOS, datosCarta, type TipoCarta } from './tiposCarta';

export const numeroCromo = (n: number) => `Nº ${String(n).padStart(2, '0')}`;
/** "Puntos de salud" de adorno: fijos por número, y los del trío siempre arriba */
export const puntosSalud = (c: Pick<Cromo, 'numero' | 'especial'>) => (c.especial ? 150 : 30 + ((c.numero * 37) % 9) * 10);
export const inicial = (texto: string) => texto.trim().charAt(0).toUpperCase();

const campo = <T extends HTMLElement = HTMLElement>(raiz: ParentNode, nombre: string) =>
	raiz.querySelector<T>(`[data-c-${nombre}]`)!;

/** Foto si la hay; si no, monograma con la inicial del nombre */
export function pintarFoto(img: HTMLImageElement, letra: HTMLElement, c: Pick<Cromo, 'foto' | 'nombre'>) {
	img.hidden = !c.foto;
	if (c.foto) img.src = c.foto;
	letra.hidden = !!c.foto;
	letra.textContent = inicial(c.nombre);
}

/** Reduce la letra de `el` hasta que su texto quepa entero en una línea.
 *  `base` es el tamaño normal en cqw (proporcional a la carta) y `minimo` el más pequeño permitido.
 *  Solo mide si el elemento está en pantalla; si no, lo deja en su tamaño normal. */
export function ajustarTexto(el: HTMLElement, base: number, minimo = base * 0.5) {
	el.style.fontSize = '';
	if (!el.clientWidth) return;
	for (let tam = base; el.scrollWidth > el.clientWidth + 1 && tam > minimo; ) {
		tam = Math.max(minimo, tam * 0.94);
		el.style.fontSize = `${tam.toFixed(2)}cqw`;
	}
}

/** Símbolo de energía de un tipo (los estilos están en energias.css) */
export function energia(tipo: TipoCarta) {
	const el = document.createElement('span');
	el.className = 'energia';
	el.dataset.tipo = tipo;
	el.title = TIPOS[tipo].nombre;
	return el;
}

/** Rellena un <Cromo /> con los datos y relanza su animación de entrada.
 *  `total`: invitados del álbum, para el número de la carta ("007/020"). */
export function pintarCromo(raiz: HTMLElement, c: Cromo, total?: number) {
	const img = campo<HTMLImageElement>(raiz, 'foto');
	pintarFoto(img, campo(raiz, 'inicial'), c);
	img.alt = `Cromo de ${c.nombre}`;
	const tres = (n: number) => String(n).padStart(3, '0');
	campo(raiz, 'numero').textContent = total ? `${tres(c.numero)}/${tres(total)}` : tres(c.numero);
	campo(raiz, 'dex').textContent = String(c.numero).padStart(4, '0');
	campo(raiz, 'nombre').textContent = c.nombre;
	campo(raiz, 'apodo').textContent = c.apodo;
	campo(raiz, 'frase').textContent = c.frase ? `«${c.frase}»` : '';
	campo(raiz, 'ps').textContent = String(puntosSalud(c));
	campo(raiz, 'especial-texto').textContent = c.especial ? 'Cumpleañero' : 'Invitado';
	campo(raiz, 'especial').hidden = !c.especial;

	// Tipo y estadísticas de la carta (siempre las mismas para cada invitado)
	const carta = datosCarta(c);
	const tipo = TIPOS[carta.tipo];
	raiz.dataset.tipo = carta.tipo;
	campo(raiz, 'ps').textContent = String(carta.ps);
	campo(raiz, 'tipo-icono').replaceChildren(energia(carta.tipo));
	campo(raiz, 'altura').textContent = carta.altura;
	campo(raiz, 'peso').textContent = carta.peso;
	campo(raiz, 'habilidad').textContent = tipo.habilidad;
	campo(raiz, 'habilidad-texto').textContent = tipo.texto;
	campo(raiz, 'coste').replaceChildren(...carta.coste.map(energia));
	campo(raiz, 'ataque').textContent = tipo.ataque;
	campo(raiz, 'dano').textContent = String(carta.dano);
	campo(raiz, 'debilidad').replaceChildren(...(tipo.debil ? [energia(tipo.debil), '×2'] : []));
	campo(raiz, 'resistencia').replaceChildren(...(tipo.resiste ? [energia(tipo.resiste), '−30'] : []));
	campo(raiz, 'retirada').replaceChildren(...Array.from({ length: carta.retirada }, () => energia('incoloro')));
	raiz.classList.toggle('es-especial', !!c.especial);

	// El nombre baja de tamaño si no cabe (después de pintar el "ex" y los PS)
	ajustarTexto(campo(raiz, 'apodo'), 6.2, 3);

	raiz.classList.remove('entra');
	void raiz.offsetWidth;
	raiz.classList.add('entra');
}
