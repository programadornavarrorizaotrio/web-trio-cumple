import type { Cromo } from './tipos';

export const numeroCromo = (n: number) => `Nº ${String(n).padStart(2, '0')}`;
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

/** Rellena un <Cromo /> con los datos y relanza su animación de entrada */
export function pintarCromo(raiz: HTMLElement, c: Cromo) {
	const img = campo<HTMLImageElement>(raiz, 'foto');
	pintarFoto(img, campo(raiz, 'inicial'), c);
	img.alt = `Cromo de ${c.nombre}`;
	campo(raiz, 'numero').textContent = numeroCromo(c.numero);
	campo(raiz, 'nombre').textContent = c.nombre;
	campo(raiz, 'apodo').textContent = c.apodo;
	campo(raiz, 'frase').textContent = c.frase ? `«${c.frase}»` : '';
	campo(raiz, 'especial').hidden = !c.especial;
	raiz.classList.toggle('es-especial', !!c.especial);

	raiz.classList.remove('entra');
	void raiz.offsetWidth;
	raiz.classList.add('entra');
}
