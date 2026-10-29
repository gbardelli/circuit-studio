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

Las decisiones visuales y referencias están en `DESIGN.md`.

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
