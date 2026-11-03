# Trio Feliz 2.0 🎂

Web de la fiesta de cumpleaños que celebramos entre tres amigos. Sirve para dar la información de la fiesta y para que los invitados participen: confirmar asistencia, elegir en el "estanco" y proponer canciones.

> Estado: **en desarrollo**. Setup de Astro hecho; siguiente paso, diseño base y esquema de base de datos. 4ª edición (la 3ª fue el prototipo en Next.js: `AlejandroNG12/birthday_web`).

---

## Stack

| Pieza | Elección | Por qué |
|---|---|---|
| Frontend | Astro + Tailwind | Lo conocemos y es rápido para una web casi estática |
| Datos | Supabase (Postgres + RLS) | Los invitados escriben sin crear cuenta |
| Código | GitHub (organización propia) | Trabajamos dos personas en paralelo |
| Hosting | Vercel o Netlify | Gratis y con preview automática en cada PR |

¿Por qué no un artifact de claude.ai? Para escribir, cada invitado necesitaría una cuenta de claude.ai y una invitación. Con muchos invitados, la parte interactiva se quedaría vacía.

---

## Secciones

Estética general: **rótulo de estanco** (granate `#742434` y amarillo `#f0bc44`, letra ancha en mayúsculas). Guía de estilo en `/diseno`.

**Móvil primero**: casi todos entrarán desde el enlace de WhatsApp. En móvil la navegación es una **barra de pestañas abajo** (Inicio, Gente, Estanco, Música y "Más"); desde 1024 px, enlaces arriba.

### 0. Registro — `/registro`
- **Sin registrarse no se ve nada**: cualquier página manda a `/registro`.
- Pasos: **código de la fiesta (PIN)** → buscar tu nombre → rellenar apodo, frase, asistencia, acompañantes y alergias → **se revela tu cromo** (con la foto que pusimos nosotros) → entrar.
- El PIN va en el mensaje de WhatsApp. Si el enlace es `/registro?pin=XXXX`, se rellena solo. Sirve para que un desconocido que vea la URL no pueda registrarse.
- Cada nombre solo se puede registrar una vez. El registro devuelve una **clave de sesión** que se guarda en el móvil.
- Si alguien cambia de móvil o se registró otro por él: lo reseteamos desde el panel de Supabase y vuelve a registrarse.

**Cada sección tiene su propia página.** La home reúne portada, el trío, las "ventanas" a cada sección y la asistencia.

### 1. Inicio — `/`
- Lo primero que se ve: **contador hasta el día** con una foto nuestra (presentada como cajetilla de tabaco). Hora fija `Europe/Madrid`; al llegar a cero: "¡Es hoy!". Saluda al invitado por su nombre.
- Botones "Al calendario" (`/fiesta.ics`, con aviso el día antes) y "Cómo llegar".
- **El día de la fiesta** (desde la hora de llegada) el botón principal pasa a "Sube tus fotos". En pruebas: `/?fiesta=hoy`.
- **El trío**: los tres cumpleañeros como cajetillas; al tocar se abre su ficha (bio, aficiones).
- **Ventanas** a cada sección. **Participantes** va la primera y en grande, con el progreso del álbum.
- **Asistencia**, centrada al final: se rellena en el registro y aquí se ve y se **cambia** (si viene, acompañantes, alergias).

### 2. Participantes — `/participantes`
- **La sección principal.** Nosotros metemos a cada invitado con su foto antes de mandar el enlace. Su cromo está oculto hasta que se registra; entonces se activa con el apodo y la frase que elija.
- Rejilla de cromos con vista ampliada, estilo "selecciona tu luchador" (inspirado en infolavelada.com). Los no registrados salen boca abajo ("Nº 14 · ?"). Los tres cumpleañeros son cromos de "Edición especial".
- Los invitados no suben ni cambian la foto del cromo.

### 3. Estanco — `/estanco`
- La broma: uno de los tres tiene un estanco.
- **Productos reales** de estanco con precio (sobre todo tabaco: cajetillas, liar, puros, accesorios). El estanquero lleva las reservas a la fiesta.
- Cada invitado reserva **los que quiera, máximo 2 de cada producto**. Cada producto muestra cuántas unidades se han reservado entre todos.
- **No hay pago online**: se paga en la fiesta. Los precios son orientativos.
- **Cierre de reservas** en `fiesta.json` (`estanco.cierreReservas`): después no se puede reservar ni cambiar. En pruebas: `/estanco?estanco=cerrado`.
- Los productos van **en el código** (`src/data/estanco.json`); en la base de datos solo las reservas.

