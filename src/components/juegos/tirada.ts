// La tirada diaria: dos dados. El número que sale es la ficha de un hexágono, y ese es el juego del día
// (como en Catan, donde el número decide qué casilla produce). El 7 es el diablillo y quita puntos.
// Si sale un número que no produce nada, se vuelve a tirar sin gastar la tirada.
//
// Los dados son cubos 3D de CSS vistos desde arriba sobre un tapete. Cada lanzamiento se calcula aquí
// como una trayectoria (vuelo, tres botes y un último rodar) y se reproduce con la Web Animations API;
// el giro está calculado para que el dado acabe enseñando arriba justo la cara que ha salido.
import { MINIJUEGOS, tirarDados, type ResultadoTirada, type Tirada } from './liga';
import { lanzar } from './partida';

// Casillas (0-8 en una cuadrícula 3×3) que llevan punto en cada cara
const PUNTOS: Record<number, number[]> = {
	1: [4],
	2: [2, 6],
	3: [2, 4, 6],
	4: [0, 2, 6, 8],
	5: [0, 2, 4, 6, 8],
	6: [0, 2, 3, 5, 6, 8],
};

// Dónde va cada cara en el cubo (las opuestas suman 7) y el giro que la pone mirando a la cámara
const CARAS: { valor: number; sitio: string }[] = [
	{ valor: 1, sitio: 'rotateY(0deg)' },
	{ valor: 6, sitio: 'rotateY(180deg)' },
	{ valor: 3, sitio: 'rotateY(90deg)' },
	{ valor: 4, sitio: 'rotateY(-90deg)' },
	{ valor: 2, sitio: 'rotateX(90deg)' },
	{ valor: 5, sitio: 'rotateX(-90deg)' },
];
const ORIENTACION: Record<number, [number, number]> = { 1: [0, 0], 6: [0, 180], 3: [0, -90], 4: [0, 90], 2: [-90, 0], 5: [90, 0] };

const DURACION = 1650; // ms que tarda un dado desde que sale de la mano hasta pararse
const MUESTRAS = 56; // fotogramas clave de cada trayectoria
// Vuelo y botes: [inicio, fin] en fracción del tiempo, altura al empezar y altura del arco
const BOTES = [
	{ a: 0, b: 0.36, desde: 0.95, arco: 0.6 },
	{ a: 0.36, b: 0.56, desde: 0, arco: 0.3 },
	{ a: 0.56, b: 0.68, desde: 0, arco: 0.1 },
];
const PAUSA_SIN_PRODUCCION = 1400;

const reducido = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const esperar = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const azar = (min: number, max: number) => min + Math.random() * (max - min);
const signo = (n: number) => (n < 0 ? -1 : 1);

function el<K extends keyof HTMLElementTagNameMap>(tag: K, clase: string, texto?: string) {
	const e = document.createElement(tag);
	e.className = clase;
	if (texto !== undefined) e.textContent = texto;
	return e;
}

function crearDado(color: 'claro' | 'rojo') {
	// El envoltorio lo mueve por el tapete y lleva su propia perspectiva, así cada dado se ve desde justo
	// encima y en reposo no asoman sus caras laterales. El cubo de dentro es el que gira y sube.
	const dado = el('span', `dado3d ${color}`);
	dado.setAttribute('aria-hidden', 'true');
	const cubo = el('span', 'dado-cubo');
	for (const { valor, sitio } of CARAS) {
		// Un cubo interior algo más pequeño tapa los huecos de las esquinas redondeadas; va paralelo a las
		// caras (sin cruzarse con ellas) para que el navegador no dibuje líneas al ordenar los planos
		const nucleo = el('span', 'dado-nucleo');
		nucleo.style.transform = `${sitio} translateZ(calc(var(--lado) / 2 - 3px))`;
		const cara = el('span', `dado-cara cara-${valor}`);
		cara.style.transform = `${sitio} translateZ(calc(var(--lado) / 2))`;
		cara.append(...Array.from({ length: 9 }, (_, i) => el('span', PUNTOS[valor].includes(i) ? 'dado-punto' : '')));
		cubo.append(nucleo, cara);
	}
	dado.append(cubo);
	return { dado, cubo };
}

