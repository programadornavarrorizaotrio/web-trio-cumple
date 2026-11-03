# CLAUDE.md — Cómo trabajamos en este repo

Este archivo explica cómo trabajamos los dos desarrolladores en el repo, y sirve de contexto para Claude cuando trabaje aquí. El qué es el proyecto está en [`README.md`](./README.md).

**Para Claude:** sigue estas reglas en todo lo que hagas en el repo. Si una tarea choca con alguna, para y pregunta.

---

## Contexto rápido

- Web de una fiesta de cumpleaños, **una página por sección**: inicio (contador, asistencia, accesos y el trío), participantes (álbum de cromos, la principal), estanco (productos reales con precio, reservas de hasta 2 por producto, se paga en la fiesta), canciones, juegos y fotos. Detalle en `README.md`.
- **Móvil primero**: los invitados abren el enlace desde WhatsApp. Las clases base son para móvil (~375px) y `sm:`/`lg:` amplían. Toda PR se revisa primero en el móvil.
- Identidad: registro en `/registro` buscando tu nombre; devuelve una clave de sesión que se guarda en el móvil. Sin registro no se ve nada. El navegador nunca accede a tablas: solo a RPC que validan la clave.
- `private/` (lista de invitados) nunca va al repo.
- Stack: Astro + Tailwind, Supabase, hosting en Vercel/Netlify.
- Dos desarrolladores trabajando en paralelo. El objetivo de estas reglas es **no pisarnos**.
- Idioma: código y nombres en inglés o español, pero el mismo en todo el repo *(pendiente de decidir)*. Commits y PRs en español.

---

## Reglas de ramas

1. **Nunca se hace commit directo en `main`.** Todo entra por Pull Request revisada por el otro.
   - Si el repo es privado con cuenta gratuita, GitHub no puede impedirlo: es un acuerdo entre nosotros.
2. **Una rama por tarea**, con prefijo:
   - `feat/` funcionalidad nueva (`feat/rsvp`, `feat/estanco`)
   - `fix/` arreglo
   - `chore/` configuración, dependencias
   - `db/` migraciones de Supabase
3. **Ramas cortas**: fusionar en uno o dos días. Si una tarea es más larga, partirla.
4. Al fusionar: **Squash and merge** y borrar la rama.

---

## Flujo diario

```bash
# Empezar siempre desde main actualizado
git switch main
git pull

# Crear la rama de la tarea
git switch -c feat/nombre-tarea

# Trabajar con commits pequeños
git add .
git commit -m "seccion: qué cambia"

# Antes de abrir la PR, traer lo que haya fusionado el otro
git fetch
git rebase origin/main          # o: git merge origin/main (ver nota)

# Subir y abrir la PR
git push -u origin feat/nombre-tarea
# tras un rebase hay que forzar, siempre con lease:
git push --force-with-lease
```

**Nota:** `rebase` deja el historial más limpio, pero si uno de los dos no lo domina, usad `merge origin/main`, que perdona más los errores. *(Pendiente de decidir)*

**Nunca** `git push --force` a secas, y nunca forzar sobre `main`.

---

## Pull Requests

- Título: `[sección] qué hace`, por ejemplo `[estanco] listado de productos y selección`.
- La descripción enlaza el issue: `Closes #3`.
- El revisor mira la **preview de Vercel/Netlify**, no solo el diff.
- PRs pequeñas. Si toca más de una sección, probablemente son dos PRs.

---

## Quién toca qué

Cada uno es dueño de sus secciones y trabaja en sus carpetas:

