// Dibuja la entrada de la fiesta como imagen propia (PNG vertical 1080×1920), con un <canvas>.
// No es una captura de la web: tiene su propio diseño (cielo de noche, entrada con muescas,
// charca con la rana y su bocadillo). Sin librerías externas.
export interface DatosEntrada {
	nombre: string;
	fecha: string;
	llegada: string;
	lugar: string;
	contigo: string;
	alergias: string;
	numero: string;
	edicion: number;
	/** URL de la imagen de la rana (mismo origen, para que el canvas no quede "contaminado") */
	rana: string;
}

const W = 1080;
const H = 1920;
const FUENTE = '"Archivo Variable", system-ui, "Segoe UI", sans-serif';

const BOSQUE = '#0e2a1f';
const HOJA = '#1d6b45';
const LIMA = '#c6f26b';
const CREMA = '#fff4d6';
const FLOR = '#ff7fa8';

type Ctx = CanvasRenderingContext2D;

/** Números pseudoaleatorios repetibles: la misma entrada sale siempre igual */
function aleatorio(semilla: number) {
	let s = semilla || 1;
	return () => {
		s = (s * 16807) % 2147483647;
		return s / 2147483647;
	};
}

function fuente(ctx: Ctx, peso: number, px: number) {
	ctx.font = `${peso} ${px}px ${FUENTE}`;
}

function espaciado(ctx: Ctx, px: number) {
	// Propiedad nueva: si el navegador no la tiene, el texto sale sin separar
	(ctx as unknown as { letterSpacing: string }).letterSpacing = `${px}px`;
}

/** Texto que cabe en `ancho`: primero se encoge y, si aun así no cabe, se recorta con «…» */
function ajustar(ctx: Ctx, texto: string, peso: number, px: number, minPx: number, ancho: number) {
	let t = texto;
	let p = px;
	fuente(ctx, peso, p);
	while (ctx.measureText(t).width > ancho && p > minPx) fuente(ctx, peso, --p);
	while (ctx.measureText(t).width > ancho && t.length > 1) t = t.slice(0, -2).trimEnd() + '…';
	return t;
}

function lineas(ctx: Ctx, texto: string, ancho: number) {
	const salida: string[] = [];
	let actual = '';
	for (const palabra of texto.split(' ')) {
		const prueba = actual ? `${actual} ${palabra}` : palabra;
		if (ctx.measureText(prueba).width > ancho && actual) {
			salida.push(actual);
			actual = palabra;
		} else actual = prueba;
	}
	if (actual) salida.push(actual);
	return salida;
}

function rectRedondo(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
	ctx.beginPath();
	ctx.roundRect(x, y, w, h, r);
}

