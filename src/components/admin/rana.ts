// Lógica de la pestaña "Rana" del admin (el marcado está en AdminRana.astro).
import * as admin from './datos';
import type { DestinoRana, MensajeRanaAdmin } from './datos';
import { equipoPorId, type EquipoId } from '../juegos/liga';

interface Ayudas {
	avisar: (texto: string, bien?: boolean) => void;
	/** Ejecuta algo con el botón bloqueado y avisa del resultado */
	accion: (boton: HTMLButtonElement | null, hacer: () => Promise<string | void>) => Promise<void>;
}

const MAX = 160;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, clase = '', texto?: string) {
	const e = document.createElement(tag);
	if (clase) e.className = clase;
	if (texto !== undefined) e.textContent = texto;
	return e;
}

export function montarRana(raiz: HTMLElement, { accion }: Ayudas) {
	const $ = <T extends HTMLElement = HTMLElement>(sel: string) => raiz.querySelector<T>(sel)!;
	const form = $<HTMLFormElement>('[data-form-rana]');
	const texto = form.elements.namedItem('texto') as HTMLTextAreaElement;
	const invitado = form.elements.namedItem('invitado') as HTMLSelectElement;
	const equipo = form.elements.namedItem('equipo') as HTMLSelectElement;
	const horas = form.elements.namedItem('horas') as HTMLSelectElement;
	const elegido = (nombre: string) => form.querySelector<HTMLInputElement>(`[name="${nombre}"]:checked`)!;
	const destino = () => elegido('destino').value as DestinoRana;

	// ── Vista previa ──
	function refrescar() {
		const d = destino();
		$('[data-elige-equipo]').hidden = d !== 'equipo';
		$('[data-elige-invitado]').hidden = d !== 'invitado';
		const pose = elegido('pose');
		$('[data-previa]').dataset.pose = pose.value;
		$<HTMLImageElement>('[data-previa-img]').src = pose.dataset.src!;
		// En la vista previa `{nombre}` es el de la persona elegida o, para los grupos, uno de ejemplo
		const persona = d === 'invitado' ? invitado.selectedOptions[0]?.text.trim().split(/\s+/)[0] : undefined;
		$('[data-previa-texto]').textContent = (texto.value.trim() || texto.placeholder).replaceAll('{nombre}', persona || 'Lucía');
		$('[data-quedan]').textContent = `${texto.value.length}/${MAX}`;
	}
	form.addEventListener('input', refrescar);
	form.addEventListener('change', refrescar);

	$('[data-poner-nombre]').addEventListener('click', () => {
		const { selectionStart: a, selectionEnd: b } = texto;
		if (texto.value.length - (b - a) + '{nombre}'.length > MAX) return;
		texto.setRangeText('{nombre}', a, b, 'end');
		texto.focus();
		refrescar();
	});

	// ── Decir ──
	form.addEventListener('submit', (ev) => {
		ev.preventDefault();
		const d = destino();
		if (d === 'todos' && !confirm('Se lo va a decir a todos los invitados. ¿Seguro?')) return;
		void accion((ev as SubmitEvent).submitter as HTMLButtonElement, async () => {
			await admin.ranaDecir({
				texto: texto.value.trim(),
				pose: elegido('pose').value,
				destino: d,
				equipo: d === 'equipo' ? (equipo.value as EquipoId) : null,
				invitadoId: d === 'invitado' ? invitado.value || null : null,
				horas: horas.value ? Number(horas.value) : null,
			});
			texto.value = '';
			refrescar();
			await pintarLista();
			return 'Dicho: la rana se asomará en su próxima visita';
		});
	});

	// ── Lo que ha dicho ──
	function paraQuien(m: MensajeRanaAdmin) {
		if (m.destino === 'equipo') return `Equipo de ${equipoPorId(m.equipo!).nombre}`;
		if (m.destino === 'invitado') return m.invitado ?? 'Una persona';
		return { todos: 'Todos', 'sin-responder': 'Sin responder', vienen: 'Los que vienen' }[m.destino];
	}

	function leido(m: MensajeRanaAdmin) {
		if (m.destino === 'invitado') return m.vistos ? 'Lo ha leído' : 'Aún no lo ha leído';
		return m.vistos === 1 ? 'Leído por 1 persona' : `Leído por ${m.vistos} personas`;
	}

	async function pintarLista() {
		const mensajes = (await admin.ranaMensajes()) ?? [];
		$('[data-lista-rana]').replaceChildren(
			...(mensajes.length
				? mensajes.map((m) => {
						const li = el('li', `flex items-start gap-3 rounded-lg bg-white p-3 shadow-chapa ${m.activo ? '' : 'opacity-60'}`);
						const caja = el('div', 'min-w-0 flex-1');
						caja.append(
							el('p', 'font-bold break-words', `«${m.texto}»`),
							el('p', 'mt-1 text-xs text-tinta-suave', [paraQuien(m), leido(m), m.autor ? `de ${m.autor}` : ''].filter(Boolean).join(' · ')),
							el('p', 'text-xs text-tinta-suave', vigencia(m)),
						);
						li.append(caja);
						if (m.activo) {
							const callar = el('button', 'shrink-0 rounded-full border-2 border-granate/20 px-3 py-2 text-xs font-bold text-granate active:bg-amarillo-claro disabled:opacity-40', 'Callar');
							callar.type = 'button';
							callar.setAttribute('aria-label', `Callar: ${m.texto}`);
							callar.addEventListener('click', () =>
								accion(callar, async () => {
									await admin.ranaCallar(m.id);
									await pintarLista();
									return 'Callada';
								}),
							);
							li.append(callar);
						}
						return li;
					})
				: [el('li', 'rounded-lg bg-crema-oscuro p-4 text-center text-sm text-tinta-suave', 'Todavía no ha abierto la boca.')]),
		);
	}

	function vigencia(m: MensajeRanaAdmin) {
		if (!m.activo) return 'Ya no sale';
		if (!m.caducaEn) return 'Hasta que la calléis';
		return `Hasta el ${new Date(m.caducaEn).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
	}

	async function pintar() {
		const antes = invitado.value;
		const [lista] = await Promise.all([admin.invitados(), pintarLista()]);
		invitado.replaceChildren(
			...lista
				.filter((i) => i.visible && i.registrado)
				.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
				.map((i) => new Option(i.nombre, i.id)),
		);
		if (antes) invitado.value = antes;
		refrescar();
	}

	/** Deja el formulario listo para decirle algo a esa persona (desde su ficha) */
	function para(id: string) {
		form.querySelector<HTMLInputElement>('[name="destino"][value="invitado"]')!.checked = true;
		invitado.value = id;
		refrescar();
		texto.focus();
	}

	return { pintar, para };
}
