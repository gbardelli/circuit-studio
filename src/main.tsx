import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { SvgDefs } from './parts/common';
import { CLOUD } from './cloud';
import { CloudShell } from './ui/Auth';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { PendingCode, Startup } from './ui/Startup';
import { UpdateNotice } from './ui/UpdateNotice';
import './design/tokens.css';
import './styles.css';
import './workbench.css';
import './chrome.css';
import './depth.css';
import './design/components.css';
import './design/panels.css';

const params = new URLSearchParams(location.search);
const AssemblyConcept = lazy(() => import('./previews/AssemblyConcept'));
const DesignGuide = lazy(() => import('./design/Guide'));
const designGuide = params.has('design');
const preview = params.get('preview') === 'assembly';
const room = params.get('p');
const valid = room && /^[A-Za-z0-9_-]{1,64}$/.test(room);
// ?example=1 se mantiene por compatibilidad con enlaces antiguos.
const template = params.get('template') ?? (params.get('example') === '1' ? 'pwm' : null);

// Editor y portada van en trozos separados: quien abre un circuito no descarga la portada y al revés.
// El trozo que toca se precarga desde index.html (vite.config.ts, preloadView) en paralelo con este.
const Editor = lazy(() => import('./ui/Editor').then((m) => ({ default: m.Editor })));
const Home = lazy(() => import('./ui/Home').then((m) => ({ default: m.Home })));
const view = valid ? <Editor room={room} template={template} /> : <Home />;
const app = <Suspense fallback={<PendingCode />}>{view}</Suspense>;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SvgDefs />
    <ErrorBoundary>
      {designGuide ? <Suspense fallback={null}><DesignGuide /></Suspense> : preview ? <Suspense fallback={<div role="status">Cargando vista preliminar…</div>}><AssemblyConcept/></Suspense> : <Startup cloud={CLOUD}>{CLOUD ? <CloudShell>{app}</CloudShell> : app}</Startup>}
    </ErrorBoundary>
    <UpdateNotice />
  </StrictMode>,
);
