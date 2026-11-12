// Cada página tiene su estética. Los colores y tipografías de cada tema están en
// src/styles/global.css (:root[data-tema='…']); aquí, qué tema va en cada ruta y sus textos.

export type Tema = 'estanco' | 'cartas' | 'riverland' | 'charca';

export const TEMAS: Record<Tema, { colorNavegador: string; pie: string }> = {
	estanco: { colorNavegador: '#742434', pie: 'Trio Feliz · 4ª edición · Hecho a mano, sin gluten y con poca vergüenza' },
	cartas: { colorNavegador: '#e3350d', pie: 'Trio Feliz · Colección 4ª edición · Un sobre por invitado · No se aceptan cambios' },
	charca: { colorNavegador: '#12402c', pie: 'Trioland · Trio Feliz 4ª edición · No se admiten ranas en la piscina' },
	riverland: { colorNavegador: '#f53fc9', pie: 'Trio Feliz Fest · 4ª edición · Pulsera obligatoria · Prohibido entrar con nevera' },
};

// Inicio: la charca (Trioland). Rutas sin tema propio (registro, juegos, fotos, guía de estilo…) se quedan con el del estanco.
// Fotos: pendiente de decidir.
const PORRUTA: Record<string, Tema> = {
	'/': 'charca',
	'/participantes': 'cartas',
	'/estanco': 'estanco',
	'/canciones': 'riverland',
};

export const temaDeRuta = (ruta: string): Tema => PORRUTA[ruta.replace(/\/$/, '') || '/'] ?? 'estanco';

// --- Imágenes oficiales de cada tema (opcionales, fuera del repo) ---
// Si existe src/assets/temas/<tema>/<nombre>.(svg|png|webp|jpg), se usa en lugar del dibujo propio.
// Huecos: <tema>/favicon (icono de pestaña), <tema>/logo (cabecera), cartas/energia-<tipo> (energías), cartas/reverso (cartas boca abajo), cartas/simbolo (cabecera de la expansión),
// riverland/cartel (fondo del cartel).
import type { ImageMetadata } from 'astro';

const imagenes = import.meta.glob<{ default: ImageMetadata }>('/src/assets/temas/*/*.{svg,png,webp,jpg,jpeg}', { eager: true });

export function imagenTema(tema: Tema, nombre: string): ImageMetadata | undefined {
	const clave = Object.keys(imagenes).find((ruta) => ruta.startsWith(`/src/assets/temas/${tema}/${nombre}.`));
	return clave ? imagenes[clave].default : undefined;
}
