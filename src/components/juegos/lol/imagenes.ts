// Imágenes del LoL para la liga, ya optimizadas. Solo para el frontmatter de los .astro (usa getImage).
//
// Origen: splash e icono de cada campeón de Data Dragon (CDN público de Riot, parche 16.23.1) y emblemas
// de rango de CommunityDragon, recortados a su contenido. Se usan bajo la política de contenido de fans
// de Riot (sin ánimo de lucro). Se guardan aquí en vez de enlazarlas para no depender de su CDN en la fiesta.
import { getImage } from 'astro:assets';
import type { ImageMetadata } from 'astro';
import type { Emblema } from '../liga';

const archivos = import.meta.glob<{ default: ImageMetadata }>('./*.{jpg,png}', { eager: true });
const archivo = (nombre: string) => {
	const img = archivos[`./${nombre}`];
	if (!img) throw new Error(`Falta la imagen lol/${nombre}`);
	return img.default;
};

/** Splash del campeón; por defecto a lo ancho de un móvil a pantalla completa */
export async function splash(clave: string, ancho = 900) {
	return (await getImage({ src: archivo(`${clave}-splash.jpg`), width: ancho, format: 'webp', quality: 75 })).src;
}

export async function icono(clave: string) {
	return (await getImage({ src: archivo(`${clave}-icono.png`), width: 128, format: 'webp' })).src;
}

export async function emblema(e: Emblema, ancho = 160) {
	return (await getImage({ src: archivo(`emblema-${e}.png`), width: ancho, format: 'webp' })).src;
}
