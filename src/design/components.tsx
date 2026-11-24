/**
 * Primitivos del design system. Envuelven las clases que ya usa la app (.btn, .icon-btn,
 * .segmented, .switch, .input, kbd) para que cada variante tenga un único nombre y API:
 * el código nuevo usa estos componentes, no clases sueltas.
 *
 * Reglas (DESIGN.md): una acción primaria por tarea · los iconos sin texto llevan etiqueta
 * accesible y tooltip · responder al pulsar (:active), no al soltar · nada se anima al usar
 * un atajo de teclado.
 */
import { forwardRef, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { HintButton } from '../ui/Overlays';
import { SegmentIndicator } from '../ui/SegmentIndicator';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

type Native = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>;

export type ButtonVariant = 'secondary' | 'primary' | 'accent' | 'ghost' | 'danger';
export type ButtonProps = Native & {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  /** Icono a la izquierda (16 px en md, 14 px en sm). */
  icon?: ReactNode;
  /** Descripción del tooltip; con «· Ctrl+K» al final muestra el atajo. */
  hint?: string;
  shortcut?: string;
  children?: ReactNode;
};

/** Botón con texto. `primary` solo una vez por tarea; `ghost` para acciones terciarias. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, className, children, type = 'button', ...props },
  ref,
) {
  return (
    <HintButton ref={ref} type={type} className={cx('btn', variant !== 'secondary' && variant, size === 'sm' && 'sm', className)} {...props}>
      {icon}
      {children}
    </HintButton>
  );
});

export type IconButtonProps = Native & {
  /** Etiqueta accesible obligatoria: también es el tooltip. */
  label: string;
  shortcut?: string;
  /** Estado conmutado (aria-pressed). */
  active?: boolean;
  children: ReactNode;
};

/** Botón solo icono, objetivo de 28 px (44 px con puntero grueso). */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, active, className, children, type = 'button', ...props },
  ref,
) {
  return (
    <HintButton
      ref={ref}
      type={type}
      aria-label={label}
      aria-pressed={active}
      hint={label}
      className={cx('icon-btn', active && 'on', className)}
      {...props}
    >
      {children}
    </HintButton>
  );
});

export type SegmentedOption<T extends string> = { value: T; label: ReactNode; hint?: string };

/** Control segmentado con indicador deslizante (se mueve, no parpadea). */
export function Segmented<T extends string>({ options, value, onChange, label, className }: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div className={cx('segmented', className)} role="radiogroup" aria-label={label}>
      <SegmentIndicator />
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} className={o.value === value ? 'on' : undefined} title={o.hint} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Interruptor binario. Para opciones que se aplican al instante, sin botón de guardar. */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" className="switch" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} />;
}

/** Campo con etiqueta, ayuda y error. La etiqueta siempre visible: el placeholder no la sustituye. */
export function Field({ label, hint, error, children, id }: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  id?: string;
  children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode;
}) {
  const auto = useId();
  const fid = id ?? auto;
  const describe = error ? `${fid}-err` : hint ? `${fid}-hint` : undefined;
  return (
    <div className="ds-field">
      <label htmlFor={fid}>{label}</label>
      {children({ id: fid, 'aria-describedby': describe, 'aria-invalid': error ? true : undefined })}
      {error ? <p id={`${fid}-err`} className="ds-field-error">{error}</p> : hint ? <p id={`${fid}-hint`} className="ds-field-hint">{hint}</p> : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input(
  { invalid, className, ...props },
  ref,
) {
  return <input ref={ref} className={cx('input', (invalid || props['aria-invalid'] === true) && 'invalid', className)} {...props} />;
});

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'live';

/** Etiqueta de estado. El color nunca va solo: siempre acompaña a un texto o icono. */
export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx('ds-badge', `is-${tone}`, className)}>{children}</span>;
}

/** Tecla de un atajo. */
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd>{children}</kbd>;
}

/** Superficie de material de panel, con cabecera opcional. */
export function Panel({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('ds-panel', className)}>
      {(title || actions) && (
        <header>
          {title && <h3>{title}</h3>}
          {actions && <div className="ds-panel-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export { HintButton as Hint, PopoverPanel as Popover } from '../ui/Overlays';
