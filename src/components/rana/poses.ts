// Poses con las que la rana dice los mensajes de los organizadores. Los id son los del CHECK de
// `rana_mensajes.pose` (supabase/migrations/…_rana.sql).
import saluda from '../../assets/mascota/saluda.png';
import prisa from '../../assets/mascota/reloj.png';
import diablillo from '../../assets/mascota/ladron.png';
import fiesta from '../../assets/mascota/si_rsvp.png';
import triste from '../../assets/mascota/no_rsvp.png';

export const POSES = [
	{ id: 'saluda', texto: 'Normal', imagen: saluda },
	{ id: 'prisa', texto: 'Prisa', imagen: prisa },
	{ id: 'diablillo', texto: 'Diablillo', imagen: diablillo },
	{ id: 'fiesta', texto: 'De fiesta', imagen: fiesta },
	{ id: 'triste', texto: 'Dolida', imagen: triste },
] as const;