### 4. Canciones — `/canciones`
- Lista colaborativa de Spotify incrustada y formulario de propuestas (máximo 4 por invitado).
- Integración con la API de Spotify: aplazada.

### 5. Juegos — `/juegos`
- Los invitados proponen juegos para la fiesta y ven los de los demás.

### 6. Fotos — `/fotos`
- Los invitados suben fotos durante una ventana de fechas; galería con las visibles.

---

## Identidad: registro por nombre y clave de sesión

1. Nosotros cargamos la lista de invitados (nombre + foto) desde un CSV en `private/` con `scripts/generar-invitados.mjs` (no se sube al repo). Las fotos se suben a mano al bucket `cromos` desde el panel.
2. En `/registro` el invitado mete el PIN de la fiesta (`comprobar_pin`) y busca su nombre (`buscar_invitados(pin, texto)`, mínimo 2 letras, máx. 10 resultados; solo nombre y si ya está registrado). **El PIN real es un secreto de Supabase, nunca va en el repo.**
3. `registrar(pin, ...)` guarda apodo, frase y asistencia, marca `registrado_en` y devuelve una **clave de sesión** aleatoria. En la base de datos solo se guarda su hash. Falla si ese nombre ya estaba registrado.
4. El navegador guarda la clave en `localStorage` y la manda en todas las RPC. Sin clave válida, ninguna devuelve datos.

Reglas:
- **Las tablas tienen RLS y ninguna política para `anon`**: el navegador no lee ni escribe tablas directamente. Todo pasa por funciones RPC `security definer`:
  - Públicas (todas con PIN): `comprobar_pin(pin)`, `buscar_invitados(pin, texto)`, `registrar(pin, invitado_id, apodo, frase, asiste, acompanantes, alergias)`.
  - Con clave: `get_invitado`, `confirmar_asistencia`, `estado_estanco`, `reservar` (0 = quitar), `listar_cromos`, `proponer_juego`, `listar_juegos`, `proponer_cancion`.
- **Fotos de cromos**: bucket con nombres de archivo aleatorios (uuid). `listar_cromos` solo devuelve las de registrados, y solo a quien tiene clave.
- **Fotos de la fiesta**: subida con la Edge Function `subir-foto`, que valida la clave y devuelve una URL de subida firmada. La `service_role` solo vive en la función.
- **Limitación conocida**: el contenido fijo de la web (textos, lugar) va en el HTML; la pantalla de registro lo tapa, pero no es secreto. Los datos de invitados sí lo son: solo llegan por RPC con clave.
- **Consultar datos**: desde el panel de Supabase, con vistas SQL (`v_asistentes`, `v_alergias`, `v_estanco_totales`, `v_canciones`) exportables a CSV. No hay página de admin.

---

## Contenido que ponemos nosotros

- **Fotos de los invitados** (bucket `cromos`): **cuadradas, con la cara centrada** y de al menos 600×600 px. El álbum las recorta en cuadrado y en 3:4.
- **Datos de la fiesta** en `src/data/fiesta.json`: fecha, llegada, fin, lugar, enlace de Spotify y ventana de fotos. De ahí salen el contador, el calendario (`/fiesta.ics`) y "Cómo llegar".
- **Imagen de vista previa de WhatsApp** (`public/og.jpg`, 1200×630): se genera desde la página `/og-imagen`. Si cambia la fecha, abrir esa página con la ventana a 1200×630, capturarla y guardarla como `public/og.jpg`.
- **Iconos** (`public/favicon.svg`, `public/iconos/`, `apple-touch-icon.png`) y `manifest.webmanifest`: permiten "Añadir a pantalla de inicio".

---

## Modelo de datos

```
invitados             id uuid PK, numero (orden en el álbum), nombre, foto_path, especial,
                      apodo, frase, registrado_en, sesion_hash, visible
confirmaciones        invitado_id UNIQUE, asiste, acompanantes, alergias, updated_at
reservas_estanco      invitado_id, producto (slug del JSON, con CHECK), cantidad (1–2), updated_at
                      UNIQUE (invitado_id, producto)
juegos                id, invitado_id, titulo, reglas, min_jugadores, max_jugadores, created_at
canciones             id, invitado_id, titulo, artista, created_at
fotos_fiesta          id, invitado_id, path, visible, created_at
```

RLS activado en **todas** las tablas desde la migración que las crea.

---

## Estructura de carpetas

