import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Editor y portada son trozos aparte (src/main.tsx). Este plugin añade a index.html un script mínimo
 * que precarga el trozo que corresponde a la URL, en paralelo con el principal: separar no cuesta
 * una ida y vuelta extra.
 */
function preloadView(): Plugin {
  return {
    name: 'preload-view',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const bundle = ctx.bundle;
        if (!bundle) return html;
        const chunks = Object.values(bundle).filter((c) => c.type === 'chunk');
        const deps = (name: string, seen = new Set<string>()) => {
          const c = bundle[name];
          if (c?.type !== 'chunk') return seen;
          for (const i of c.imports) if (!seen.has(i)) (seen.add(i), deps(i, seen));
          return seen;
        };
        const entry = chunks.find((c) => c.isEntry);
        if (!entry) return html;
        const shared = new Set([entry.fileName, ...deps(entry.fileName)]);
        // En este punto Vite no expone facadeModuleId: el trozo se reconoce por su nombre.
        const view = (name: string) => {
          const c = chunks.find((k) => !k.isEntry && k.name === name);
          return c ? [c.fileName, ...deps(c.fileName)].filter((f) => !shared.has(f)) : [];
        };
        const editor = view('Editor');
        const home = view('Home');
        const script = `<script>(function(){var l=/[?&]p=/.test(location.search)?${JSON.stringify(editor)}:${JSON.stringify(home)};for(var i=0;i<l.length;i++){var k=document.createElement('link');k.rel='modulepreload';k.href='/'+l[i];document.head.appendChild(k)}})()</script>`;
        // Antes de cualquier hoja de estilos: un script en línea espera a las hojas que tiene delante.
        return html.replace(/(<meta charset="[^"]*" ?\/?>)/i, `$1\n    ${script}`);
      },
    },
  };
}

const server = process.env.SERVER_URL ?? `http://localhost:${process.env.CS_PORT ?? 1234}`;

export default defineConfig({
  // Hardware modules are also imported by the simulation worker. React Refresh's
  // browser-only preamble must not be injected into those shared SVG/model files.
  plugins: [react({ exclude: /src[\\/]parts[\\/]/ }), preloadView()],
  // La integración de Clerk en Vercel publica la clave como NEXT_PUBLIC_*.
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  // El worker de ngspice carga el motor WASM con import() dinámico: necesita formato ES.
  worker: { format: 'es' },
  // ngspice (20 MB) se preoptimiza al arrancar, no a mitad de sesión (evita una recarga).
  // Solo la app: sin esto Vite también recorre carpetas de trabajo locales (work/).
  optimizeDeps: { entries: ['index.html'], include: ['eecircuit-engine'] },
  server: {
    port: 5173,
    proxy: {
      '/api': server,
      '/ws': { target: server.replace(/^http/, 'ws'), ws: true },
    },
  },
  test: {
    environment: 'node',
  },
} as never);
