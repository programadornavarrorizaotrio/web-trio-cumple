import trio from '../../data/trio.json';
import type { Album, Cromo } from './tipos';
import { demoAlbum, fotosDemo } from './demo';
import { rpcConClave, usaBD } from '../../lib/rpc';

/** Mientras no se suban fotos a Supabase (`foto_path`), los del trío (números 1–3) llevan la suya de src/assets */
export function conFoto(c: Cromo): Cromo {
	if (c.foto || !c.especial) return c;
	return { ...c, foto: fotosDemo()[trio[c.numero - 1]?.slug] ?? null };
}

// RPC `listar_cromos(clave)`. Sin registro en la base de datos, el álbum de ejemplo.
export async function obtenerAlbum(): Promise<Album> {
	if (!usaBD()) return demoAlbum();
	const album = await rpcConClave<Album>('listar_cromos');
	return { ...album, cromos: album.cromos.map(conFoto) };
}