```
src/
  assets/        ← fotos (optimizadas con astro:assets)
  components/
    common/      ← diseño base compartido
    landing/
    rsvp/
    registro/
    trio/
    cromos/
    estanco/
    spotify/
    juegos/
    fotos/
  data/
    fiesta.json  ← fecha, hora, lugar, ventana de fotos
    trio.json    ← los tres cumpleañeros (cromos especiales de ejemplo)
    estanco.json ← los 4–5 productos
  layouts/
  lib/           ← cliente de Supabase y sesión del invitado
  pages/         ← una por sección: index, registro, participantes,
                   estanco, canciones, juegos, fotos
scripts/
supabase/
  migrations/
  functions/
private/         ← (ignorado) CSV de invitados
.env.example
```

---

## Hoja de ruta

| Fase | Qué |
|---|---|
| 0 | Limpieza, decisiones pendientes, contenido, Vercel con previews |
| 1 | En paralelo: diseño base (`feat/diseno-base`) y esquema de BD (`db/esquema-inicial`) |
| 2 | Inicio (con asistencia y trío), participantes (cromos), estanco |
| 3 | Canciones, juegos, fotos (+ `db/subir-foto`) |
| 4 | Lanzamiento: `db push`, cargar invitados y fotos, mandar el enlace |

---

## Puesta en marcha (cuando exista el código)
## Puesta en marcha

Necesita Node 22.23.4 o superior (`nvm use` lee la versión de `.nvmrc`).

```bash
git clone <repo>
cd web-trio-cumple
npm install
cp .env.example .env      # rellenar con las claves de Supabase local
supabase start            # necesita Docker
npm run dev
npm run check            # tipos y errores de Astro (también se ejecuta en `npm run build`)
npx vercel login          # con la cuenta compartida, no la personal
npx vercel link           # proyecto web-trio-cumple (solo la primera vez)
npx vercel env pull       # crea .env.local con la URL y la clave anon de trio-dev
npm run dev               # http://localhost:4321
```

Las variables viven en Vercel: **Development** y **Preview** apuntan a `trio-dev`; **Production**, al proyecto de producción. Si cambia alguna, basta con repetir `npx vercel env pull`.

La forma de trabajar entre los dos está en [`CLAUDE.md`](./CLAUDE.md).

---

## Ideas

Propuestas sin decidir ni asignar. Cuando una se apruebe, pasa a su sección y tiene su issue.

Referencia visual de las dos: [infolavelada.com](https://www.infolavelada.com/). Tomamos la idea, no el diseño.

### Presentación de los tres cumpleañeros
- Los tres aparecen juntos, como en un cartel de combate.
- Al pasar el ratón por uno, su foto aparece en grande con una pequeña animación (zoom, fundido o entrada lateral).
- En móvil no hay hover: haría falta un toque o que se vayan alternando solos.
- Necesita una foto de cada uno, a ser posible con fondo recortado (PNG).
- Encaja en la **landing**, junto al contador.

### Lista de invitados confirmados
- Cuando un invitado confirma asistencia, aparece en un listado con su imagen, como las fichas de luchadores de un cartel.
- Por decidir:
  - **De dónde sale la imagen**: que la suba el invitado (Supabase Storage) o un avatar generado (iniciales, ilustración).
  - **Privacidad**: es una lista pública con nombres y caras. Va ligada a la decisión del `noindex` y, si se puede, a que solo la vea quien tenga código.
- Encaja en **confirmar asistencia**. Afecta al modelo de datos (campo de imagen en `invitados`).

---

## Decisiones pendientes

- [x] **Identidad**: registro buscando el nombre + clave de sesión en el móvil
- [x] **Spotify**: lista colaborativa incrustada + propuestas (API aplazada)
- [x] **Estética**: retro, estanco vintage
- [x] **Admin**: panel de Supabase con vistas SQL
- [ ] **Estanco**: confirmar la fecha de cierre de reservas y revisar precios con el estanquero.
- [ ] **Repo**: ¿público (protección de `main` gratis, pero contenido visible) o privado (protección por acuerdo)?
- [ ] **Reparto**: quién hace el diseño base y qué secciones lleva cada uno
- [ ] **Contenido**: fecha, hora, lugar, foto nueva, productos del estanco. Quién lo aporta (el tercer cumpleañero)
- [ ] **Privacidad**: `noindex` en toda la web. ¿Dirección solo por RPC con clave?
- [x] **PIN de la fiesta** antes de buscar nombres. Pendiente: elegir el PIN real.
