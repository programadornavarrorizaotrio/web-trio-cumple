// La conga de Catan: el juego de la serpiente. La rana va delante y su cola es una conga de invitados
// (sus caras). Comes cervezas y recursos de Catan: cada uno suma a alguien a la conga. A partir de
// cierto punto aparece el ladrón, que es una pared más. Se gira deslizando el dedo (o con las flechas).
//
// TODO(DB): como en el resto de juegos en tiempo real, el servidor no puede comprobar la partida;
// acepta las comidas que mande el navegador con el tope de puntos del minijuego.
import { obtenerAlbum } from '../cromos/datos';
import type { Cromo } from '../cromos/tipos';
import { MINIJUEGOS } from './liga';
import type { Contexto, Resultado } from './partida';

export const instrucciones = 'Desliza el dedo para guiar a la rana. Cada cerveza o recurso que comas suma a un invitado a la conga. No choques con las paredes, con la conga ni con el diablillo ladrón.';

const COLUMNAS = 11;
const FILAS = 14;
const MAX = MINIJUEGOS.find((m) => m.id === 'conga-catan')!.maxPuntos;
const PUNTOS_POR_COMIDA = 2;
const COMIDAS = ['🍺', '🍺', '🍺', '🌲', '🧱', '🐑', '🌾', '⛰️'];
const MS_INICIO = 210; // ms por casilla al empezar
const MS_MINIMO = 100;
const MS_MENOS_POR_COMIDA = 5;
const LADRON_DESDE = 3; // primera aparición, tras estas comidas
const LADRON_CADA = 3; // y uno nuevo cada tantas comidas
const MAX_LADRONES = 6;
const FUENTE_EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

interface Casilla {
	x: number;
	y: number;
}
const iguales = (a: Casilla, b: Casilla) => a.x === b.x && a.y === b.y;

interface Invitado {
	cromo: Cromo;
	foto: HTMLImageElement | null;
}

const barajar = <T>(lista: T[]) => {
	const a = [...lista];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
};

function cargar(src: string): Promise<HTMLImageElement | null> {
	return new Promise((resolve) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => resolve(null);
		img.src = src;
	});
}

