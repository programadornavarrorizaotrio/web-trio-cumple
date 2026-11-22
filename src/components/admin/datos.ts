// Contrato con las RPC `admin_*` (supabase/migrations/…_admin.sql). Solo funcionan con la sesión de un admin:
// fallan con 'sesion' si no hay clave válida y con 'no-admin' si el invitado no es organizador.
import { rpcConClave } from '../../lib/rpc';
import type { EquipoId } from '../juegos/liga';

export interface Resumen {
	invitados: number;
	registrados: number;
	vienen: number;
	noVienen: number;
	/** Los que vienen más sus acompañantes */
	personas: number;
	alergias: { nombre: string; alergias: string }[];
	jugadores: number;
	equipos: { equipo: EquipoId; puntos: number; miembros: number }[];
	premiosPorEntregar: number;
	ligaCerrada: boolean;
}

export interface InvitadoAdmin {
	id: string;
	numero: number;
	nombre: string;
	apodo: string | null;
	frase: string | null;
	/** Ruta de su foto en el bucket `cromos` (ver `urlFoto`), o null */
	foto: string | null;
	rol: 'invitado' | 'admin';
	especial: boolean;
	visible: boolean;
	registrado: boolean;
	/** Null si aún no ha respondido */
	asiste: boolean | null;
	acompanantes: number | null;
	alergias: string | null;
	/** Null si aún no juega la liga */
	equipo: EquipoId | null;
	puntos: number | null;
}

export interface PremioAdmin {
	id: string;
	titulo: string;
	descripcion: string;
	requisito: { tipo: 'rango'; rango: string } | { tipo: 'podio'; hasta: number } | { tipo: 'equipo' };
	activo: boolean;
	conseguidos: number;
	entregados: number;
}

export interface CodigoPremio {
	codigo: string;
	premio: string;
	nombre: string;
	apodo: string | null;
	entregado: boolean;
	entregadoEn: string | null;
}

export interface Ajustes {
	tiradasEntreSemana: number;
	tiradasFinDeSemana: number;
	penalizacionDiablo: number;
	/** Fecha ISO */
	cierreLiga: string;
}

export interface PalabraWordle {
	id: number;
	palabra: string;
	/** Día en que sale (YYYY-MM-DD) o null si aún no ha salido */
	dia: string | null;
}

export const resumen = () => rpcConClave<Resumen>('admin_resumen');
export const invitados = () => rpcConClave<InvitadoAdmin[]>('admin_invitados');

/** Crea (sin `id`) o edita un invitado. Errores: 'datos', 'numero-repetido', 'no-existe'. */
export const guardarInvitado = (datos: { id: string | null; nombre: string; numero: number | null; especial: boolean; visible: boolean }) =>
	rpcConClave<{ id: string; numero: number }>('admin_guardar_invitado', datos);

/** Cierra sus sesiones para que se vuelva a registrar (cambió de móvil). Conserva asistencia, equipo y puntos. */
export const nuevoMovil = (invitadoId: string) => rpcConClave<void>('admin_nuevo_movil', { invitado_id: invitadoId });

/** Quita la foto de su cromo (vuelve a la inicial). Error: 'no-existe'. */
export const quitarFoto = (invitadoId: string) => rpcConClave<void>('admin_quitar_foto', { invitado_id: invitadoId });

/** Errores: 'datos', 'sin-equipo'. */
export const ajustarPuntos = (invitadoId: string, puntos: number, motivo: string) =>
	rpcConClave<{ puntos: number }>('admin_ajustar_puntos', { invitado_id: invitadoId, puntos, motivo });

export const premios = () => rpcConClave<PremioAdmin[]>('admin_premios');
export const guardarPremio = (id: string, titulo: string, descripcion: string, activo: boolean) =>
	rpcConClave<void>('admin_guardar_premio', { id, titulo, descripcion, activo });
/** Error: 'no-existe'. */
export const buscarCodigo = (codigo: string) => rpcConClave<CodigoPremio>('admin_buscar_codigo', { codigo });
/** Errores: 'no-existe', 'ya-entregado'. */
export const entregarPremio = (codigo: string) => rpcConClave<void>('admin_entregar_premio', { codigo });

export const ajustes = () => rpcConClave<Ajustes>('admin_ajustes');
/** Error: 'datos'. */
export const guardarAjustes = (a: Ajustes) =>
	rpcConClave<void>('admin_guardar_ajustes', {
		tiradas_entre_semana: a.tiradasEntreSemana,
		tiradas_fin_de_semana: a.tiradasFinDeSemana,
		penalizacion_diablo: a.penalizacionDiablo,
		cierre_liga: a.cierreLiga,
	});
/** Error: 'datos' (de 4 a 20 caracteres). */
export const cambiarPin = (pin: string) => rpcConClave<void>('admin_cambiar_pin', { pin });

export const palabrasWordle = () => rpcConClave<PalabraWordle[]>('admin_wordle');
/** Devuelve cuántas se han añadido (las repetidas se ignoran). Error: 'datos'. */
export const anadirWordle = (palabras: string[]) => rpcConClave<number>('admin_anadir_wordle', { palabras });
/** Errores: 'no-existe', 'ya-salio'. */
export const borrarWordle = (id: number) => rpcConClave<void>('admin_borrar_wordle', { id });

/** Mensaje para los errores de las RPC */
export function mensajeError(e: unknown): string {
	const codigo = e instanceof Error ? e.message : '';
	const mensajes: Record<string, string> = {
		sesion: 'Tu sesión ya no vale. Vuelve a registrarte.',
		'no-admin': 'Esto es solo para los organizadores.',
		datos: 'Revisa los datos: falta algo o no es válido.',
		'numero-repetido': 'Ese número de cromo ya lo tiene otro invitado.',
		'no-existe': 'No se ha encontrado. Revisa que esté bien escrito.',
		'ya-entregado': 'Ese premio ya se entregó.',
		'sin-equipo': 'Aún no juega la liga: tiene que elegir equipo antes.',
		'ya-salio': 'Esa palabra ya ha salido: no se puede borrar.',
	};
	return mensajes[codigo] ?? 'No se ha podido hacer. Comprueba la conexión e inténtalo otra vez.';
}
