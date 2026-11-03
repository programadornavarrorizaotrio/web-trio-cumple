// Estado del carrete según las fechas de fiesta.json (portado de photosWindow.ts del prototipo).
export type EstadoFotos = 'desactivado' | 'proximamente' | 'abierto' | 'cerrado';

export function estadoFotos(
	fechas: { abiertasDesde?: string | null; abiertasHasta?: string | null },
	ahora = new Date(),
): EstadoFotos {
	if (!fechas.abiertasDesde && !fechas.abiertasHasta) return 'desactivado';
	if (fechas.abiertasDesde && ahora < new Date(fechas.abiertasDesde)) return 'proximamente';
	if (fechas.abiertasHasta && ahora > new Date(fechas.abiertasHasta)) return 'cerrado';
	return 'abierto';
}
