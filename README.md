# Trio Feliz 2.0 🎂

Web de la fiesta de cumpleaños que celebramos entre tres amigos. Sirve para dar la información de la fiesta y para que los invitados participen: confirmar asistencia, elegir en el "estanco" y proponer canciones.

> Estado: **en planificación**. Todavía no hay código. Las decisiones pendientes están al final.

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

### 1. Landing
- Lo primero que se ve: **contador hasta el día** con una foto nuestra.
- Tiene que ser muy llamativa visualmente.
- Por definir: zona horaria del contador y qué muestra al llegar a cero.

### 2. Confirmar asistencia
- El invitado confirma si viene (y acompañantes, si los hay).

### 3. Estanco digital
- La broma: uno de los tres tiene un estanco.
- **4 o 5 modelos** para que cada invitado diga cuál quiere. Él lo lleva al cumpleaños.
- **No se vende nada por la web.** No hay pagos ni carrito.
- Los productos van **en el código** (JSON o content collection de Astro), no en la base de datos.
- En la base de datos solo se guarda la elección de cada invitado.

### 4. Canciones (Spotify)
- Lista de canciones para ese día.
- Por decidir: lista colaborativa de Spotify incrustada (sin código) o integración con la API (votos, límites por persona). La API exige guardar un token en el servidor y cumplir las condiciones actuales de Spotify para apps nuevas.

---

## Modelo de datos (borrador)

Depende de si usamos código por invitado. Si sí:

```
invitados
  id            uuid  PK
  nombre        text
  codigo        text  UNIQUE        -- va en el enlace: ?i=marta-x7k2

confirmaciones
  invitado_id   uuid  → invitados.id  UNIQUE
  asiste        boolean
  acompanantes  int
  updated_at    timestamptz

selecciones_estanco
  invitado_id   uuid  → invitados.id  UNIQUE   -- una elección por persona
  producto      text                           -- slug del JSON, con CHECK
  updated_at    timestamptz
```

RLS activado en **todas** las tablas desde el primer día.

---

## Estructura de carpetas (propuesta)

```
src/
  components/
    common/      ← diseño base compartido (botón, tarjeta, layout)
    landing/
    rsvp/
    estanco/
    spotify/
  data/
    estanco.json ← los 4–5 productos
  layouts/
  pages/
supabase/
  migrations/
.env.example
```

---

## Puesta en marcha (cuando exista el código)

```bash
git clone <repo>
cd trio-feliz
npm install
cp .env.example .env      # rellenar con las claves de Supabase local
supabase start            # necesita Docker
npm run dev
```

La forma de trabajar entre los dos está en [`CLAUDE.md`](./CLAUDE.md).

---

## Decisiones pendientes

- [ ] **Identidad**: ¿código por invitado o nombre libre? *(bloquea el modelo de datos; decidir primero)*
- [ ] **Spotify**: ¿lista colaborativa incrustada o integración con la API?
- [ ] **Estanco**: ¿se ve lo que eligen los demás? ¿Fecha de cierre de elecciones?
- [ ] **Repo**: ¿público (protección de `main` gratis, pero contenido visible) o privado (protección por acuerdo)?
- [ ] **Reparto**: quién hace el diseño base y qué secciones lleva cada uno
- [ ] **Contenido**: fecha, hora, lugar, foto, estética. Quién lo aporta (el tercer cumpleañero)
- [ ] **Privacidad**: `noindex` en toda la web. ¿Dirección visible solo con código?
