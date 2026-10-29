import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SvgDefs } from './parts/common';
import { CLOUD } from './cloud';
import { CloudShell } from './ui/Auth';
import { Editor } from './ui/Editor';
import { Home } from './ui/Home';
import './styles.css';

const params = new URLSearchParams(location.search);
const room = params.get('p');
const valid = room && /^[A-Za-z0-9_-]{1,64}$/.test(room);
// ?example=1 se mantiene por compatibilidad con enlaces antiguos.
const template = params.get('template') ?? (params.get('example') === '1' ? 'pwm' : null);

const app = valid ? <Editor room={room} template={template} /> : <Home />;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SvgDefs />
    {CLOUD ? <CloudShell>{app}</CloudShell> : app}
  </StrictMode>,
);
