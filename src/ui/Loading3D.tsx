/**
 * Carga de la vista 3D: una píldora de cristal sobre el lienzo 2D, que sigue visible debajo; el 3D
 * aparece fundido encima en el mismo encuadre. Anima solo transform y opacity, así sigue girando
 * aunque el hilo principal esté ocupado compilando sombreadores.
 */
export function Loading3D({ step = 'engine', leaving = false }: { step?: 'engine' | 'scene'; leaving?: boolean }) {
  return (
    <div className={`load3d ${leaving ? 'is-leaving' : ''}`} role="status" aria-live="polite">
      <div className="load3d-card">
        <span className="load3d-ring" aria-hidden />
        <div className="load3d-text">
          <strong>3D</strong>
          <span>{step === 'engine' ? 'Cargando el motor gráfico…' : 'Construyendo piezas y cables…'}</span>
        </div>
        <div className="load3d-steps" aria-hidden>
          <i className="on" />
          <i className={step === 'scene' ? 'on' : ''} />
        </div>
      </div>
    </div>
  );
}
