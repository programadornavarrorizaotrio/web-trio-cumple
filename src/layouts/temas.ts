// Cada página tiene su estética. Los colores y tipografías de cada tema están en
// src/styles/global.css (:root[data-tema='…']); aquí, qué tema va en cada ruta y sus textos.

export type Tema = 'estanco' | 'cartas';

export const TEMAS: Record<Tema, { colorNavegador: string; pie: string }> = {
	estanco: { colorNavegador: '#742434', pie: 'Trio Feliz · 4ª edición · Hecho a mano, sin gluten y con poca vergüenza' },
	cartas: { colorNavegador: '#e3350d', pie: 'Trio Feliz · Colección 4ª edición · Un sobre por invitado · No se aceptan cambios' },
};

// Rutas sin tema propio (inicio, registro, juegos, fotos, guía de estilo…) se quedan con el del estanco.
// Fotos: pendiente de decidir.
const PORRUTA: Record<string, Tema> = {
	'/participantes': 'cartas',
	'/estanco': 'estanco',
};

export const temaDeRuta = (ruta: string): Tema => PORRUTA[ruta.replace(/\/$/, '') || '/'] ?? 'estanco';

// --- Imágenes oficiales de cada tema (opcionales, fuera del repo) ---
// Si existe src/assets/temas/<tema>/<nombre>.(svg|png|webp|jpg), se usa en lugar del dibujo propio.
// Huecos: <tema>/favicon (icono de pestaña), <tema>/logo (cabecera), cartas/energia-<tipo> (energías), cartas/reverso (cartas boca abajo), cartas/simbolo (cabecera de la expansión).
import type { ImageMetadata } from 'astro';

const imagenes = import.meta.glob<{ default: ImageMetadata }>('/src/assets/temas/*/*.{svg,png,webp,jpg,jpeg}', { eager: true });

export function imagenTema(tema: Tema, nombre: string): ImageMetadata | undefined {
	const clave = Object.keys(imagenes).find((ruta) => ruta.startsWith(`/src/assets/temas/${tema}/${nombre}.`));
	return clave ? imagenes[clave].default : undefined;
}