interface Pose {
	x: number;
	y: number;
	z: number; // altura sobre el tapete, en px
	rz: number; // giro sobre el tapete
	rx: number;
	ry: number;
}

// Dónde está el dado en el tapete (envoltorio) y cómo está girado y a qué altura (cubo)
const mover = (p: Pose, lado: number) => `translate(${(p.x - lado / 2).toFixed(1)}px, ${(p.y - lado / 2).toFixed(1)}px)`;
const girar = (p: Pose) => `translateZ(${p.z.toFixed(1)}px) rotateZ(${p.rz.toFixed(1)}deg) rotateX(${p.rx.toFixed(1)}deg) rotateY(${p.ry.toFixed(1)}deg)`;

// La sombra se separa del dado y se difumina cuanto más alto va (luz desde arriba a la izquierda)
const sombrear = (p: Pose, lado: number) => {
	const alto = p.z / lado;
	return {
		transform: `translate(${(p.x - lado / 2 + lado * (0.13 + alto * 0.35)).toFixed(1)}px, ${(p.y - lado / 2 + lado * (0.2 + alto * 0.45)).toFixed(1)}px) scale(${(1.1 + alto * 0.35).toFixed(3)})`,
		opacity: Math.max(0.2, 0.85 - alto * 0.3).toFixed(3),
	};
};

function altura(t: number) {
	for (const b of BOTES) {
		if (t >= b.a && t < b.b) {
			const u = (t - b.a) / (b.b - b.a);
			return b.desde * (1 - u) + 4 * b.arco * u * (1 - u);
		}
	}
	return 0;
}

/** Fotogramas de un lanzamiento que acaba en `fin` con la cara `valor` hacia arriba. */
function trayectoria(desde: { x: number; y: number }, fin: { x: number; y: number }, valor: number, lado: number) {
	const [rxFin, ryFin] = ORIENTACION[valor];
	const rzFin = azar(-28, 28);
	const dx = fin.x - desde.x;
	const dy = fin.y - desde.y;
	// Rueda hacia donde avanza: hacia arriba gira en X, hacia los lados en Y. El resto, al azar.
	const giroX = signo(-dy) * azar(540, 900);
	const giroY = signo(dx) * azar(180, 540) + (Math.abs(dx) > Math.abs(dy) * 0.4 ? signo(dx) * 180 : 0);
	const giroZ = azar(-220, 220);
	const curva = azar(-0.25, 0.25) * Math.hypot(dx, dy); // el vuelo no es una recta perfecta

	const dado: Keyframe[] = [];
	const cubo: Keyframe[] = [];
	const sombra: Keyframe[] = [];
	for (let i = 0; i <= MUESTRAS; i++) {
		const t = i / MUESTRAS;
		const avance = 1 - (1 - t) ** 2.3;
		const vuelta = 1 - (1 - t) ** 3; // casi todo el giro va en el aire; en el suelo solo asienta
		const deriva = 1 - (1 - t) ** 2;
		const lateral = Math.sin(Math.PI * avance) * curva;
		const pose: Pose = {
			x: desde.x + dx * avance + (-dy / (Math.hypot(dx, dy) || 1)) * lateral,
			y: desde.y + dy * avance + (dx / (Math.hypot(dx, dy) || 1)) * lateral,
			z: altura(t) * lado * 2.1,
			rz: rzFin - giroZ * (1 - deriva),
			rx: rxFin - giroX * (1 - vuelta),
			ry: ryFin - giroY * (1 - vuelta),
		};
		dado.push({ transform: mover(pose, lado), offset: t });
		cubo.push({ transform: girar(pose), offset: t });
		sombra.push({ ...sombrear(pose, lado), offset: t });
	}
	const reposo: Pose = { x: fin.x, y: fin.y, z: 0, rz: rzFin, rx: rxFin, ry: ryFin };
	return { dado, cubo, sombra, reposo, golpes: BOTES.map((b) => b.b) };
}