export async function jugar(area: HTMLElement, senal: AbortSignal, { ranaSrc, ladronSrc }: Contexto): Promise<Resultado> {
	// La conga: primero los especiales (el trío), luego el resto con foto y, al final, los que no tienen
	const { cromos } = await obtenerAlbum();
	const orden = [...cromos.filter((c) => c.especial), ...barajar(cromos.filter((c) => !c.especial && c.foto)), ...barajar(cromos.filter((c) => !c.especial && !c.foto))];
	const [rana, diablillo, ...fotos] = await Promise.all([cargar(ranaSrc), cargar(ladronSrc), ...orden.map((c) => (c.foto ? cargar(c.foto) : Promise.resolve(null)))]);
	const invitados: Invitado[] = orden.map((cromo, i) => ({ cromo, foto: fotos[i] }));
	if (!invitados.length) invitados.push({ cromo: { id: '?', numero: 0, nombre: '?', apodo: '', frase: null, foto: null }, foto: null });

	return new Promise((resolve) => {
		// Tamaño: la cuadrícula ocupa el ancho disponible, con la nitidez de la pantalla
		const lado = Math.floor(Math.min(area.clientWidth || 340, 360) / COLUMNAS);
		const dpr = window.devicePixelRatio || 1;
		const lienzo = document.createElement('canvas');
		lienzo.className = 'conga-lienzo';
		lienzo.width = lado * COLUMNAS * dpr;
		lienzo.height = lado * FILAS * dpr;
		lienzo.style.width = `${lado * COLUMNAS}px`;
		lienzo.style.height = `${lado * FILAS}px`;
		lienzo.setAttribute('role', 'img');
		lienzo.setAttribute('aria-label', 'Tablero de la conga. Desliza para girar la rana.');
		const ctx = lienzo.getContext('2d')!;
		ctx.scale(dpr, dpr);

		const hud = document.createElement('div');
		hud.className = 'memo-hud';
		const marcadorComidas = document.createElement('span');
		const marcadorLargo = document.createElement('span');
		hud.append(marcadorComidas, marcadorLargo);
		area.replaceChildren(hud, lienzo);

		// --- Estado ---
		let culebra: Casilla[] = [{ x: Math.floor(COLUMNAS / 2), y: Math.floor(FILAS / 2) }]; // cabeza primero
		let direccion: Casilla | null = null; // aún no se ha movido
		let siguiente: Casilla | null = null;
		let comida: { pos: Casilla; emoji: string };
		let ladrones: Casilla[] = [];
		let comidas = 0;
		let terminada = false;
		let mensaje = '';
		let temporizador = 0;

		const ocupada = (c: Casilla) => culebra.some((s) => iguales(s, c)) || ladrones.some((l) => iguales(l, c)) || (comida && iguales(comida.pos, c));
		function casillaLibre(distanciaMinima = 0): Casilla | null {
			const libres: Casilla[] = [];
			for (let y = 0; y < FILAS; y++) for (let x = 0; x < COLUMNAS; x++) {
				const c = { x, y };
				if (!ocupada(c) && Math.abs(x - culebra[0].x) + Math.abs(y - culebra[0].y) >= distanciaMinima) libres.push(c);
			}
			return libres.length ? libres[Math.floor(Math.random() * libres.length)] : null;
		}
		function nuevaComida() {
			const pos = casillaLibre();
			if (pos) comida = { pos, emoji: COMIDAS[Math.floor(Math.random() * COMIDAS.length)] };
		}
		nuevaComida();

		// --- Dibujo ---
		const centro = (c: Casilla) => ({ cx: c.x * lado + lado / 2, cy: c.y * lado + lado / 2 });
		function emoji(texto: string, c: Casilla, escala = 0.78) {
			const { cx, cy } = centro(c);
			ctx.font = `${lado * escala}px ${FUENTE_EMOJI}`;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText(texto, cx, cy + lado * 0.04);
		}
		function cara(c: Casilla, img: HTMLImageElement | null, inicial: string, recorte?: { sx: number; sy: number; sw: number; sh: number }, borde = '#f0c14b') {
			const { cx, cy } = centro(c);
			const r = lado * 0.46;
			ctx.save();
			ctx.beginPath();
			ctx.arc(cx, cy, r, 0, Math.PI * 2);
			ctx.clip();
			if (img) {
				// Cuadrado centrado y pegado arriba, donde suele estar la cara
				const s = recorte ?? { sx: (img.width - Math.min(img.width, img.height)) / 2, sy: 0, sw: Math.min(img.width, img.height), sh: Math.min(img.width, img.height) };
				ctx.drawImage(img, s.sx, s.sy, s.sw, s.sh, cx - r, cy - r, r * 2, r * 2);
			} else {
				ctx.fillStyle = '#8a5a30';
				ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
				ctx.fillStyle = '#f7dc8f';
				ctx.font = `900 ${lado * 0.5}px sans-serif`;
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				ctx.fillText(inicial, cx, cy + lado * 0.03);
			}
			ctx.restore();
			ctx.beginPath();
			ctx.arc(cx, cy, r, 0, Math.PI * 2);
			ctx.lineWidth = Math.max(2, lado * 0.07);
			ctx.strokeStyle = borde;
			ctx.stroke();
		}

		function dibujar() {
			// Suelo de pasto de Catan, a cuadros
			for (let y = 0; y < FILAS; y++) for (let x = 0; x < COLUMNAS; x++) {
				ctx.fillStyle = (x + y) % 2 ? '#a9d160' : '#9ccb52';
				ctx.fillRect(x * lado, y * lado, lado, lado);
			}
			ladrones.forEach((l) => {
				ctx.shadowColor = 'rgb(0 0 0 / 0.5)';
				ctx.shadowBlur = 4;
				if (diablillo) {
					// El ladrón es la rana en versión diablillo: se recorta la cabeza con los cuernos
					const { cx, cy } = centro(l);
					// Solo la cabeza con los cuernos y el inicio de la corbata (recorte en proporción de la imagen)
					// Fondo oscuro con borde rojo: se distingue del pasto y de la rana, que también son verdes
					ctx.beginPath();
					ctx.arc(cx, cy, lado * 0.46, 0, Math.PI * 2);
					ctx.fillStyle = '#3a1410';
					ctx.fill();
					ctx.lineWidth = Math.max(2, lado * 0.08);
					ctx.strokeStyle = '#e0432e';
					ctx.stroke();
					const ancho = lado * 1.04;
					const alto = ancho * (0.5 / 0.58);
					ctx.drawImage(diablillo, diablillo.width * 0.17, 0, diablillo.width * 0.58, diablillo.width * 0.5, cx - ancho / 2, cy - alto * 0.52, ancho, alto);
				} else {
					ctx.fillStyle = '#1d1d1f';
					emoji('♟︎', l, 0.9); // sin imagen: peón negro
				}
				ctx.shadowBlur = 0;
			});
			if (comida) emoji(comida.emoji, comida.pos);
			// De la cola a la cabeza, para que la rana quede encima
			for (let i = culebra.length - 1; i >= 1; i--) {
				const inv = invitados[(i - 1) % invitados.length];
				cara(culebra[i], inv.foto, inv.cromo.nombre.charAt(0).toUpperCase());
			}
			cara(culebra[0], rana, '🐸', rana ? { sx: rana.width * 0.24, sy: 0, sw: rana.width * 0.52, sh: rana.width * 0.52 } : undefined, '#c6f26b');

			if (mensaje) {
				ctx.fillStyle = 'rgb(70 41 15 / 0.82)';
				ctx.fillRect(0, (FILAS * lado) / 2 - lado * 1.4, COLUMNAS * lado, lado * 2.8);
				ctx.fillStyle = '#f0c14b';
				ctx.font = `900 ${lado * 0.9}px Georgia, serif`;
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				ctx.fillText(mensaje, (COLUMNAS * lado) / 2, (FILAS * lado) / 2);
			}
			marcadorComidas.textContent = `Comidas ${comidas}`;
			marcadorLargo.textContent = `Conga ${culebra.length}`;
		}

		// --- Reglas ---
		function terminar(texto = '') {
			if (terminada) return;
			terminada = true;
			clearTimeout(temporizador);
			removeEventListener('keydown', alTeclado);
			if (texto) {
				mensaje = texto;
				dibujar();
				navigator.vibrate?.([80, 40, 80]);
			}
			const fin = () =>
				resolve({
					puntos: Math.min(MAX, comidas * PUNTOS_POR_COMIDA),
					detalle: `${comidas} ${comidas === 1 ? 'cosa comida' : 'cosas comidas'} · conga de ${culebra.length}`,
				});
			texto ? setTimeout(fin, 1200) : fin();
		}

		function paso() {
			if (terminada) return;
			if (siguiente) direccion = siguiente;
			if (direccion) {
				const cabeza = culebra[0];
				const nueva = { x: cabeza.x + direccion.x, y: cabeza.y + direccion.y };
				const come = iguales(nueva, comida.pos);
				// La cola se mueve a no ser que crezca, así que su casilla queda libre
				const cuerpo = come ? culebra : culebra.slice(0, -1);
				if (nueva.x < 0 || nueva.y < 0 || nueva.x >= COLUMNAS || nueva.y >= FILAS) return terminar('¡Pared!');
				if (cuerpo.some((s) => iguales(s, nueva))) return terminar('¡Te pisaste!');
				if (ladrones.some((l) => iguales(l, nueva))) return terminar('¡El diablillo!');
				culebra = [nueva, ...cuerpo];
				if (come) {
					comidas++;
					navigator.vibrate?.(15);
					nuevaComida();
					if (comidas >= LADRON_DESDE && (comidas - LADRON_DESDE) % LADRON_CADA === 0 && ladrones.length < MAX_LADRONES) {
						// Lejos de la cabeza para no ser injusto
						const pos = casillaLibre(4);
						if (pos) ladrones.push(pos);
					}
				}
			}
			dibujar();
			temporizador = window.setTimeout(paso, Math.max(MS_MINIMO, MS_INICIO - culebra.length * MS_MENOS_POR_COMIDA));
		}

		// --- Controles: deslizar el dedo o flechas/WASD ---
		function girar(d: Casilla) {
			// No se puede dar la vuelta sobre uno mismo
			const actual = direccion;
			if (actual && culebra.length > 1 && d.x === -actual.x && d.y === -actual.y) return;
			siguiente = d;
			if (!actual && !temporizador) temporizador = window.setTimeout(paso, 0); // el primer gesto arranca
		}
		const TECLAS: Record<string, Casilla> = {
			ArrowUp: { x: 0, y: -1 }, w: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }, s: { x: 0, y: 1 },
			ArrowLeft: { x: -1, y: 0 }, a: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, d: { x: 1, y: 0 },
		};
		function alTeclado(ev: KeyboardEvent) {
			const d = TECLAS[ev.key];
			if (d) {
				ev.preventDefault();
				girar(d);
			}
		}
		addEventListener('keydown', alTeclado);

		let origen: { x: number; y: number } | null = null;
		const UMBRAL = 22; // px de deslizamiento para contar como giro
		lienzo.addEventListener('pointerdown', (ev) => {
			origen = { x: ev.clientX, y: ev.clientY };
			lienzo.setPointerCapture(ev.pointerId);
		});
		lienzo.addEventListener('pointermove', (ev) => {
			if (!origen) return;
			const dx = ev.clientX - origen.x;
			const dy = ev.clientY - origen.y;
			if (Math.max(Math.abs(dx), Math.abs(dy)) < UMBRAL) return;
			girar(Math.abs(dx) > Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) });
			origen = { x: ev.clientX, y: ev.clientY }; // permite encadenar giros sin levantar el dedo
		});
		const soltar = () => (origen = null);
		lienzo.addEventListener('pointerup', soltar);
		lienzo.addEventListener('pointercancel', soltar);

		// La partida espera al primer gesto; mientras, una pista
		mensaje = 'Desliza para empezar';
		dibujar();
		mensaje = '';
		senal.addEventListener('abort', () => terminar(), { once: true });
	});
}
