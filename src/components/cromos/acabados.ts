// Acabados del cromo: versiones especiales que se consiguen por rango de la liga o por easter egg, y entre las que
// cada invitado elige la que luce en el álbum. Los estilos, en acabados.css; la base, en …_acabados.sql.
import { rpcConClave, usaBD } from '../../lib/rpc';

export type AcabadoId = 'holo' | 'arcoiris' | 'dorado' | 'empapado' | 'n67' | 'fantasma';

export const ACABADOS: Record<AcabadoId, { titulo: string; logro: string }> = {
	holo: { titulo: 'Holográfico', logro: 'Por llegar a Oro en la liga.' },
	arcoiris: { titulo: 'Arcoíris', logro: 'Por llegar a Diamante en la liga.' },
	dorado: { titulo: 'Dorado', logro: 'Por llegar a Challenger. Casi nada.' },
	empapado: { titulo: 'Empapado', logro: 'Por tirar a la rana al agua tres veces. No se te puede decir nada.' },
	n67: { titulo: 'Six Seven', logro: 'Por apostar al 67 en la ruleta y que saliera.' },
	fantasma: { titulo: 'Fantasma', logro: 'Por saber la palabra secreta.' },
};

/** Rangos que desbloquean un acabado (para avisar al subir) */
export const RANGOS_CON_ACABADO = ['Oro', 'Diamante', 'Challenger'];

/** Una casilla de la colección: o se sabe cuál es, o es un easter egg sin descubrir */
export type CasillaAcabado =
	| { oculto: true }
	| { oculto?: undefined; id: AcabadoId; rango: string | null; desde: number | null; conseguido: boolean; nuevo: boolean; puesto: boolean };

// ── Sin base de datos: se guarda en el navegador ──
const CLAVE_DEMO = 'trio-demo-acabados';
interface Demo {
	conseguidos: AcabadoId[];
	vistos: AcabadoId[];
	puesto: AcabadoId | null;
}
function leerDemo(): Demo {
	try {
		return { conseguidos: [], vistos: [], puesto: null, ...JSON.parse(localStorage.getItem(CLAVE_DEMO) ?? '{}') };
	} catch {
		return { conseguidos: [], vistos: [], puesto: null };
	}
}
const guardarDemo = (d: Demo) => localStorage.setItem(CLAVE_DEMO, JSON.stringify(d));
function darDemo(id: AcabadoId) {
	const d = leerDemo();
	if (d.conseguidos.includes(id)) return false;
	guardarDemo({ ...d, conseguidos: [...d.conseguidos, id] });
	return true;
}
const RANGO_DEMO: Partial<Record<AcabadoId, [string, number]>> = { holo: ['Oro', 100], arcoiris: ['Diamante', 250], dorado: ['Challenger', 420] };

/** El acabado que lleva puesto el invitado de ejemplo */
export const acabadoDemo = () => leerDemo().puesto;

// ── RPC ──

/** RPC `mis_acabados(clave)`: la colección, en orden */
export async function misAcabados(): Promise<CasillaAcabado[]> {
	if (usaBD()) return (await rpcConClave<CasillaAcabado[] | null>('mis_acabados')) ?? [];
	const d = leerDemo();
	return (Object.keys(ACABADOS) as AcabadoId[]).map((id) => {
		const conseguido = d.conseguidos.includes(id);
		const rango = RANGO_DEMO[id];
		if (!rango && !conseguido) return { oculto: true };
		return { id, rango: rango?.[0] ?? null, desde: rango?.[1] ?? null, conseguido, nuevo: conseguido && !d.vistos.includes(id), puesto: d.puesto === id };
	});
}

/** RPC `acabados_vistos(clave)`: ya ha abierto el sobre de los nuevos */
export async function acabadosVistos(): Promise<void> {
	if (usaBD()) return rpcConClave<void>('acabados_vistos');
	const d = leerDemo();
	guardarDemo({ ...d, vistos: d.conseguidos });
}

/** RPC `poner_acabado(clave, acabado)`: con cuál sale en el álbum (null: el normal). Error: 'no-conseguido'. */
export async function ponerAcabado(acabado: AcabadoId | null): Promise<void> {
	if (usaBD()) return rpcConClave<void>('poner_acabado', { acabado });
	guardarDemo({ ...leerDemo(), puesto: acabado });
}

/** RPC `tocar_nenufar(clave)`: easter egg del nenúfar. Devuelve si es la primera vez. */
export async function tocarNenufar(): Promise<boolean> {
	return usaBD() ? rpcConClave<boolean>('tocar_nenufar') : darDemo('empapado');
}

/** RPC `decir_palabra(clave, palabra)`: easter egg de la palabra secreta. Devuelve si es la primera vez. Error: 'palabra'. */
export async function decirPalabra(palabra: string): Promise<boolean> {
	if (usaBD()) return rpcConClave<boolean>('decir_palabra', { palabra });
	if (palabra.trim().toLowerCase() !== 'croac') throw new Error('palabra');
	return darDemo('fantasma');
}
