# OpoTest

Aplicación local y gratuita para generar exámenes tipo test a partir del temario de una oposición guardado en PDF. No usa ninguna IA de pago ni API key: las preguntas se generan con un motor propio que extrae huecos rellenables (fechas, números, artículos, términos clave) directamente del texto del temario.

## Características

- Lee automáticamente la carpeta `Temario/`, organizada por bloques y temas, y detecta los PDF de cada tema.
- Genera exámenes tipo test de **una sola pregunta correcta entre 4 opciones**, tanto:
  - **por tema** (examen centrado en un tema concreto), como
  - **globales** (preguntas repartidas entre todos los temas que ya tienen contenido).
- Dificultad configurable (**fácil / media / difícil**), que cambia cómo de parecidos son los distractores a la respuesta correcta.
- Número de preguntas configurable (por defecto 21).
- Corrección final con las preguntas falladas y su respuesta correcta.
- Pestaña **Estadísticas**: progresión del % de acierto examen a examen, desglose de aciertos/fallos por tema y el historial completo con fecha y hora de cada intento (guardado en el navegador).
- 100% local: no hace falta clave de API, cuenta ni conexión a internet para generar preguntas.

## Requisitos

- [Node.js](https://nodejs.org/) 18 o superior.

## Instalación y arranque

```bash
npm install
npm start
```

Abre [http://localhost:3000](http://localhost:3000) en el navegador. El propio servidor sirve la interfaz, así que no hace falta abrir ningún archivo HTML manualmente.

### Arranque rápido en Windows

Tras el `npm install` inicial, puedes arrancar la app sin usar la terminal haciendo doble clic en **`Arrancar OpoTest.bat`** (o en el acceso directo "OpoTest" que se puede crear en el Escritorio apuntando a ese archivo). Abre el servidor en una ventana de consola y lanza el navegador automáticamente en `http://localhost:3000`.

## Cómo añadir temario

Coloca los PDF de cada tema dentro de `Temario/<Nombre del Bloque>/<Nombre del Tema>/`, por ejemplo:

```
Temario/
  Bloque I - Organización del Estado y Administración Electrónica/
    Tema 1 - La Constitución Española de 1978/
      Contenido.pdf
      Legislación.pdf
```

Cada carpeta de tema puede contener uno o varios PDF; todos se leen y se combinan como fuente de preguntas para ese tema. Tras añadir o modificar PDF, pulsa **"↻ Actualizar temario"** en la barra lateral para que la app los detecte sin reiniciar el servidor.

## Estructura del proyecto

| Archivo | Función |
|---|---|
| `server.js` | Backend Express: escanea `Temario/`, extrae texto de los PDF (con caché) y expone la API. |
| `generador.js` | Motor de generación de preguntas sin IA (detección de huecos y distractores). |
| `index.html` / `app.js` | Interfaz de usuario: pestañas de Examen y Estadísticas, configuración del examen, quiz, corrección y gráficos de progresión. |
| `Temario/` | Carpeta con el contenido de la oposición en PDF, organizada por bloques y temas (no se sube al repositorio, ver `.gitignore`). |
| `Arrancar OpoTest.bat` | Lanzador para Windows: arranca el servidor y abre el navegador con un doble clic. |
| `opositest.html` | Prototipo original pensado para ejecutarse dentro del visor de artefactos de claude.ai; se mantiene como referencia y no lo usa la app actual. |

## API interna

- `GET /api/temario` — devuelve la lista de bloques/temas detectados y cuántos PDF tiene cada uno.
- `POST /api/examenes/generar` — genera un examen. Body:
  ```json
  {
    "modo": "tema" | "global",
    "temaIds": ["Bloque I - .../Tema 1 - ..."],
    "dificultad": "facil" | "media" | "dificil",
    "numPreguntas": 21
  }
  ```

## Datos y privacidad

El historial de exámenes (fecha, ámbito, dificultad y aciertos/fallos) se guarda solo en el `localStorage` del navegador que uses, bajo la clave `opotest-historial`. No se envía a ningún servidor externo ni se comparte entre navegadores o dispositivos; si borras los datos del sitio o cambias de navegador, empiezas de cero. Desde la pestaña **Estadísticas** puedes borrarlo en cualquier momento con el botón "Borrar historial".

## Aviso sobre la calidad de las preguntas

Al no usar ningún modelo de lenguaje, las preguntas se generan con heurísticas de texto (mayúsculas, números, frases) en vez de ser redactadas por un preparador. La mayoría salen bien, pero ocasionalmente puede aparecer alguna pregunta o distractor un poco torpe si el PDF de origen tiene un formato irregular (listas, tablas, encabezados). Es la contrapartida de que la generación sea instantánea, gratuita y funcione sin conexión.
