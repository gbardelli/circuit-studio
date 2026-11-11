# Circuit Studio: estado de producción y transparencia

Revisión inicial, 11 de noviembre de 2026. Basada en el código disponible; no constituye una auditoría de producción ni una certificación eléctrica.

## Motor y revisión eléctrica

El motor analógico propio usa análisis nodal modificado, Newton-Raphson y Euler implícito. El modelo de cada pieza se declara como SPICE, comportamental, ideal, MCU o pasivo. Estas categorías describen la implementación y no certifican equivalencia con SPICE ni exactitud frente a una pieza física. La simulación digital y la emulación de microcontroladores tienen sus propios modelos. El proyecto usa avr8js para emulación AVR; no implica que todas las placas estén emuladas por esa biblioteca.

La revisión eléctrica muestra lecturas instantáneas y referencias según los modelos y propiedades configuradas. No incluye todos los transitorios, tolerancias, temperatura o consumos internos. Los 74LS no reproducen por completo ICC ni corrientes de entrada. Los pulsadores no modelan rebote ni todos los retardos. La ausencia de avisos no demuestra que el montaje sea seguro. Revisar los límites y conexiones en el datasheet del componente físico y medir el circuito real.

Para validar, comparar circuitos representativos con cálculos, ngspice y mediciones físicas. Documentar modelo, versión, condiciones, tolerancias, resultados y fallos de convergencia. Publicar los resultados por componente antes de afirmar precisión frente a otros simuladores.

Fuentes: https://ngspice.sourceforge.io/presentation.html y src/core/solver.ts, src/sim/electricalReview.ts.

## Referencias de componentes

El inspector y la biblioteca muestran referencias de Texas Instruments y Nexperia para familias 74HC, 74LS y CD4000, temporizadores y controladores seleccionados. Algunas referencias enlazan a la página del fabricante, donde se encuentra el datasheet. Son referencias de familia, no una identificación automática del fabricante físico. Las demás piezas indican que su referencia está pendiente. Cada nueva referencia requiere verificar fabricante, variante, patillaje y licencia. Los enlaces llevan al proveedor; no se redistribuyen sus PDF o logos.

Las condiciones de cada proveedor rigen la reproducción de fotografías, PDF y marcas. TI restringe determinados usos y el framing de su contenido: https://www.ti.com/en-us/legal/terms-conditions/terms-of-use. Revisar permisos antes de copiar recursos o incluir logos.

## Proyectos y seguridad

La colaboración combina Yjs, Redis y PostgreSQL. En api/_lib/room.ts algunas escrituras de Redis se inician sin esperar confirmación; revisar fallos de escritura y compactación concurrente antes de prometer durabilidad. Se necesitan copias independientes, pruebas periódicas de restauración, indicadores de guardado basados en confirmación, auditoría de permisos de API y WebSocket, límites de uso y pruebas de seguridad independientes. La configuración y los respaldos reales del despliegue no fueron verificados.

## Cuentas e infraestructura

El código usa Clerk. Verificar si el despliegue tiene una instancia de producción y planificar la transición de usuarios. Better Auth es abierto, pero requiere operar autenticación, correo y recuperación; migrar sin validar identidad y titularidad podría impedir el acceso a proyectos. Evaluar una migración ensayada con respaldo antes de cambiar cuentas reales.

Vercel, Redis, PostgreSQL y autenticación deben evaluarse como un sistema, con monitoreo y pruebas de carga y recuperación. No se han medido disponibilidad, capacidad ni costos del despliegue institucional. Definir objetivos y responsables con la universidad.

El logotipo de Arduino se muestra en contexto descriptivo junto a la referencia de su placa. Recurso original: https://content.arduino.cc/brand/arduino-color.svg. Política: https://www.arduino.cc/en/trademark/guides/arduino-and-community-logos/. Los logotipos de otros fabricantes requieren verificar sus condiciones para este uso antes de incorporarlos.

Logo de Texas Instruments: recurso original https://www.ti.com/etc/designs/ti/images/ui/ic-logo.svg. Se muestra para identificar la fuente documental; las marcas pertenecen a sus titulares y no indican patrocinio.