| Carpeta | Responsable |
|---|---|
| `src/components/common/`, `src/layouts/`, `src/styles/` | Jawi (A) — diseño base |
| `src/components/landing/`, `src/data/fiesta.json`, `src/data/trio.json`, `src/assets/` | Jawi (A) |
| `src/components/rsvp/` | *compañero* (B) |
| `src/components/estanco/`, `src/data/estanco.json`, `src/pages/estanco.astro` | *compañero* (B) |
| `src/components/spotify/`, `src/pages/canciones.astro` | Jawi (A) |
| `src/components/trio/` | Jawi (A) |
| `src/components/cromos/`, `src/pages/participantes.astro`, `src/components/registro/`, `src/pages/registro.astro` | Jawi (A) |
| `src/components/juegos/`, `src/pages/juegos.astro` | *compañero* (B) |
| `src/components/fotos/`, `src/pages/fotos.astro` | Jawi (A) |
| `supabase/` (migraciones, seed, funciones), `src/lib/`, `scripts/` | *compañero* (B) — único que toca la BD |

**Archivos compartidos: avisar antes de tocarlos.** Aquí salen casi todos los conflictos:
- `src/layouts/`, `src/components/common/`
- `src/lib/`, `src/data/fiesta.json`, `src/pages/index.astro`
- `tailwind.config.*`, `astro.config.*`
- `package.json`, `package-lock.json`
- `supabase/migrations/`

**El diseño base se fusiona antes de empezar ninguna sección.** Si se hace en paralelo, acabamos con dos estilos distintos.

**Para Claude:** no modifiques archivos de una sección que no sea la de la tarea actual, ni los compartidos, sin decirlo explícitamente.

---

## Conflictos habituales

- **`package-lock.json`**: no resolver a mano. Quedarse con la versión de `main` y ejecutar `npm install`.
- **Conflicto en un archivo compartido**: resolverlo hablando con el otro, no eligiendo "mi versión" sin mirar.

---

## Supabase

- Dos proyectos en Supabase: **`trio-dev`** (desarrollo, compartido por los dos) y el de **producción**. Nadie prueba contra producción.
- Sin Docker: el CLI va en las dependencias del proyecto y se usa con `npx supabase`. Para enlazarte a `trio-dev` (una vez):
  ```bash
  npx supabase login
  npx supabase link --project-ref <ref-de-trio-dev>
  ```
- **Cambios de esquema solo con migraciones**:
  ```bash
  npx supabase migration new nombre_descriptivo
  npx supabase db push          # la aplica en el proyecto enlazado
  ```
  Nunca desde el panel web: esos cambios no quedan en el repo y el otro no se entera.
- **`trio-dev` es compartido**: avisar por el chat antes de hacer `db push` de una migración, porque al otro le cambia la base en ese momento.
- Las migraciones ya fusionadas en `main` **no se editan**. Si hay que corregir algo, se hace con una migración nueva.
- **RLS activado en todas las tablas** desde la migración que las crea. La clave `anon` está en el navegador: sin RLS, cualquiera puede leer o borrar todo.
- **Solo una persona aplica a producción** (`db push` enlazado al proyecto de producción): *(pendiente de decidir quién)*. Antes de cada `db push`, comprobar a qué proyecto estás enlazado.
- Si algún día la base compartida estorba, se puede pasar a Supabase local con Docker (`npx supabase start`) sin cambiar nada más.

---

## Secretos y configuración

- `.env` nunca va al repo (está en `.gitignore`).
- `.env.example` sí va al repo, con las variables pero sin valores reales.
- En el frontend solo la clave `anon` de Supabase. La `service_role` nunca sale del servidor.
- Tokens de Spotify (si se integra la API): solo en Edge Functions de Supabase, nunca en el cliente.

---

## Coordinación

- Un **issue por tarea**, con responsable asignado.
- No usamos tablero de Projects: para dos personas acaba sin actualizarse.
- Antes de empezar algo que toque archivos compartidos, avisar por el chat.

---

## Pendiente de acordar

- [ ] Repo público o privado
- [ ] `rebase` o `merge` para actualizar ramas
- [x] Reparto de carpetas y quién hace el diseño base (A: diseño y secciones visuales; B: datos y formularios)
- [ ] Quién aplica migraciones a producción
- [ ] Idioma del código (inglés o español)
