# Publicar una versión

Las novedades viven en `changelog/entries/<versión>.md` y se publican en `/changelog/` con cada despliegue de `main`.

1. `npm run changelog draft 1.2.0` agrupa los commits desde la última entrada en `changelog/drafts/1.2.0.md`, con el encargo de redacción.
2. Claude escribe `changelog/entries/1.2.0.md` en el tono de las entradas anteriores: primera persona, concreto, sin relleno. Tú lo revisas.
3. Si lleva capturas, `changelog/entries/1.2.0.shots.json` describe cada una (URL, pasos y recorte) y `npm run changelog shots 1.2.0` las hace con el Chrome del sistema. Para capturar en local: `CHANGELOG_BASE=http://localhost:5173`. Recorta siempre a `.workspace` o más dentro: la barra superior y el inspector muestran nombres de personas.
4. Sube la versión en `package.json`, haz commit y fusiona a `main`. El despliegue publica la página, el RSS y `latest.json`, que enciende el punto de «Novedades» en la portada.
5. `git tag v1.2.0 && git push origin v1.2.0` crea la Release de GitHub con el mismo texto.

`npm run changelog build` regenera la página en local; `npm run dev` y `npm run build` lo hacen solos.
