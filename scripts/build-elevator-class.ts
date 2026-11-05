// Genera src/collab/fixtures/elevator-class.json: el ascensor de clase ya cableado sobre las
// protoboards. El enrutado de los cables tarda unos segundos, así que la galería lee este JSON.
// Vuelve a ejecutarlo si cambias src/collab/elevatorClass.ts o su sketch: `npx tsx scripts/build-elevator-class.ts`.
import { writeFileSync } from 'node:fs';
import { elevatorClassTemplate } from '../src/collab/elevatorClass';

writeFileSync('src/collab/fixtures/elevator-class.json', `${JSON.stringify(elevatorClassTemplate(), null, 1)}\n`);
console.log('src/collab/fixtures/elevator-class.json');
