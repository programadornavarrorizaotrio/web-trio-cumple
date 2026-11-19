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
	'camel-blue': 3,
	'lucky-strike': 2,
	smoking: 8,
	montecristo: 4,
	clipper: 11,
};
const CLAVE_DEMO = 'trio-demo-estanco-v3';

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

// TODO(B5): RPC `confirmar_reserva(clave, cantidades jsonb)`: sustituye TODA la reserva del invitado por el
// carrito que manda (vacío = anularla). Debe rechazar cantidades > MAX_POR_PRODUCTO, slugs que no existan
// y cualquier cambio después de `estanco.cierreReservas` (fiesta.json).
export async function confirmarReserva(carrito: Cantidades): Promise<EstadoEstanco> {
	const mias: Cantidades = {};
	for (const [slug, n] of Object.entries(carrito)) {
		if (!Number.isInteger(n) || n < 0 || n > MAX_POR_PRODUCTO) throw new Error('cantidad');
		if (n) mias[slug] = n;
	}
	localStorage.setItem(CLAVE_DEMO, JSON.stringify(mias));
	return estadoDemo(mias);
}

export const euros = (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);
