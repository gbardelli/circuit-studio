import { Component, type ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';

interface State {
  error: Error | null;
}

/** Si algo de la interfaz falla, el documento sigue a salvo en Yjs: basta con recargar. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="error-screen">
        <div>
          <h1>Algo se ha roto</h1>
          <p>Tu circuito está guardado. Recarga para seguir donde lo dejaste.</p>
          <button className="btn primary" onClick={() => location.reload()}>
            <RotateCcw size={14} /> Recargar
          </button>
        </div>
      </div>
    );
  }
}
