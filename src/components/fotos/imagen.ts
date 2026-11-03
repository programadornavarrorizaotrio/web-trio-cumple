// Reduce la foto en el propio móvil antes de subirla: una foto de 8 MB pasa a ~300 KB.
const LADO_MAXIMO = 1600;
const CALIDAD = 0.82;

export async function reducirImagen(archivo: File): Promise<Blob> {
	// imageOrientation: respeta la rotación EXIF de las fotos hechas con el móvil
	const bitmap = await createImageBitmap(archivo, { imageOrientation: 'from-image' });
	const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
	const ancho = Math.round(bitmap.width * escala);
	const alto = Math.round(bitmap.height * escala);

	const lienzo = document.createElement('canvas');
	lienzo.width = ancho;
	lienzo.height = alto;
	lienzo.getContext('2d')!.drawImage(bitmap, 0, 0, ancho, alto);
	bitmap.close();

	return new Promise((resolver, rechazar) =>
		lienzo.toBlob((blob) => (blob ? resolver(blob) : rechazar(new Error('no-se-pudo-reducir'))), 'image/jpeg', CALIDAD),
	);
}
