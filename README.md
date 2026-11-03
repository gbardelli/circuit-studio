# Circuit Studio

Simulador de circuitos colaborativo en el navegador: Arduino Uno, Nano y Mega emulados,
protoboards, integrados lógicos y edición simultánea en protoboard y esquema.

## Arrancar

```bash
npm install
npm run setup:arduino   # una vez: descarga arduino-cli y el core AVR en tools/
npm run dev             # web en http://localhost:5173, servidor de salas en :1234
```

Sin `setup:arduino` todo funciona salvo la ejecución de sketches: el Uno alimenta el
circuito (5 V, 3.3 V, GND) pero no corre código.

`npm test` ejecuta las pruebas del núcleo (unidades, solver, redes de protoboard, avr8js).
`npm run build && npm start` sirve el build de producción desde el mismo servidor.

## Diseño y componentes

La biblioteca incluye puertas lógicas, biestables, registros, contadores, multiplexores,
decodificadores, drivers y temporizador 555. Se puede buscar por función, referencia o alias.
La fuente de laboratorio permite ajustar tensión y límite de corriente desde el inspector
o sus mandos. El LED distingue ánodo y cátodo y se invierte con F.

El esquema permite conectar pines y simular el circuito directamente. Las conexiones
del esquema aparecen discontinuas en la protoboard hasta que se cablean físicamente.
Ambas vistas comparten la topología y conservan posiciones independientes.

«Ordenar conexiones» distribuye cuatro o más etapas en dos columnas, con corredores
amplios, y mueve las piezas junto con sus protoboards. Recalcula los recorridos para
evitar cuerpos de componentes y reserva espacio entre trazados paralelos. Los colores
identifican familias y bits de señal; cada red mantiene el mismo color de punta a punta.
La operación se puede deshacer y se rechaza si cambia una conexión eléctrica. Al
señalar un cable se destaca su red completa y se identifican sus extremos; los cruces
se distinguen con cortes de paso, sin puntos de unión.

En Compartir, «Copiar enlace de visualización» activa el acceso público de solo
lectura y copia un enlace `?p=…&view=1`. Se abre sin cuenta y sin cargar Clerk.
La edición, el historial y la compilación requieren una sesión. Los enlaces
restringidos y los de edición no permiten acceso anónimo.

Las decisiones visuales y referencias están en `DESIGN.md`.

## Modo diseño e integrados propios

La pestaña Diseño es un lienzo de lógica ideal, al estilo de Logisim o CircuitVerse: entradas,
pulsadores, relojes, puertas de 2 a 8 entradas, triestados, biestables D, JK, T y SR,
multiplexor, display hexadecimal y todos los 74HC y CD4000 lógicos del catálogo como bloques.
Se une arrastrando de una patilla a otra; un clic en una entrada la cambia. Los cables muestran
su valor (1, 0, X y conflicto en rojo) y el simulador avisa de oscilaciones.

Cada hoja de integrado define un CI propio: sus Entradas y Salidas son las patillas. El panel
fija nombre, referencia, encapsulado DIP (VCC en la última patilla, GND en la mitad), el orden
de patillas y la tabla de verdad. Un integrado se usa dentro de otras hojas y, como integrado
virtual con contorno violeta, en la protoboard y el esquema, donde se simula como un 74HC.
«Crear integrado con la selección» convierte una parte de la hoja principal en un CI. Las
hojas viven en el documento compartido (`src/collab/design.ts`); la lógica, en `src/logic/`.

## Producción

El despliegue existente en Vercel usa Clerk para cuentas, Neon para proyectos y roles,
Upstash para sincronización y Vercel Sandbox para compilar firmware. Las claves se
configuran como variables de entorno y no se guardan en Git. Sin la clave pública de
Clerk, el desarrollo local utiliza salas WebSocket e IndexedDB.

Para tu propio despliegue copia `.env.example` a `.env.local` y rellena las claves de tus
cuentas de Clerk, Neon y Upstash. Nunca subas valores reales; consulta `SECURITY.md`.

