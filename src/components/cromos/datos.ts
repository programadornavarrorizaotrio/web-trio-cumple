import trio from '../../data/trio.json';
import type { Album, Cromo } from './tipos';
import { demoAlbum, fotosDemo } from './demo';
import { rpcConClave, usaBD } from '../../lib/rpc';

/** URL pública de una foto del bucket `cromos` (la base de datos guarda solo la ruta). Las URL completas se dejan igual. */
export function urlFoto(ruta: string | null): string | null {
	if (!ruta) return null;
	if (/^(https?:|blob:|data:|\/)/.test(ruta)) return ruta;
	return `${import.meta.env.PUBLIC_SUPABASE_URL}/storage/v1/object/public/cromos/${encodeURIComponent(ruta)}`;
}

/** La foto del cromo lista para pintar: la subida por el invitado o, si no hay, la del trío (números 1–3) de src/assets */
export function conFoto(c: Cromo): Cromo {
	const foto = urlFoto(c.foto);
	if (foto || !c.especial) return { ...c, foto };
	return { ...c, foto: fotosDemo()[trio[c.numero - 1]?.slug] ?? null };
}

// RPC `listar_cromos(clave)`. Sin registro en la base de datos, el álbum de ejemplo.
export async function obtenerAlbum(): Promise<Album> {
	if (!usaBD()) return demoAlbum();
	const album = await rpcConClave<Album>('listar_cromos');
	return { ...album, cromos: album.cromos.map(conFoto) };
}
