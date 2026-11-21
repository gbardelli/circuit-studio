/**
 * Carga de la vista 3D: cubre el lienzo mientras se descarga el motor y se construye el montaje.
 * Vive en el bundle principal (es lo primero que se ve) y anima solo con transform y opacity, así
 * sigue girando aunque el hilo principal esté ocupado compilando sombreadores.
 */
export function Loading3D({ step = 'engine', leaving = false }: { step?: 'engine' | 'scene'; leaving?: boolean }) {
  return (
    <div className={`load3d ${leaving ? 'is-leaving' : ''}`} role="status" aria-live="polite">
      <div className="load3d-card">
        <span className="load3d-ring" aria-hidden />
        <div className="load3d-text">
          <strong>Preparando la vista 3D</strong>
          <span>{step === 'engine' ? 'Cargando el motor gráfico…' : 'Construyendo piezas, cables y sombras…'}</span>
        </div>
      </div>
      <div className="load3d-steps" aria-hidden>
        <i className="on" />
        <i className={step === 'scene' ? 'on' : ''} />
      </div>
    </div>
  );
}
