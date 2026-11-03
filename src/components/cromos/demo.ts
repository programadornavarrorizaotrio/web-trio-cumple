// Base de datos de mentira para trabajar sin Supabase. Imita las RPC de B:
// `buscar_invitados`, `registrar` y `listar_cromos`. Los registros se guardan en localStorage.
// TODO(B): borrar este archivo cuando existan las RPC y apuntar datos.ts a src/lib/supabase.ts.
import trio from '../../data/trio.json';
import type { Album, Cromo } from './tipos';
import { invitadoActual } from '../registro/sesion';

interface InvitadoDemo {
	id: string;
	numero: number;
	nombre: string;
	especial?: boolean;
	/** Si viene relleno, el invitado ya estaba registrado */
	cromo?: DatosCromo;
}

const INVITADOS: InvitadoDemo[] = [
	...trio.map((p, i) => ({
		id: p.slug,
		numero: i + 1,
		nombre: p.nombre,
		especial: true,
		cromo: { apodo: p.lema, frase: p.advertencia },
	})),
	{ id: 'd4', numero: 4, nombre: 'Marta López', cromo: { apodo: 'La Jefa', frase: 'Vengo por el estanco, me quedo por la barra' } },
	{ id: 'd5', numero: 5, nombre: 'Álvaro Ruiz', cromo: { apodo: 'El Gamba', frase: 'Bailo mejor de lo que parece' } },
	{ id: 'd6', numero: 6, nombre: 'Lucía Martín', cromo: { apodo: 'Doble Grado', frase: null } },
	{ id: 'd7', numero: 7, nombre: 'Sergio Gil', cromo: { apodo: 'Sergi DJ', frase: 'Pido canciones y no las bailo' } },
	{ id: 'd8', numero: 8, nombre: 'Carmen Ortiz' },
	{ id: 'd9', numero: 9, nombre: 'Dani Navarro', cromo: { apodo: 'El Rubio', frase: 'Traigo hielo' } },
	{ id: 'd10', numero: 10, nombre: 'Irene Sáez' },
	{ id: 'd11', numero: 11, nombre: 'Rubén Torres' },
	{ id: 'd12', numero: 12, nombre: 'Paula Romero', cromo: { apodo: 'Paulita Power', frase: 'Confirmo y luego ya veremos' } },
	{ id: 'd13', numero: 13, nombre: 'Andrea Molina' },
	{ id: 'd14', numero: 14, nombre: 'Javi Castro' },
	{ id: 'd15', numero: 15, nombre: 'Laura Vidal' },
	{ id: 'd16', numero: 16, nombre: 'Pablo Serrano' },
	{ id: 'd17', numero: 17, nombre: 'Elena Prieto' },
	{ id: 'd18', numero: 18, nombre: 'Marcos Iglesias' },
	{ id: 'd19', numero: 19, nombre: 'Nerea Campos' },
	{ id: 'd20', numero: 20, nombre: 'Hugo Delgado' },
];

const CLAVE_DEMO = 'trio-demo-registros';

interface DatosCromo {
	apodo: string;
	frase: string | null;
	/** Si confirmó que viene. Solo los confirmados salen en el álbum */
	asiste?: boolean;
}

function registrosLocales(): Record<string, DatosCromo> {
	try {
		return JSON.parse(localStorage.getItem(CLAVE_DEMO) ?? '{}');
	} catch {
		return {};
	}
}

/** Fotos del trío: Cromos.astro / FotosDemo.astro las dejan optimizadas en la página */
function fotosDemo(): Record<string, string> {
	const json = document.getElementById('fotos-demo')?.textContent;
	return json ? JSON.parse(json) : {};
}

function aCromo(inv: InvitadoDemo, datos: DatosCromo): Cromo {
	return {
		id: inv.id,
		numero: inv.numero,
		nombre: inv.nombre,
		apodo: datos.apodo,
		frase: datos.frase,
		foto: fotosDemo()[inv.id] ?? null,
		especial: inv.especial,
	};
}

const normalizar = (t: string) =>
	t
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase();

export async function demoBuscar(texto: string) {
	const locales = registrosLocales();
	const q = normalizar(texto.trim());
	return INVITADOS.filter((i) => normalizar(i.nombre).includes(q))
		.slice(0, 10)
		.map((i) => ({ id: i.id, nombre: i.nombre, registrado: Boolean(i.cromo || locales[i.id]) }));
}

export async function demoRegistrar(id: string, datos: DatosCromo) {
	const inv = INVITADOS.find((i) => i.id === id);
	const locales = registrosLocales();
	if (!inv || inv.cromo || locales[id]) throw new Error('ya-registrado');
	localStorage.setItem(CLAVE_DEMO, JSON.stringify({ ...locales, [id]: datos }));
	return { clave: `demo-${id}-${Date.now()}`, cromo: aCromo(inv, datos) };
}

/** Respuesta que el invitado actual guardó en el módulo de asistencia (`rsvp/datos.ts`) */
function asistenciaPropia(): boolean | undefined {
	try {
		return JSON.parse(localStorage.getItem('trio-demo-asistencia') ?? 'null')?.asiste;
	} catch {
		return undefined;
	}
}

// Solo los confirmados: es lo que hará la RPC `listar_cromos`.
export async function demoAlbum(): Promise<Album> {
	const locales = registrosLocales();
	const yo = invitadoActual()?.id;
	const cromos = INVITADOS.flatMap((i) => {
		const datos = i.cromo ?? locales[i.id];
		if (!datos) return [];
		const asiste = i.id === yo ? (asistenciaPropia() ?? datos.asiste ?? true) : (datos.asiste ?? true);
		return asiste ? [aCromo(i, datos)] : [];
	});
	return { cromos, total: INVITADOS.length };
}
