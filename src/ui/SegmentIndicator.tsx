import { useLayoutEffect, useRef } from 'react';

/**
 * Indicador que se desliza bajo la opción activa de un control segmentado.
 * Se coloca como hijo del contenedor; sigue a la opción marcada (aria-selected, aria-pressed o
 * .on/.active) y se mueve con transform: el cambio de vista se lee como un movimiento continuo,
 * no como dos botones que se encienden y se apagan. Sin opción activa, se desvanece.
 */
const ACTIVE = ':scope > [aria-selected="true"], :scope > .on, :scope > .active';

export function SegmentIndicator() {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    parent.classList.add('has-indicator');
    let first = true;
    const place = () => {
      const active = parent.querySelector<HTMLElement>(ACTIVE);
      if (!active) {
        el.style.opacity = '0';
        return;
      }
      // El primer posicionamiento no se anima: el indicador nace ya en su sitio.
      if (first) el.style.transition = 'none';
      el.style.opacity = '1';
      el.style.width = `${active.offsetWidth}px`;
      el.style.height = `${active.offsetHeight}px`;
      el.style.transform = `translate(${active.offsetLeft}px, ${active.offsetTop}px)`;
      if (first) {
        void el.offsetWidth;
        el.style.transition = '';
        first = false;
      }
    };
    place();
    const mo = new MutationObserver(place);
    mo.observe(parent, { subtree: true, attributes: true, attributeFilter: ['class', 'aria-selected', 'aria-pressed'], childList: true });
    const ro = new ResizeObserver(place);
    ro.observe(parent);
    return () => {
      mo.disconnect();
      ro.disconnect();
      parent.classList.remove('has-indicator');
    };
  }, []);
  return <span ref={ref} className="seg-indicator" aria-hidden />;
}
