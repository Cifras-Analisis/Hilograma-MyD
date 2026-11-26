# Créditos / Credits

## Obra original / Original work

**Hilograma MyD** es una versión propia basada en
**[StringArtGenerator](https://github.com/halfmonty/StringArtGenerator)** de **halfmonty**,
el repositorio de generación de hilogramas (string art) con más estrellas en GitHub
(586 estrellas al momento de crear este proyecto, noviembre de 2026).

*Hilograma MyD is its own version based on **StringArtGenerator** by **halfmonty**, the most-starred
string art repository on GitHub at the time this project was created.*

- Copyright (c) 2019 halfmonty — licencia MIT. El texto completo de la licencia original está en
  [`LICENSES/StringArtGenerator-MIT.txt`](LICENSES/StringArtGenerator-MIT.txt).
- El proyecto original, a su vez, se basa en el trabajo del usuario de Reddit **/u/kmmeerts**:
  <https://www.reddit.com/r/DIY/comments/au0ilz/made_a_string_art_portrait_out_of_a_continuous_2/>

### Qué se tomó del original / What was taken from the original

| Original (`indexold.html`) | En Hilograma MyD |
|---|---|
| Algoritmo voraz: desde el clavo actual elige la línea con mayor "error" acumulado y le resta el peso de línea | `js/engine.js` → `generate()`, `lineScore()`, `lineApply()` (misma lógica, reescrita sin OpenCV ni numjs) |
| Posición de los clavos en círculo (clavo 0 a la derecha, sentido horario) | `pinCoords()` — idéntica |
| Recorte cuadrado centrado, escala de grises por promedio RGB | `drawCrop()` + caso exacto negro sobre blanco en `decompose()` |
| Opciones: número de clavos (288), número de líneas (4000), peso de línea (20), distancia mínima (20), 20 clavos recientes, 500 px | Pestañas *Hilo*, *Medidas* y *Avanzado*; botón "Restaurar valores originales" |
| "Already have steps generated?" + pegar números | Pantalla *Ya tengo los números* |
| Ejemplos 1, 2 y 3 | `js/examples.js` (secuencias copiadas sin cambios) |
| "Start Creating" (paso a paso, teclas espacio / → / ←) | Manual paso a paso (`js/manual.js`) con las mismas teclas |
| "Just Draw" | Botón *Solo dibujar* |
| Longitud del hilo (`thread_length`, calculada pero no mostrada) | Metros por color en cm/m, con clavos, amarres y margen |

### Qué es nuevo / What is new

Edición directa sobre la imagen con vista previa de grosor y opacidad del hilo, multicolor con
cambios de color guiados, metros por color, plantilla de clavos a escala real, guardado del avance
(almacenamiento local y respaldos en Descargas), modo sorpresa, cifrado AES-256-GCM, español/inglés,
PWA instalable sin conexión y estética "hacker".

## Tipografía / Typeface

- **«Present»** — de **NJ Studio** (diseño: Siti Nurjanah), Copyright © 2022 NJ Studio, *All Rights Reserved*.
  La fuente **no** está cubierta por la licencia MIT de este proyecto. Consulta la licencia de NJ Studio
  antes de redistribuirla o usarla comercialmente. Si el archivo `fonts/Present.ttf` no está presente,
  la app usa automáticamente una fuente del sistema.
- *The «Present» typeface by NJ Studio is **not** covered by this project's MIT license. Check NJ Studio's
  license before redistributing it or using it commercially. Without `fonts/Present.ttf` the app falls back
  to a system font.*

## Sin dependencias / No dependencies

Hilograma MyD no usa bibliotecas de terceros en tiempo de ejecución (el original usaba OpenCV.js,
numjs, jQuery, Popper y Bootstrap desde CDN). Todo el código está en este repositorio.
