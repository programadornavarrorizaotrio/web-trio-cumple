import trio from '../../data/trio.json';
import type { Album } from './tipos';
import { demoAlbum, fotosDemo } from './demo';
import { rpcConClave, usaBD } from '../../lib/rpc';

// RPC `listar_cromos(clave)`. Sin registro en la base de datos, el álbum de ejemplo.
export async function obtenerAlbum(): Promise<Album> {
	if (!usaBD()) return demoAlbum();
	const album = await rpcConClave<Album>('listar_cromos');
	// Mientras no se suban fotos a Supabase (`foto_path`), los del trío (números 1–3) llevan la suya de src/assets
	const fotos = fotosDemo();
	return {
		...album,
		cromos: album.cromos.map((c) => ({
			...c,
			foto: c.foto ?? (c.especial ? (fotos[trio[c.numero - 1]?.slug] ?? null) : null),
		})),
	};
}