## Contribuir y licencia

Código abierto bajo licencia [MIT](LICENSE). Las issues y los pull requests son bienvenidos:
haz un fork, crea una rama y ejecuta `npm run typecheck && npm test` antes de abrir el PR.
Los cambios llegan a `main` solo por revisión del mantenedor.

## Cómo está hecho

| Capa | Archivos | Notas |
| --- | --- | --- |
| Modelo de circuito | `src/core/types.ts`, `netlist.ts` | Las redes se derivan del dibujo (patilla sobre orificio, tiras de protoboard, cables); nunca se guardan |
| Solver | `src/core/solver.ts` | MNA con Newton-Raphson, limitación de unión (pnjlim), Euler implícito para condensadores |
| Componentes | `src/parts/*` | Pines, modelo eléctrico y arte SVG de cada pieza en un solo sitio |
| Microcontrolador | `src/sim/avr.ts`, `engine.ts` | avr8js (MIT) ciclo a ciclo; el circuito se resuelve en cada cambio de pin o cada 1 ms |
| Colaboración | `src/collab/project.ts`, `server/rooms.ts` | Yjs + y-websocket; deshacer por usuario; presencia (cursores, selección, arrastre) por awareness; copia local en IndexedDB |
| Compilación | `server/compile.ts` | arduino-cli local, directorio temporal por petición, caché por hash |

Cada navegador simula localmente; el documento compartido solo contiene el circuito y el código.
Los proyectos se guardan en `data/<sala>.ydoc` (escritura atómica + `.bak`).

## Límites conocidos

- Solver propio para interactividad; no sustituye a ngspice para análisis AC o modelos de fabricante.
- El servidor local permite editar a quien tenga acceso a su enlace. En producción se comprueban sesión y rol.
- Los modelos lógicos son aproximaciones educativas; no reproducen todos los parámetros de las hojas de datos.
- ESP32, OLED e instrumentos de análisis avanzado siguen pendientes.
- Un solo Arduino por proyecto está probado; varios funcionan pero comparten la misma ventana de tiempo.

El ascensor tiene tres displays de 7 segmentos con 74HC48: piso actual (U19, oscuro hasta
el primer sensor), destino (U14) y segundos al siguiente piso (U17, directo de U16). Los
codificadores son de compuertas (no hay 74HC148) y /SENSOR sale de un OR de diodos, para que
la carga asíncrona de U11 nunca lea un 000 al soltarse un sensor. La GIGA Display Shield
muestra el hueco, el tiempo total del viaje (9, 6 o 3 s), las llamadas táctiles y el estado
en su LED RGB. Sin el GIGA, todo lo obligatorio sigue funcionando con los integrados.

La GIGA Display Shield se suelta encima del GIGA, encaja centrada y desde entonces se mueve con
él, sin cables. Montada tapa la placa; F voltea la pila para ver y cablear los pines del GIGA. Los sketches usan las
librerías oficiales (`Arduino_GigaDisplay_GFX`, `Arduino_GigaDisplayTouch`,
`Arduino_GigaDisplay`). Al compilar para el núcleo AVR del simulador se sustituyen por
equivalentes de `src/sim/gigaDisplayShim.ts`; LVGL, la IMU y el micrófono no se emulan.

## Guía de montaje

Montaje abre una mesa vacía y presenta las placas, las piezas y luego cada cable.
La pieza pendiente se muestra translúcida, con su orientación y las filas y columnas
del patillaje. El índice permite revisar pasos sin confirmarlos. Las confirmaciones
manuales se guardan como metadatos; la guía nunca modifica el circuito ni su código.
Los visitantes de un enlace público pueden recorrerla con progreso local de sesión.

Arrastra el borde superior del laboratorio para ajustar su altura. Cada sección
recuerda su tamaño. El botón de ampliar ocupa la ventana y Esc restaura el tamaño
anterior. Imprimir / PDF incluye el plano completo, los materiales y todos los pasos,
aunque la vista guiada aún esté incompleta.