// ---------- Fondo ----------
function fondo(ctx: Ctx) {
	const cielo = ctx.createLinearGradient(0, 0, 0, 1500);
	cielo.addColorStop(0, '#060c24');
	cielo.addColorStop(0.55, '#1b1a55');
	cielo.addColorStop(1, '#2c3b6e');
	ctx.fillStyle = cielo;
	ctx.fillRect(0, 0, W, H);

	// Estrellas
	const rnd = aleatorio(7);
	for (let i = 0; i < 90; i++) {
		const x = rnd() * W;
		const y = rnd() * 1250;
		ctx.globalAlpha = 0.25 + rnd() * 0.65;
		ctx.fillStyle = '#fff';
		ctx.beginPath();
		ctx.arc(x, y, 1 + rnd() * 2.2, 0, Math.PI * 2);
		ctx.fill();
	}
	ctx.globalAlpha = 1;

	// Luna
	ctx.save();
	ctx.shadowColor = 'rgba(210,220,255,0.55)';
	ctx.shadowBlur = 70;
	ctx.fillStyle = '#f3f1e6';
	ctx.beginPath();
	ctx.arc(900, 110, 56, 0, Math.PI * 2);
	ctx.fill();
	ctx.restore();

	// Colinas
	ctx.fillStyle = 'rgba(58,125,90,0.6)';
	ctx.beginPath();
	ctx.moveTo(0, 1560);
	ctx.bezierCurveTo(140, 1420, 260, 1400, 420, 1480);
	ctx.bezierCurveTo(560, 1550, 700, 1380, 860, 1420);
	ctx.bezierCurveTo(960, 1445, 1030, 1470, 1080, 1430);
	ctx.lineTo(1080, 1600);
	ctx.lineTo(0, 1600);
	ctx.fill();
	ctx.fillStyle = '#1e5a3d';
	ctx.beginPath();
	ctx.moveTo(0, 1600);
	ctx.bezierCurveTo(160, 1500, 300, 1560, 480, 1520);
	ctx.bezierCurveTo(660, 1480, 780, 1570, 940, 1520);
	ctx.bezierCurveTo(1010, 1498, 1050, 1510, 1080, 1506);
	ctx.lineTo(1080, 1640);
	ctx.lineTo(0, 1640);
	ctx.fill();

	// Agua
	const agua = ctx.createLinearGradient(0, 1580, 0, H);
	agua.addColorStop(0, '#1aa497');
	agua.addColorStop(0.38, '#0d6c6a');
	agua.addColorStop(1, '#06353a');
	ctx.fillStyle = agua;
	ctx.fillRect(0, 1580, W, H - 1580);
	ctx.fillStyle = 'rgba(255,255,255,0.35)';
	ctx.fillRect(0, 1578, W, 3);
	ctx.fillStyle = 'rgba(255,255,255,0.1)';
	for (let y = 1612; y < H; y += 30) ctx.fillRect(0, y, W, 3);

	// Luciérnagas
	const luz = aleatorio(21);
	for (let i = 0; i < 16; i++) {
		const x = luz() * W;
		const y = 120 + luz() * 1300;
		ctx.save();
		ctx.shadowColor = 'rgba(214,255,110,0.9)';
		ctx.shadowBlur = 22;
		ctx.fillStyle = '#e9ff9a';
		ctx.globalAlpha = 0.5 + luz() * 0.5;
		ctx.beginPath();
		ctx.arc(x, y, 5 + luz() * 3, 0, Math.PI * 2);
		ctx.fill();
		ctx.restore();
	}
}

// ---------- La entrada ----------
const TX = 90;
const TY = 190;
const TW = 900;
const TH = 1150;
const PERFORACION = 1200; // y de la línea de corte
const MUESCA = 40;

function formaEntrada(ctx: Ctx) {
	const r = 44;
	const x2 = TX + TW;
	const y2 = TY + TH;
	ctx.beginPath();
	ctx.moveTo(TX + r, TY);
	ctx.lineTo(x2 - r, TY);
	ctx.arcTo(x2, TY, x2, TY + r, r);
	ctx.lineTo(x2, PERFORACION - MUESCA);
	ctx.arc(x2, PERFORACION, MUESCA, -Math.PI / 2, Math.PI / 2, true);
	ctx.lineTo(x2, y2 - r);
	ctx.arcTo(x2, y2, x2 - r, y2, r);
	ctx.lineTo(TX + r, y2);
	ctx.arcTo(TX, y2, TX, y2 - r, r);
	ctx.lineTo(TX, PERFORACION + MUESCA);
	ctx.arc(TX, PERFORACION, MUESCA, Math.PI / 2, -Math.PI / 2, true);
	ctx.lineTo(TX, TY + r);
	ctx.arcTo(TX, TY, TX + r, TY, r);
	ctx.closePath();
}

