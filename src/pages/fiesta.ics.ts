import type { APIRoute } from 'astro';
import fiesta from '../data/fiesta.json';

// Evento para "Añadir al calendario": empieza a la hora de llegada y avisa el día antes.

// "2027-02-27T19:30:00+01:00" + "16:00" → mismo día y zona, a la hora de llegada
const llegada = `${fiesta.inicio.slice(0, 11)}${fiesta.llegada}:00${fiesta.inicio.slice(19)}`;

const utc = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const escapar = (texto: string) => texto.replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');

export const GET: APIRoute = ({ site, url: peticion }) => {
	const url = new URL('/', site ?? peticion).href;
	const lineas = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//Trio Feliz//Fiesta//ES',
		'CALSCALE:GREGORIAN',
		'METHOD:PUBLISH',
		'BEGIN:VEVENT',
		`UID:trio-feliz-${fiesta.edicion}@trio-feliz`,
		`DTSTAMP:${utc(new Date().toISOString())}`,
		`DTSTART:${utc(llegada)}`,
		`DTEND:${utc(fiesta.fin)}`,
		`SUMMARY:${escapar(`Trio Feliz · ${fiesta.edicion}ª edición`)}`,
		`LOCATION:${escapar(fiesta.lugar.nombre)}`,
		`DESCRIPTION:${escapar(`Llegada desde las ${fiesta.llegada}. Toda la info en ${url}`)}`,
		`URL:${url}`,
		'BEGIN:VALARM',
		'TRIGGER:-P1D',
		'ACTION:DISPLAY',
		`DESCRIPTION:${escapar('Mañana es el Trio Feliz')}`,
		'END:VALARM',
		'END:VEVENT',
		'END:VCALENDAR',
	];
	return new Response(lineas.join('\r\n') + '\r\n', {
		headers: {
			'Content-Type': 'text/calendar; charset=utf-8',
			'Content-Disposition': 'attachment; filename="trio-feliz.ics"',
		},
	});
};
