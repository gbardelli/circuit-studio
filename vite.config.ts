import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const server = process.env.SERVER_URL ?? `http://localhost:${process.env.CS_PORT ?? 1234}`;

export default defineConfig({
  // Hardware modules are also imported by the simulation worker. React Refresh's
  // browser-only preamble must not be injected into those shared SVG/model files.
  plugins: [react({ exclude: /src[\\/]parts[\\/]/ })],
  // La integración de Clerk en Vercel publica la clave como NEXT_PUBLIC_*.
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
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
