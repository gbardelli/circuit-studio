import { ArrowUpRight, FileText } from 'lucide-react';
import { MANUFACTURER_REFERENCES } from '../parts/manufacturerReferences';

export function ComponentReferences({ type }: { type: string }) {
  const references = MANUFACTURER_REFERENCES[type] ?? [];
  if (!references.length) return <p className="reference-empty">Sin ficha de fabricante verificada.</p>;
  return <div className="reference-list">

    {references.map(reference => <div className="reference-item" key={`${reference.manufacturer}-${reference.partNumber}`}>
      <div className="reference-heading">
        {reference.manufacturer === 'Arduino' && <img className="reference-logo" src="/manufacturers/arduino.svg" alt="" />}
        {reference.manufacturer === 'Texas Instruments' && <img className="reference-logo-ti" src="/manufacturers/texas-instruments.svg" alt="" />}
        <div className="reference-identity">
          <span className="reference-maker">{reference.manufacturer}</span>
          <strong>{reference.partNumber}</strong>
        </div>
      </div>
      <a href={reference.datasheet} target="_blank" rel="noopener noreferrer" aria-label={`${reference.documentType === 'product' ? 'Abrir documentación' : 'Abrir datasheet PDF'} de ${reference.partNumber}, en otra pestaña`}>
        <FileText size={14} aria-hidden="true" />
        {reference.documentType === 'product' ? 'Ver documentación' : 'Ver datasheet PDF'}
        <ArrowUpRight size={13} aria-hidden="true" />
      </a>
    </div>)}
  </div>;
}
