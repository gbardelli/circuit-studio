import { useState } from "react";
import { Check, FileDown, Search, X } from "lucide-react";
import { useEditor, useSnapshot } from "./context";
import { useUi } from "./store";
import { materials } from "./lab-utils";
import { HintButton } from "./Overlays";

export function Materials({
  exporting,
  onPdf,
}: {
  exporting: boolean;
  onPdf: (purchased: Record<string, number>, includePrices: boolean) => void;
}) {
  const { project } = useEditor(),
    snapshot = useSnapshot(),
    rows = materials(snapshot);
  const [search, setSearch] = useState(""),
    [pending, setPending] = useState(false);
  const prices = (project.meta.get("assembly.prices") ?? {}) as Record<
    string,
    number
  >;
  const purchased = (project.meta.get("assembly.purchased") ?? {}) as Record<
    string,
    number
  >;
  const localPurchased = useUi((s) => s.assemblyLocalPurchased);
  const checklist = project.readOnly ? localPurchased : purchased;
  const [showPrices, setShowPrices] = useState(Object.keys(prices).length > 0);
  const currency = String(project.meta.get("assembly.currency") ?? "PEN");
  const isReady = (row: (typeof rows)[number]) =>
    (checklist[row.key] ?? 0) >= row.quantity;
  const ready = rows.filter(isReady).length;
  const visible = rows.filter(
    (row) =>
      (!pending || !isReady(row)) &&
      `${row.name} ${row.reference}`
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()),
  );
  const total = rows.reduce(
    (sum, row) => sum + (prices[row.key] ?? 0) * row.quantity,
    0,
  );
  const priced = rows.filter((row) => prices[row.key] !== undefined).length;
  const money = (value: number) =>
    new Intl.NumberFormat("es-PE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  function toggle(row: (typeof rows)[number]) {
    const current = project.readOnly
      ? useUi.getState().assemblyLocalPurchased
      : ((project.meta.get("assembly.purchased") ?? {}) as Record<
          string,
          number
        >);
    const next = {
      ...current,
      [row.key]: (current[row.key] ?? 0) >= row.quantity ? 0 : row.quantity,
    };
    if (project.readOnly) useUi.setState({ assemblyLocalPurchased: next });
    else project.setMeta("assembly.purchased", next);
  }
  return (
    <section className="bom-panel" aria-label="Lista de materiales">
      <header className="bom-heading">
        <div>
          <h2>Lista de materiales</h2>
          <p>
            <span>{snapshot.parts.length} componentes</span>
            <span>{snapshot.wires.filter((w) => !w.sch).length} cables</span>
            <span>{rows.length} referencias</span>
          </p>
        </div>
        <div className="bom-heading-actions">
          <HintButton
            className="btn primary"
            disabled={exporting || !rows.length}
            onClick={() => onPdf(checklist, showPrices)}
          >
            <FileDown size={17} />
            {exporting ? "Preparando PDF…" : "Descargar PDF"}
          </HintButton>
        </div>
      </header>
      <div className="bom-tools">
        <label className="bom-search">
          <Search size={17} />
          <input
            type="search"
            aria-label="Buscar material"
            placeholder="Buscar componente o referencia"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <HintButton
              className="icon-btn panel-control"
              aria-label="Limpiar búsqueda de materiales"
              onClick={() => setSearch("")}
            >
              <X size={15} />
            </HintButton>
          )}
        </label>
        <div
          className="bom-filter"
          role="group"
          aria-label="Filtrar materiales"
        >
          <button aria-pressed={!pending} onClick={() => setPending(false)}>
            Todos
          </button>
          <button aria-pressed={pending} onClick={() => setPending(true)}>
            Pendientes
          </button>
        </div>
        <label className="bom-prices-toggle">
          <input
            type="checkbox"
            checked={showPrices}
            onChange={(e) => setShowPrices(e.target.checked)}
          />
          Precios
        </label>
        {showPrices && (
          <select
            aria-label="Moneda de materiales"
            value={currency}
            disabled={project.readOnly}
            onChange={(e) =>
              project.setMeta("assembly.currency", e.target.value)
            }
          >
            <option>PEN</option>
            <option>USD</option>
            <option>EUR</option>
          </select>
        )}
      </div>
      <div className="bom-scroll">
        <table aria-label="Materiales del circuito">
          <thead>
            <tr>
              <th scope="col" className="bom-ready-column">
                Listo
              </th>
              <th scope="col">Componente / referencia</th>
              <th scope="col" className="bom-quantity-column">
                Cantidad
              </th>
              {showPrices && (
                <>
                  <th scope="col">Precio unitario</th>
                  <th scope="col">Subtotal</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.key} data-ready={isReady(row) || undefined}>
                <td>
                  <label className="bom-check">
                    <input
                      type="checkbox"
                      checked={isReady(row)}
                      onChange={() => toggle(row)}
                      aria-label={`Marcar como conseguido: ${row.name}${row.reference ? ` · ${row.reference}` : ""}`}
                    />
                    <Check size={13} aria-hidden="true" />
                  </label>
                </td>
                <td>
                  <strong>{row.name}</strong>
                  {row.reference && (
                    <span className="bom-reference">{row.reference}</span>
                  )}
                </td>
                <td className="bom-quantity">{row.quantity}</td>
                {showPrices && (
                  <>
                    <td>
                      <input
                        className="bom-price-input"
                        aria-label={`Precio de ${row.name}${row.reference ? ` · ${row.reference}` : ""}`}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        placeholder="Sin precio"
                        disabled={project.readOnly}
                        value={prices[row.key] ?? ""}
                        onChange={(e) => {
                          const next = {
                            ...((project.meta.get("assembly.prices") ??
                              {}) as Record<string, number>),
                          };
                          if (e.target.value === "") delete next[row.key];
                          else {
                            const value = Number(e.target.value);
                            if (!Number.isFinite(value)) return;
                            next[row.key] = Math.max(0, value);
                          }
                          project.setMeta("assembly.prices", next);
                        }}
                      />
                    </td>
                    <td className="bom-subtotal">
                      {prices[row.key] === undefined
                        ? "—"
                        : money(prices[row.key] * row.quantity)}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!visible.length && (
          <div className="bom-empty">
            <h3>
              {!rows.length
                ? "El circuito aún no tiene componentes"
                : search
                  ? "Sin coincidencias"
                  : "Todos los materiales están listos"}
            </h3>
            <p>
              {search
                ? "Prueba con el nombre o la referencia del componente."
                : !rows.length
                  ? "Añade componentes al circuito para generar la lista."
                  : "Puedes revisar la lista completa en Todos."}
            </p>
          </div>
        )}
      </div>
      <footer className="bom-footer">
        <span>
          <strong>
            {ready} de {rows.length}
          </strong>{" "}
          referencias listas{project.readOnly ? " · en esta sesión" : ""}
        </span>
        {showPrices && (
          <span className="bom-total">
            <span>
              {priced} de {rows.length} con precio
            </span>
            <strong>
              {currency} {priced ? money(total) : "—"}
            </strong>
          </span>
        )}
      </footer>
    </section>
  );
}
