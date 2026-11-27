// Fichas del trío: cada cumpleañero edita la suya en /admin (RPC `admin_guardar_ficha`). Las que no se han
// cambiado no están en la base de datos: de esas vale la de src/data/trio.json, que es la que pinta Trio.astro.
import { rpcConClave, usaBD } from '../../lib/rpc';

export type Persona = 'pencho' | 'fran' | 'juan';

export interface FichaTrio {
	persona: Persona;
	edad: number;
	lema: string;
	descripcion: string;
	aficiones: string[];
	/** Lo que sale en el bocadillo al tocar su muñeco */
	advertencia: string;
	/** Ruta de su foto en el bucket `cromos` (ver `urlFoto`), o null si vale la de la web */
	foto: string | null;
	/** `object-position` de la foto ("50% 30%"), o null si vale el de siempre */
	encuadre: string | null;
}

/** RPC `fichas_trio(clave)`: las que se han cambiado. Sin base de datos, ninguna. */
export async function obtenerFichas(): Promise<FichaTrio[]> {
	if (!usaBD()) return [];
	return (await rpcConClave<FichaTrio[]>('fichas_trio')) ?? [];
}
