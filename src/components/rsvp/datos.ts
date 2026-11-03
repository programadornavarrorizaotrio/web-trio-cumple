// Contrato con la base de datos (tarea B4). Si cambia algo aquí, avisar a quien lleve el diseño.
export interface Asistencia {
	asiste: boolean;
	acompanantes: number;
	alergias: string | null;
}

const CLAVE_DEMO = 'trio-demo-asistencia';

// TODO(B4): leerla de la RPC `get_invitado(clave)`.
export async function obtenerAsistencia(): Promise<Asistencia | null> {
	try {
		return JSON.parse(localStorage.getItem(CLAVE_DEMO) ?? 'null');
	} catch {
		return null;
	}
}

// TODO(B4): RPC `confirmar_asistencia(clave, asiste, acompanantes, alergias)`.
export async function guardarAsistencia(asistencia: Asistencia): Promise<Asistencia> {
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
