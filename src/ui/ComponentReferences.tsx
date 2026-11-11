import { ArrowUpRight, FileText } from 'lucide-react';
import { MANUFACTURER_REFERENCES } from '../parts/manufacturerReferences';

const BRAND_ASSETS: Record<string, string> = {
  Arduino: 'arduino.svg',
  'Texas Instruments': 'texas-instruments.svg',
  Nexperia: 'nexperia.png',
  onsemi: 'onsemi.svg',
  'ON Semiconductor': 'onsemi.svg',
  'Fairchild Semiconductor': 'fairchild.svg',
  'Diodes Incorporated': 'diodes.svg',
  Vishay: 'vishay.png',
  'KOA Speer': 'koa.png',
  Kingbright: 'kingbright.png',
  Adafruit: 'adafruit.png',
  SparkFun: 'sparkfun.png',
  'Tower Pro': 'towerpro.png',
  'B&K Precision': 'bkprecision.png',
};

export function ComponentReferences({ type }: { type: string }) {
  const references = MANUFACTURER_REFERENCES[type] ?? [];
  if (!references.length) return <p className="reference-empty">Sin ficha de fabricante verificada.</p>;
  return <div className="reference-list">

    {references.map(reference => <div className="reference-item" key={`${reference.manufacturer}-${reference.partNumber}`}>
      <div className="reference-heading">
        {BRAND_ASSETS[reference.manufacturer] && <img className={`reference-brand${['Kingbright', 'Adafruit', 'B&K Precision'].includes(reference.manufacturer) ? ' reference-brand-dark' : ''}`} src={`/manufacturers/${BRAND_ASSETS[reference.manufacturer]}`} alt="" />}
        <div className="reference-identity">
          <span className="reference-maker">{reference.manufacturer}{reference.sourceRole === 'supplier' ? ' · Proveedor' : ''}</span>
          <strong>{reference.partNumber}</strong>
          {reference.example && <span className="reference-example">Ejemplo{reference.note ? ` · ${reference.note}` : ' de componente físico'}</span>}
          {!reference.example && reference.note && <span className="reference-example">{reference.note}</span>}
        </div>
      </div>
      <a href={reference.datasheet} target="_blank" rel="noopener noreferrer" aria-label={`${reference.documentType === 'drawing' ? 'Abrir plano de dimensiones' : reference.documentType === 'archive' ? 'Abrir ficha archivada' : reference.documentType === 'product' ? 'Abrir documentación' : 'Abrir datasheet PDF'} de ${reference.partNumber}, en otra pestaña`}>
        <FileText size={14} aria-hidden="true" />
        {reference.documentType === 'drawing' ? 'Ver plano de dimensiones' : reference.documentType === 'archive' ? 'Ver ficha archivada' : reference.documentType === 'product' ? 'Ver documentación' : 'Ver datasheet PDF'}
        <ArrowUpRight size={13} aria-hidden="true" />
      </a>
    </div>)}
  </div>;
}
