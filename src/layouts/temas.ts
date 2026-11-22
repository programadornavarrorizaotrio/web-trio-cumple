// Cada página tiene su estética. Los colores y tipografías de cada tema están en
// src/styles/global.css (:root[data-tema='…']); aquí, qué tema va en cada ruta y sus textos.

export type Tema = 'estanco' | 'cartas' | 'riverland' | 'charca' | 'catan' | 'tuenti' | 'sepe';

export const TEMAS: Record<Tema, { colorNavegador: string; pie: string }> = {
	estanco: { colorNavegador: '#742434', pie: 'Trio Feliz · 4ª edición · Hecho a mano, sin gluten y con poca vergüenza' },
	cartas: { colorNavegador: '#e3350d', pie: 'Trio Feliz · Colección 4ª edición · Un sobre por invitado · No se aceptan cambios' },
	charca: { colorNavegador: '#12402c', pie: 'Trioland · Trio Feliz 4ª edición · No se admiten ranas en la piscina' },
	catan: { colorNavegador: '#6b4423', pie: 'Trio Feliz · Isla de Trioland · Se admiten trueques, no se admiten ladrones' },
	riverland: { colorNavegador: '#f53fc9', pie: 'Trio Feliz Fest · 4ª edición · Pulsera obligatoria · Prohibido entrar con nevera' },
	tuenti: { colorNavegador: '#3b6ea5', pie: 'triofeliz © 2008 · Acerca de · Privacidad · Condiciones de uso · Te has quedado sin invitaciones' },
	sepe: {
		colorNavegador: '#1d4a7a',
		pie: 'Gobierno del Trío © 2026 · Aviso legal · Accesibilidad · Mapa web · Cookies: todas de chocolate · Atención al público de 9:00 a 9:15',
	},
};

// Inicio: la charca (Trioland). Juegos: la isla de Catan. Fotos: Tuenti. Registro: la oficina del SEPE. Rutas sin tema propio (guía de estilo…) se quedan con el del estanco.
const PORRUTA: Record<string, Tema> = {
	'/': 'charca',
	'/participantes': 'cartas',
	'/estanco': 'estanco',
	'/canciones': 'riverland',
	'/juegos': 'catan',
	'/fotos': 'tuenti',
	'/registro': 'sepe',
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
