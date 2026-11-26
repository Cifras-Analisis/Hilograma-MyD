# Seguridad y privacidad / Security and privacy

Las imágenes que se usan para un hilograma suelen ser fotos personales (familia, pareja, mascotas).
Hilograma MyD está diseñado para que **esa imagen nunca salga del dispositivo**.

## Modelo de amenazas / Threat model

| Riesgo | Protección |
|---|---|
| La foto se sube a un servidor | No hay servidor. La app es estática; la CSP pone `connect-src 'none'`, así que el navegador bloquea cualquier petición de red desde la página. |
| La foto queda guardada en el disco | Nunca se escribe: ni en `localStorage`, ni en IndexedDB, ni en la caché del service worker. Solo vive en memoria mientras estás en la pantalla *Crear*; al salir (o al sellar la sorpresa) se borran los píxeles y los lienzos (`canvas.width = 0`, `fill(0)`). |
| Metadatos EXIF (GPS, cámara) | El archivo original se decodifica a píxeles y se descarta; los archivos `.hilo` no contienen la imagen ni sus metadatos. |
| Código inyectado (XSS) | CSP estricta sin `unsafe-inline` ni `unsafe-eval`, solo scripts propios (`script-src 'self'`), **Trusted Types** obligatorios (`require-trusted-types-for 'script'`) y cero uso de `innerHTML`: toda la interfaz se construye con `textContent`/`createElement`. |
| Dependencias comprometidas (cadena de suministro) | Cero bibliotecas de terceros y cero CDNs. Todo el código está en el repositorio. |
| Archivos `.hilo` manipulados o maliciosos | Validación campo por campo (tipos, rangos, tamaños máximos), límite de 8 MB, eliminación de caracteres de control y de control bidireccional (ataques tipo RTLO). Los archivos sin contraseña llevan huella SHA-256; los cifrados usan AES-GCM, que detecta cualquier alteración. |
| Alguien abre el archivo sin permiso | Contraseña opcional: AES-256-GCM con clave derivada por PBKDF2-SHA256 (600 000 iteraciones, sal aleatoria de 16 bytes, IV de 12 bytes por archivo). El proyecto guardado en el dispositivo queda cifrado con la misma contraseña. La contraseña nunca se guarda. |
| Clickjacking | La app se niega a ejecutarse dentro de un `iframe`; en servidores que lo permiten, `_headers` añade `frame-ancestors 'none'` y `X-Frame-Options: DENY`. |
| Fuga por *Referer* | `<meta name="referrer" content="no-referrer">`. |
| La voz envía los números a un servidor | Por defecto solo se usan voces del propio dispositivo (`localService`). Las voces en línea (más naturales en algunos computadores) son opcionales y Ajustes explica que envían los números de los clavos a ese servicio. |
| Datos olvidados en un equipo compartido | Botón *Borrar todos mis datos* (proyectos, avance, ajustes, caché y service worker). |

## Límites conocidos / Known limits

- **El modo sorpresa protege contra miradas, no contra un experto.** Quien teje necesita los números de
  los clavos, y con ellos alguien con conocimientos técnicos podría reconstruir el dibujo con otra
  herramienta. La app nunca lo muestra hasta terminar, y el archivo puede ir cifrado.
- El nombre del proyecto y el avance (número de paso) se guardan sin cifrar en el índice local para
  poder listar los proyectos. Usa un nombre que no revele nada si te preocupa.
- GitHub Pages no permite cabeceras HTTP propias; la CSP se aplica con `<meta>`, que cubre todo salvo
  `frame-ancestors` (cubierto por la comprobación en JavaScript). En Netlify o Cloudflare Pages,
  el archivo `_headers` aplica la política completa.

## Reportar una vulnerabilidad / Reporting a vulnerability

Abre un *security advisory* privado en el repositorio de GitHub (pestaña *Security* → *Report a
vulnerability*). Por favor no publiques detalles en un *issue* abierto.
