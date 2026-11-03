// Contrato con la base de datos (tareas de B). Si cambia algo aquí, avisar a quien lleve `supabase/`.

// Un cromo activado: invitado ya registrado.
export interface Cromo {
	id: string;
	/** Número fijo en el álbum, lo asignan los organizadores al cargar invitados */
	numero: number;
	nombre: string;
	apodo: string;
	frase: string | null;
	/** URL de la foto que subieron los organizadores, o null si no hay */
	foto: string | null;
	/** Los tres cumpleañeros: cromo brillante */
	especial?: boolean;
}

// Lo que devuelve la RPC `listar_cromos(clave)`: solo los registrados, más el total de invitados
// para pintar los huecos (cromos boca abajo) del resto de números.
export interface Album {
	cromos: Cromo[];
	total: number;
}
