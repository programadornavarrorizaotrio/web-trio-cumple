import type { Album } from './tipos';
import { demoAlbum } from './demo';

// TODO(B6): sustituir por la RPC `listar_cromos(sesion.clave)` de src/lib/supabase.ts.
export async function obtenerAlbum(): Promise<Album> {
	return demoAlbum();
}
