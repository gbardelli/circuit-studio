# SPICE en CircuitStudio

CircuitStudio usa **ngspice real** (el SPICE de código abierto de referencia, descendiente directo de Berkeley SPICE 3f5) para calcular y verificar cada circuito. No es una etiqueta: el mismo circuito que ves se exporta a netlist y ngspice lo resuelve.

## Por qué dos niveles

La simulación en vivo tiene que avanzar a 60 fps mientras un Arduino emulado ejecuta su programa ciclo a ciclo. ngspice resuelve por lotes (le das una netlist, te devuelve resultados): no se puede acoplar paso a paso a un microcontrolador. Las herramientas profesionales separan igual la co-simulación en tiempo real del solver de referencia.

| Nivel | Qué hace | Dónde corre |
|---|---|---|
| 1 · Tiempo real | MNA + Newton-Raphson + Euler implícito, la misma formulación que SPICE. Co-simula el AVR. | Worker de simulación |
| 2 · ngspice | Resuelve el punto de operación de cada topología y lo compara nodo a nodo con el nivel 1. Exporta la netlist `.cir`. | Worker propio, cargado bajo demanda |

## Cómo garantizamos que se usa

1. **En la app:** cada vez que cambia la topología, el motor exporta el circuito (`src/spice/netlist.ts`), ngspice lo resuelve en un Worker (`src/spice/spice.worker.ts`) y se compara (`src/spice/verify.ts`). Diagnóstico muestra «Coincide con SPICE · Δ máx» o qué nodo discrepa. La barra de estado lleva el chip «SPICE».
2. **En CI:** `src/spice/spice.test.ts` corre ngspice en Node contra un divisor, un LED, un NPN, un MOSFET y todas las plantillas. Tolerancia: 1 mV o 0,5 %. Si un modelo se desvía, el despliegue falla. Esta verificación ya encontró un fallo real del solver (el refinamiento LU aceptaba errores de nA ocultos por la corriente Norton de las fuentes).
3. **Para el usuario:** el botón de exportar descarga la netlist; se abre tal cual en LTspice o ngspice.

## Correspondencia de modelos

| Pieza | Tarjeta SPICE |
|---|---|
| Resistencia | `R` |
| Fuente / pila | `V` + `R` serie (resistencia interna) |
| Condensador | `C` |
| Diodo, LED | `D` + `.model D(IS N)` (Shockley) |
| NPN | `Q` + `.model NPN(IS BF BR)` (Gummel-Poon sin Early = Ebers-Moll) |
| MOSFET N | `M` + `.model NMOS(LEVEL=1 VTO KP)` |
| Pin de microcontrolador | `V`+`R` o `R` según modo (alto, bajo, pull-up, entrada) |
| Integrados lógicos | su equivalente eléctrico exacto en el punto de operación (`G` + `I`) |

`RGMIN` de 1 TΩ por nodo replica el GMIN del solver para que ambos vean el mismo circuito.

## Motor y coste

- `eecircuit-engine` 1.9 (ngspice compilado a WebAssembly, MIT).
- 5,7 MB gz, solo dentro del worker de SPICE: no entra en la carga inicial.
- Arranque ~600 ms una vez; punto de operación 2–40 ms según tamaño, fuera del hilo principal (0 tareas largas medidas).
- Verificación con espera de 300 ms tras el último cambio.