function entrada(ctx: Ctx, d: DatosEntrada) {
	// Sombra "de chapa" (sólida, como los botones de la web)
	ctx.save();
	ctx.translate(0, 14);
	formaEntrada(ctx);
	ctx.fillStyle = 'rgba(0,0,0,0.38)';
	ctx.fill();
	ctx.restore();

	// Papel
	formaEntrada(ctx);
	ctx.fillStyle = CREMA;
	ctx.fill();
	ctx.save();
	formaEntrada(ctx);
	ctx.clip();
	const brillo = ctx.createLinearGradient(TX, TY, TX + 520, TY + 520);
	brillo.addColorStop(0, 'rgba(198,242,107,0.5)');
	brillo.addColorStop(1, 'rgba(198,242,107,0)');
	ctx.fillStyle = brillo;
	ctx.fillRect(TX, TY, TW, TH);
	// Franja de color arriba
	ctx.fillStyle = BOSQUE;
	ctx.fillRect(TX, TY, TW, 22);
	ctx.restore();

	const izq = TX + 70;
	const der = TX + TW - 70;
	ctx.textBaseline = 'alphabetic';

	// Marca
	ctx.fillStyle = HOJA;
	fuente(ctx, 900, 28);
	espaciado(ctx, 6);
	ctx.textAlign = 'left';
	ctx.fillText(`TRIO FELIZ · ${d.edicion}ª EDICIÓN`, izq, TY + 100);

	// Título
	espaciado(ctx, -6);
	fuente(ctx, 900, 190);
	ctx.fillStyle = LIMA;
	ctx.fillText('Trioland', izq + 6, TY + 290 + 8);
	ctx.fillStyle = BOSQUE;
	ctx.fillText('Trioland', izq, TY + 290);
	espaciado(ctx, 0);

	// Nombre
	ctx.fillStyle = '#b3204f';
	const nombre = ajustar(ctx, d.nombre, 900, 66, 36, der - izq);
	ctx.fillText(nombre, izq, TY + 390);

	// Datos
	const filas: [string, string][] = [
		['CUÁNDO', d.fecha],
		['LLEGADA', `Desde las ${d.llegada}`],
		['DÓNDE', d.lugar],
		['CONTIGO', d.contigo],
		['ALERGIAS', d.alergias],
	];
	let y = TY + 500;
	for (const [etiqueta, valor] of filas) {
		fuente(ctx, 900, 24);
		espaciado(ctx, 5);
		ctx.fillStyle = HOJA;
		ctx.textAlign = 'left';
		ctx.fillText(etiqueta, izq, y);
		const anchoEtiqueta = ctx.measureText(etiqueta).width;
		espaciado(ctx, 0);

		ctx.fillStyle = BOSQUE;
		ctx.textAlign = 'right';
		const texto = ajustar(ctx, valor, 800, 38, 24, der - izq - anchoEtiqueta - 30);
		ctx.fillText(texto, der, y + 2);

		ctx.strokeStyle = 'rgba(14,42,31,0.3)';
		ctx.lineWidth = 3;
		ctx.setLineDash([2, 9]);
		ctx.lineCap = 'round';
		ctx.beginPath();
		ctx.moveTo(izq, y + 24);
		ctx.lineTo(der, y + 24);
		ctx.stroke();
		ctx.setLineDash([]);
		y += 100;
	}

	// Línea de corte
	ctx.strokeStyle = 'rgba(14,42,31,0.45)';
	ctx.lineWidth = 4;
	ctx.setLineDash([16, 14]);
	ctx.beginPath();
	ctx.moveTo(TX + MUESCA + 12, PERFORACION);
	ctx.lineTo(TX + TW - MUESCA - 12, PERFORACION);
	ctx.stroke();
	ctx.setLineDash([]);

	// Talón: código de barras + número
	const rnd = aleatorio(Number(d.numero) || 1);
	ctx.fillStyle = BOSQUE;
	let x = izq;
	while (x < izq + 450) {
		const ancho = 3 + Math.floor(rnd() * 3) * 3;
		ctx.fillRect(x, PERFORACION + 50, ancho, 78);
		x += ancho + 3 + Math.floor(rnd() * 3) * 3;
	}
	ctx.textAlign = 'right';
	fuente(ctx, 900, 44);
	espaciado(ctx, 3);
	ctx.fillText(`Nº ${d.numero}`, der, PERFORACION + 108);
	espaciado(ctx, 0);
}

