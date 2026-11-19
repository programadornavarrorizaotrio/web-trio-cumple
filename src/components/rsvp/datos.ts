// Contrato con la base de datos (tarea B4). Si cambia algo aquí, avisar a quien lleve el diseño.
export interface Asistencia {
	asiste: boolean;
	acompanantes: number;
	alergias: string | null;
}

import { rpcConClave, usaBD } from '../../lib/rpc';

const CLAVE_DEMO = 'trio-demo-asistencia';

// RPC `get_invitado(clave)` (su campo `asistencia`). Sin registro en la BD, la de ejemplo del navegador.
export async function obtenerAsistencia(): Promise<Asistencia | null> {
	if (usaBD()) return (await rpcConClave<{ asistencia: Asistencia | null } | null>('get_invitado'))?.asistencia ?? null;
	try {
		return JSON.parse(localStorage.getItem(CLAVE_DEMO) ?? 'null');
	} catch {
		return null;
	}
}

// RPC `confirmar_asistencia(clave, asiste, acompanantes, alergias)`. Error: 'datos'.
export async function guardarAsistencia(asistencia: Asistencia): Promise<Asistencia> {
	if (usaBD()) {
		await rpcConClave('confirmar_asistencia', { ...asistencia });
		return asistencia;
	}
	localStorage.setItem(CLAVE_DEMO, JSON.stringify(asistencia));
	return asistencia;
}

/** Lee los campos de <CamposAsistencia /> de un formulario */
export function leerCampos(form: HTMLFormElement): Asistencia {
	const datos = new FormData(form);
	const asiste = datos.get('asiste') === 'si';
	return {
		asiste,
		acompanantes: asiste ? Number(datos.get('acompanantes') ?? 0) : 0,
		alergias: asiste ? String(datos.get('alergias') ?? '').trim() || null : null,
	};
}
