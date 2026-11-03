// Contrato con la base de datos (tarea B5). Los slugs tienen que existir en src/data/estanco.json
// (la migración lo comprueba con un CHECK) y la cantidad va de 0 a MAX_POR_PRODUCTO.
export const MAX_POR_PRODUCTO = 2;

/** slug → unidades */
export type Cantidades = Record<string, number>;

export interface EstadoEstanco {
	/** Lo que ha reservado el invitado actual */
	mias: Cantidades;
	/** Unidades reservadas entre todos los invitados (incluidas las mías) */
	totales: Cantidades;
}

// Reservas de "los demás" para que el mockup tenga contadores
const TOTALES_DEMO: Cantidades = {
	'marlboro-red': 9,
	'marlboro-gold': 4,
	winston: 6,
	camel: 3,
	'lucky-strike': 2,
	ducados: 5,
	fortuna: 7,
	pueblo: 3,
	smoking: 8,
	montecristo: 4,
	clipper: 11,
};
const CLAVE_DEMO = 'trio-demo-estanco-v2';

function misDemo(): Cantidades {
	try {
		return JSON.parse(localStorage.getItem(CLAVE_DEMO) ?? '{}');
	} catch {
		return {};
	}
}

function estadoDemo(mias: Cantidades): EstadoEstanco {
	const totales = { ...TOTALES_DEMO };
	for (const [slug, n] of Object.entries(mias)) totales[slug] = (totales[slug] ?? 0) + n;
	return { mias, totales };
}

// TODO(B5): RPC `estado_estanco(clave)` → { mias, totales }.
export async function estadoEstanco(): Promise<EstadoEstanco> {
	return estadoDemo(misDemo());
}

// TODO(B5): RPC `reservar(clave, producto, cantidad)`; 0 borra la reserva. Debe rechazar > MAX_POR_PRODUCTO
// y cualquier cambio después de `estanco.cierreReservas` (fiesta.json).
export async function reservar(slug: string, cantidad: number): Promise<EstadoEstanco> {
	if (cantidad < 0 || cantidad > MAX_POR_PRODUCTO) throw new Error('cantidad');
	const mias = { ...misDemo(), [slug]: cantidad };
	if (cantidad === 0) delete mias[slug];
	localStorage.setItem(CLAVE_DEMO, JSON.stringify(mias));
	return estadoDemo(mias);
}

export const euros = (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);
