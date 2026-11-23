// Lo que la rana le dice a cada invitado (ver supabase/migrations/…_rana.sql). Lo escriben los organizadores en /admin.
import { rpcConClave } from '../../lib/rpc';

export interface MensajeRana {
	id: number;
	/** Con `{nombre}` ya cambiado por el de quien lo lee */
	texto: string;
	pose: string;
}

/** Los mensajes que le tocan y aún no ha cerrado, por orden */
export const escucharRana = () => rpcConClave<MensajeRana[]>('escuchar_rana');

/** Ha cerrado un mensaje: no le vuelve a salir */
export const ranaVista = (mensaje: number) => rpcConClave<void>('rana_vista', { mensaje });
