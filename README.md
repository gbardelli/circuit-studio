# Circuit Studio

Simulador de circuitos colaborativo en el navegador: Arduino Uno emulado, protoboards,
componentes realistas y edición simultánea entre varias personas.

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
- Sin autenticación: cualquiera con el enlace edita. El servidor valida tamaño de mensajes, no la semántica.
- Un solo Arduino por proyecto está probado; varios funcionan pero comparten la misma ventana de tiempo.