// ---------- Charca, rana y bocadillo ----------
function charca(ctx: Ctx, rana: HTMLImageElement) {
	// Nenúfar
	const cx = 330;
	const cy = 1745;
	ctx.fillStyle = 'rgba(6,40,38,0.6)';
	ctx.beginPath();
	ctx.ellipse(cx, cy + 24, 230, 66, 0, 0, Math.PI * 2);
	ctx.fill();
	const hoja = ctx.createRadialGradient(cx - 40, cy - 10, 20, cx, cy, 240);
	hoja.addColorStop(0, '#4fae5f');
	hoja.addColorStop(1, '#1d6b45');
	ctx.fillStyle = hoja;
	ctx.strokeStyle = '#14502f';
	ctx.lineWidth = 5;
	ctx.beginPath();
	ctx.ellipse(cx, cy, 226, 78, 0, 0, Math.PI * 2);
	ctx.fill();
	ctx.stroke();
	// Flor
	ctx.fillStyle = FLOR;
	ctx.beginPath();
	ctx.arc(cx + 150, cy - 14, 24, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = '#ffcf5c';
	ctx.beginPath();
	ctx.arc(cx + 150, cy - 14, 12, 0, Math.PI * 2);
	ctx.fill();

	// Rana
	const ancho = 330;
	const alto = (rana.naturalHeight / rana.naturalWidth) * ancho;
	ctx.save();
	ctx.shadowColor = 'rgba(0,0,0,0.45)';
	ctx.shadowBlur = 28;
	ctx.shadowOffsetY = 16;
	ctx.drawImage(rana, cx - ancho / 2, cy - alto + 34, ancho, alto);
	ctx.restore();

	// Bocadillo
	const bx = 540;
	const bw = 450;
	const by = 1520;
	const bh = 190;
	ctx.save();
	ctx.translate(0, 8);
	rectRedondo(ctx, bx, by, bw, bh, 40);
	ctx.fillStyle = 'rgba(0,0,0,0.3)';
	ctx.fill();
	ctx.restore();
	rectRedondo(ctx, bx, by, bw, bh, 40);
	ctx.fillStyle = CREMA;
	ctx.fill();
	ctx.lineWidth = 6;
	ctx.strokeStyle = '#0a2217';
	ctx.stroke();
	// Colita hacia la rana
	ctx.beginPath();
	ctx.moveTo(bx + 3, by + bh - 70);
	ctx.lineTo(bx - 34, by + bh - 36);
	ctx.lineTo(bx + 3, by + bh - 30);
	ctx.closePath();
	ctx.fillStyle = CREMA;
	ctx.fill();
	ctx.beginPath();
	ctx.moveTo(bx + 3, by + bh - 70);
	ctx.lineTo(bx - 34, by + bh - 36);
	ctx.lineTo(bx + 3, by + bh - 30);
	ctx.stroke();
	ctx.fillStyle = CREMA;
	ctx.fillRect(bx + 1, by + bh - 66, 7, 32);

	ctx.fillStyle = BOSQUE;
	ctx.textAlign = 'left';
	fuente(ctx, 900, 44);
	const l = lineas(ctx, 'Ya estás dentro. Y no llegues tarde.', bw - 70);
	l.slice(0, 3).forEach((t, i) => ctx.fillText(t, bx + 36, by + 70 + i * 54));
}

function cargarImagen(url: string) {
	return new Promise<HTMLImageElement>((ok, mal) => {
		const img = new Image();
		img.onload = () => ok(img);
		img.onerror = () => mal(new Error('imagen'));
		img.src = url;
	});
}

/** Genera el PNG de la entrada */
export async function crearEntrada(d: DatosEntrada): Promise<Blob> {
	// La letra de la web, cargada antes de pintar (si no, el canvas usaría la de reserva)
	try {
		await Promise.all([800, 900].map((p) => document.fonts.load(`${p} 40px "Archivo Variable"`)));
	} catch {
		// sin fuente: se pinta con la de reserva
	}
	const rana = await cargarImagen(d.rana);

	const lienzo = document.createElement('canvas');
	lienzo.width = W;
	lienzo.height = H;
	const ctx = lienzo.getContext('2d')!;
	fondo(ctx);
	entrada(ctx, d);
	charca(ctx, rana);

	return new Promise((ok, mal) => lienzo.toBlob((b) => (b ? ok(b) : mal(new Error('sin imagen'))), 'image/png'));
}