// Ficha numerada de Catan, con los puntitos de probabilidad (más puntos, más fácil que salga)
function pintarFicha(ficha: HTMLElement, numero: number) {
	const puntos = 6 - Math.abs(7 - numero);
	ficha.className = `dados-ficha${numero === 6 || numero === 8 ? ' roja' : ''}${numero === 7 ? ' diablo' : ''}`;
	const num = el('span', 'dados-ficha-num', String(numero));
	const fila = el('span', 'dados-ficha-puntos');
	if (numero !== 7) fila.append(...Array.from({ length: puntos }, () => el('span', '')));
	ficha.replaceChildren(num, fila);
}

export async function abrirTirada(opciones: { tiradaActual: number; tiradasMax: number }) {
	const dialogo = document.querySelector<HTMLDialogElement>('[data-tirada]')!;
	const area = dialogo.querySelector<HTMLElement>('[data-tirada-area]')!;
	const ladronSrc = document.querySelector<HTMLElement>('[data-partida]')?.dataset.ladronSrc ?? '';
	let cerrado = false;
	dialogo.addEventListener('close', () => (cerrado = true), { once: true });

	// --- Escena ---
	const escena = el('div', 'dados-escena');
	const titulo = el('p', 'text-xs font-bold uppercase tracking-[0.3em] text-amarillo-claro', opciones.tiradasMax > 1 ? `Tirada ${opciones.tiradaActual} de ${opciones.tiradasMax}` : 'Tirada del día');
	const marco = el('button', 'dados-marco');
	marco.type = 'button';
	marco.setAttribute('aria-label', 'Tirar los dados');
	const tapete = el('span', 'dados-tapete');
	const sombras = [el('span', 'dado-sombra'), el('span', 'dado-sombra')];
	const piezas = [crearDado('claro'), crearDado('rojo')];
	const dados = piezas.map((p) => p.dado);
	const cubos = piezas.map((p) => p.cubo);
	const pista = el('span', 'dados-pista', 'Toca para tirar');
	tapete.append(...sombras, ...dados, pista);
	marco.append(tapete);
	const resultado = el('div', 'dados-resultado');
	const ficha = el('div', 'dados-ficha');
	ficha.setAttribute('aria-hidden', 'true');
	resultado.append(ficha);
	const mensaje = el('p', 'dados-mensaje', '');
	mensaje.setAttribute('aria-live', 'polite');
	const acciones = el('div', 'tirada-acciones');
	escena.append(titulo, marco, resultado, mensaje, acciones);
	area.replaceChildren(escena);
	dialogo.showModal();

	const lado = () => dados[0].offsetWidth;
	const medidas = () => ({ ancho: tapete.clientWidth, alto: tapete.clientHeight });
	let poses: Pose[] = [];

	function colocar(i: number, pose: Pose) {
		poses[i] = pose;
		dados[i].style.transform = mover(pose, lado());
		cubos[i].style.transform = girar(pose);
		const s = sombrear(pose, lado());
		sombras[i].style.transform = s.transform;
		sombras[i].style.opacity = s.opacity;
	}

	// Antes de tirar, los dados esperan en el tapete y tiemblan de vez en cuando, como en la mano
	{
		const { ancho, alto } = medidas();
		colocar(0, { x: ancho * 0.37, y: alto * 0.5, z: 0, rz: -12, rx: ORIENTACION[5][0], ry: ORIENTACION[5][1] });
		colocar(1, { x: ancho * 0.63, y: alto * 0.48, z: 0, rz: 9, rx: ORIENTACION[2][0], ry: ORIENTACION[2][1] });
		if (!reducido()) {
			cubos.forEach((c, i) => {
				const base = poses[i];
				const meneo = (rz: number, z: number) => girar({ ...base, rz: base.rz + rz, z });
				c.animate(
					[
						{ transform: girar(base), offset: 0 },
						{ transform: girar(base), offset: 0.7 },
						{ transform: meneo(8, 6), offset: 0.76 },
						{ transform: meneo(-7, 3), offset: 0.82 },
						{ transform: meneo(5, 5), offset: 0.88 },
						{ transform: girar(base), offset: 0.94 },
						{ transform: girar(base), offset: 1 },
					],
					{ duration: 2600, iterations: Infinity, delay: i * 90 },
				);
			});
		}
	}
	const pararAnimaciones = () => [...dados, ...cubos, ...sombras, tapete].forEach((e) => e.getAnimations().forEach((a) => a.cancel()));

	let tirando = false;
	marco.addEventListener('click', async () => {
		if (tirando) return;
		tirando = true;
		let res: ResultadoTirada;
		try {
			res = await tirarDados();
		} catch (e) {
			const codigo = e instanceof Error ? e.message : '';
			mensaje.textContent =
				codigo === 'sin-tiradas'
					? 'No tienes más tiradas hoy.'
					: codigo === 'liga-cerrada'
						? 'La liga ya ha terminado.'
						: codigo === 'sin-juegos'
							? 'Hoy ya te han tocado todos los juegos.'
							: 'No se han podido tirar los dados. Inténtalo otra vez.';
			tirando = false;
			return;
		}
		marco.classList.add('usado');
		await secuencia(res);
		document.dispatchEvent(new CustomEvent('liga:cambio'));
	});

	// Los dados se recogen del tapete (salen por abajo) antes de volver a tirar
	async function recoger() {
		const l = lado();
		const { alto } = medidas();
		const anims = dados.flatMap((d, i) => {
			const desde = poses[i];
			const fuera: Pose = { ...desde, y: alto + l * 1.2, z: l * 1.5, rz: desde.rz + azar(-40, 40) };
			sombras[i].animate([{ opacity: sombras[i].style.opacity }, { opacity: 0 }], { duration: 220, fill: 'forwards' });
			poses[i] = fuera;
			const opciones = { duration: 260, easing: 'cubic-bezier(.5,0,.9,.6)', fill: 'forwards' as const };
			return [
				d.animate([{ transform: mover(desde, l) }, { transform: mover(fuera, l) }], opciones),
				cubos[i].animate([{ transform: girar(desde) }, { transform: girar(fuera) }], opciones),
			];
		});
		await Promise.all(anims.map((a) => a.finished));
	}

	async function rodar(t: Tirada) {
		pararAnimaciones();
		const l = lado();
		const { ancho, alto } = medidas();
		// Se lanza desde abajo, como desde la mano; a veces con la derecha y a veces con la izquierda
		const zurdo = Math.random() < 0.35;
		const salida = (f: number) => ({ x: ancho * (zurdo ? 1 - f : f) + azar(-10, 10), y: alto + l * 1.1 });
		const destinos = [
			{ x: ancho * azar(0.25, 0.4), y: alto * azar(0.34, 0.6) },
			{ x: ancho * azar(0.6, 0.75), y: alto * azar(0.34, 0.6) },
		];
		if (zurdo) destinos.reverse();
		const salidas = zurdo ? [salida(0.75), salida(0.6)] : [salida(0.55), salida(0.72)];
		const valores = [t.a, t.b];

		if (reducido()) {
			dados.forEach((d, i) => {
				const tr = trayectoria(salidas[i], destinos[i], valores[i], l);
				colocar(i, tr.reposo);
				d.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250 });
			});
			await esperar(300);
			return;
		}

		const retrasos = [0, azar(60, 140)];
		const duraciones = [DURACION + azar(-80, 80), DURACION + azar(-80, 120)];
		const fin = dados.map((d, i) => {
			const tr = trayectoria(salidas[i], destinos[i], valores[i], l);
			const opciones = { duration: duraciones[i], delay: retrasos[i], easing: 'linear', fill: 'backwards' as const };
			colocar(i, tr.reposo);
			d.animate(tr.dado, opciones);
			cubos[i].animate(tr.cubo, opciones);
			sombras[i].animate(tr.sombra, opciones);
			// Cada bote se nota: vibra un poco y el primer golpe mueve el tapete
			tr.golpes.forEach((g, n) =>
				setTimeout(() => {
					if (cerrado) return;
					navigator.vibrate?.([14, 9, 5][n]);
					if (n === 0 && i === 0) tapete.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(2px)' }, { transform: 'translateY(0)' }], { duration: 140 });
				}, retrasos[i] + duraciones[i] * g),
			);
			return retrasos[i] + duraciones[i];
		});
		await esperar(Math.max(...fin) + 120);
	}

	function mostrarFicha(numero: number) {
		ficha.getAnimations().forEach((a) => a.cancel());
		pintarFicha(ficha, numero);
		ficha.animate(
			[
				{ transform: 'scale(0.2) rotate(-25deg)', opacity: 0 },
				{ transform: 'scale(1.15) rotate(4deg)', opacity: 1, offset: 0.6 },
				{ transform: 'scale(1) rotate(0)', opacity: 1 },
			],
			{ duration: reducido() ? 1 : 420, easing: 'cubic-bezier(.2,.8,.3,1.2)', fill: 'forwards' },
		);
	}

	async function ocultarFicha() {
		await ficha.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(0.7)' }], { duration: 180, fill: 'forwards' }).finished;
	}

	// Cada tirada que no da nada se explica y se repite; la última es el resultado
	async function secuencia(res: ResultadoTirada) {
		const { tiradas } = res;
		for (let i = 0; i < tiradas.length; i++) {
			if (cerrado) return;
			if (i > 0) {
				mensaje.textContent = '';
				await Promise.all([ocultarFicha(), recoger()]);
			}
			await rodar(tiradas[i]);
			if (cerrado) return;
			mostrarFicha(tiradas[i].suma);
			if (i < tiradas.length - 1) {
				ficha.classList.add('apagada');
				mensaje.textContent = `El ${tiradas[i].suma} no produce nada hoy. ¡Otra vez!`;
				await esperar(PAUSA_SIN_PRODUCCION);
			}
		}
		if (cerrado) return;
		navigator.vibrate?.(res.tipo === 'diablo' ? [80, 40, 80] : 30);
		res.tipo === 'diablo' ? mostrarDiablo(res.perdidos) : mostrarJuego(res.juego, tiradas[tiradas.length - 1].suma);
	}

	function boton(texto: string, alPulsar: () => void, secundario = false) {
		const b = el('button', secundario ? 'tirada-boton tirada-boton-sec' : 'tirada-boton', texto);
		b.type = 'button';
		b.addEventListener('click', alPulsar);
		return b;
	}

	function mostrarJuego(id: string, numero: number) {
		const juego = MINIJUEGOS.find((m) => m.id === id)!;
		escena.classList.add('premio');
		mensaje.textContent = `¡Con el ${numero} te toca ${juego.titulo}!`;
		acciones.replaceChildren(
			boton('Jugar ahora', () => {
				dialogo.close();
				void lanzar(juego.id);
			}),
			boton('Jugar luego', () => dialogo.close(), true),
		);
	}

	function mostrarDiablo(perdidos: number) {
		escena.classList.add('ladron');
		if (!reducido()) {
			marco.animate(
				[0, -7, 6, -5, 4, -2, 0].map((x) => ({ transform: `translateX(${x}px)` })),
				{ duration: 450, easing: 'ease-out' },
			);
		}
		mensaje.textContent = perdidos > 0 ? `¡El diablillo! Te quita ${perdidos} puntos` : '¡El diablillo! Por suerte no tenías nada que perder';
		if (ladronSrc) {
			const img = el('img', 'tirada-diablillo');
			img.src = ladronSrc;
			img.alt = '';
			acciones.replaceChildren(img, boton('Vale…', () => dialogo.close(), true));
		} else {
			acciones.replaceChildren(boton('Vale…', () => dialogo.close(), true));
		}
	}
}
