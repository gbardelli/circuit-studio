# Ascensor con los integrados de clase (LS + HC) y GIGA como pantalla

Montaje **«Ascensor con integrados de clase + GIGA»**; no está en la galería de Plantillas: se abre con
`/?new=elevator-class`, que crea un circuito nuevo con este montaje (`src/collab/fixtures/elevator-class.json`,
regenerado con `npx tsx scripts/build-elevator-class.ts`).
Código: `src/collab/elevatorClass.ts` (`elevatorClassTemplate()`); sketch: `src/collab/elevatorClassSketch.ts`.

La lógica va a **5 V** y es de los integrados del kit. El GIGA (3,3 V) es la innovación: por dos
módulos TXS0108E (8 canales cada uno) lee destino, piso actual y OCUPADO, llama al ascensor desde su pantalla táctil
(como un pulsador más) y en modo AUTO mueve la cabina activando los sensores (3 s por piso). En
MANUAL los sensores se mueven a mano con el DIP. Sin el GIGA el ascensor funciona igual con PP1–PP4 y el DIP.

## Qué hace cada integrado

| Cant. | Integrado | Función |
| --- | --- | --- |
| 2 | 74LS75 | U8 memoria del destino, U11 memoria del piso actual |
| 1 | 74LS85 | U12 comparador (A = piso actual, B = destino) |
| 2 | 74LS48 | U14 display del destino, U19 display del piso actual |
| 2 / 2 / 4 / 1 | 74HC00 / 04 / 08 / 32 | U2 U9 / U3 U10 / U20 U6 U13 U21 / U7 |
| 1 | 74HC74 | U5 OCUPADO y VÁLIDO |
| 1 | NE555 | U4 reloj de ≈21 Hz (a 5 V un NE555 normal oscila) |

Lo que **no** hace falta: 74LS173, 74LS193 ni 74HC86; tampoco hay display de cuenta regresiva.

## Resistencias y otros

| Cant. | Valor | Dónde |
| --- | --- | --- |
| 4 | 1 kΩ | LS, LB, PARAR y OCUPADO (≈3 mA por LED) |
| 9 | 10 kΩ | pull-up de PP1–PP4, RESET y SP1–SP4 |
| 3 | 4,7 kΩ | pull-up de las salidas del LS85 que entran en puertas HC |
| 1 + 1 | 1 kΩ + 33 kΩ, 1 µF | reloj del NE555 (f = 1,44 / ((R1 + 2·R2)·C)) |

Los 74LS48 llevan resistencias internas de 2 kΩ a VCC en sus salidas: cada segmento queda limitado
a unos 1,5 mA, así que los displays van **sin resistencia externa** (cátodo común a masa).
Las 220 Ω del kit quedan de repuesto.

## Por qué LS y HC se mezclan con cuidado

- Un LS en alto da ≈3,4 V; una puerta HC a 5 V pide ≥3,5 V. Por eso las tres salidas del 74LS85
  que van a puertas HC llevan un pull-up de 4,7 kΩ. Las salidas de los 74LS75 solo van a entradas LS
  (74LS85, 74LS48) y a los adaptadores, que aceptan 3,4 V.
- Las salidas HC (5 V) hacia entradas LS no necesitan nada.

## GIGA y adaptadores de nivel (2 × TXS0108E)

Cada módulo TXS0108E (placa HW-221) tiene 8 canales bidireccionales: **A1–A8** en el lado bajo
(**VA**, 1,2–3,6 V) y **B1–B8** en el lado alto (**VB**, 1,65–5,5 V), con VA ≤ VB.

- **VA** → pin **3V3** del GIGA. **VB** → riel de **5 V**. **GND** → masa común.
- **OE** → unido a **VA**. Con OE en bajo o al aire los canales quedan desconectados: es el fallo
  más habitual con este módulo.
- El GIGA solo se conecta al lado **A**: nunca ve más de 3,3 V.
- El chip trae pull-ups internas en cada lado; las de 10 kΩ de los pulsadores y del DIP quedan en
  paralelo en el lado B, sin problema (≈0,5 mA por línea a 0).

| Módulo | Canal | Línea | Sentido | Pin GIGA |
| --- | --- | --- | --- | --- |
| TXS 1 | A1–A3 / B1–B3 | DEST0–2 (U8 1Q–3Q) | CI → GIGA | D23, D25, D27 |
| TXS 1 | A4 / B4 | OCUPADO (U5 1Q) | CI → GIGA | D29 |
| TXS 1 | A5–A7 / B5–B7 | PISO0–2 (U11 1Q–3Q) | CI → GIGA | D31, D33, D35 |
| TXS 1 | A8 / B8 | libre | | |
| TXS 2 | A1–A4 / B1–B4 | LL1–LL4 → líneas PP1–PP4 | GIGA → CI | D37, D39, D41, D43 |
| TXS 2 | A5–A8 / B5–B8 | SP1–SP4 → sensores | GIGA → CI | D45, D47, D49, D51 |

Las salidas del GIGA son de drenador abierto: `OUTPUT LOW` baja la línea (el TXS la lleva a 0 en el
lado de 5 V, igual que un pulsador) e `INPUT` la suelta. El GIGA nunca empuja tensión.
El GIGA se alimenta por USB. **Nunca** conectes una salida de 5 V directo a un pin del GIGA.

## Cómo se maneja

- **PP1–PP4**: pulsadores de cabina. Pulsado = 0. Con dos a la vez gana el piso más alto.
- **SP1–SP4** (DIP, modo MANUAL): sensores de planta. Si hay varios activos gana el más alto (nunca pasa de 4).
- **Pantalla del GIGA**: botones 1–4 para llamar al ascensor y AUTO/MANUAL arriba a la derecha.
- **RESET**: borra OCUPADO y VÁLIDO.
- LEDs: LS sube, LB baja, PARAR cuando piso actual = destino, OCUPADO durante el viaje.

## Latches (74LS75), no registros

- **U8 (destino)** está abierto mientras ACEPTAR = 1 y el reloj está en bajo; se cierra en el mismo
  flanco de subida con el que el 74HC74 pone OCUPADO a 1.
- **U11 (piso actual)** está abierto mientras haya un sensor activo y conserva el piso al soltarlo.
  Sus datos pasan por dos inversores más (U10) que la señal SENSOR: así el latch se cierra antes de
  que el código del sensor caiga a 0.
- **Limitación**: si pides el piso en que ya estás, el ascensor termina en el acto y el display del
  destino puede apagarse hasta el siguiente pedido. No afecta a ningún viaje.

## Validación

`src/sim/elevatorClass.test.ts` comprueba la memoria del piso actual, los doce viajes entre pisos
distintos (LS/LB), el bloqueo en viaje, la prioridad 4 > 3 > 2 > 1, RESET, que los CI ven 5 V y que
los pines del GIGA no pasan de 3,4 V, y que el sketch compilado dibuja piso, destino y sentido.
Es un modelo funcional/eléctrico del simulador: no certifica una placa real. Faltan rebotes de los
pulsadores, tiempos reales de los latches, transitorios y el desacoplo de 100 nF por integrado
(recomendable en la protoboard real; se omite aquí por simplicidad). Antes de energizar, mide los
rieles sin el GIGA conectado.
