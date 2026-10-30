import { useEffect, useMemo, useRef, useState } from "react";
import {
  Command,
  CornerDownLeft,
  Plus,
  Search,
  Workflow,
  X,
} from "lucide-react";
import { useEditor, useSnapshot } from "./context";
import { useUi } from "./store";
import { PART_LIST, PARTS } from "../parts";
import { toWorld } from "../core/types";
import { partBounds } from "./geometry";
export function CommandPalette() {
  const { project } = useEditor(),
    snapshot = useSnapshot(),
    open = useUi((s) => s.commandOpen),
    close = useUi((s) => s.setCommandOpen);
  const [query, setQuery] = useState(""),
    [active, setActive] = useState(0),
    [connecting, setConnecting] = useState(false),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const dialog = useRef<HTMLDialogElement>(null),
    input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) {
      dialog.current?.showModal();
      setQuery("");
      setActive(0);
      setConnecting(false);
      input.current?.focus();
    } else dialog.current?.close();
  }, [open]);
  useEffect(() => {
    if (open)
      dialog.current
        ?.querySelector('[role="option"][aria-selected="true"]')
        ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);
  const ui = useUi.getState;
  const actions = [
    {
      name: "Medir fluidez del lienzo",
      hint: "FPS, intervalo p95 y tareas largas del hilo de interfaz",
      run: () => ui().setPerformanceVisible(!ui().performanceVisible),
    },
    {
      name: "Analizador lógico",
      hint: "Observar señales y volver a un instante",
      run: () => ui().setLabPanel("signals"),
    },
    {
      name: "Diagnóstico eléctrico",
      hint: "Seguir redes y revisar conexiones",
      run: () => ui().setLabPanel("diagnostics"),
    },
    {
      name: "Modo montaje",
      hint: "Pasos, materiales y plano PDF",
      run: () => ui().setLabPanel("assembly"),
    },
    {
      name: "Comentarios",
      hint: "Revisiones ancladas a componentes",
      run: () => ui().setLabPanel("notes"),
    },
    {
      name: "Ver esquema",
      hint: "Cambiar a la vista lógica",
      run: () => ui().setView("schematic"),
    },
    {
      name: "Ver protoboard",
      hint: "Cambiar al montaje físico",
      run: () => ui().setView("board"),
    },
    {
      name: "Mostrar niveles lógicos",
      hint: "Capa de señal sobre los cables",
      run: () => ui().setSignalOverlay(!ui().signalOverlay),
    },
    {
      name: "Conectar dos pines",
      hint: "Elegir explícitamente origen y destino",
      run: () => {
        setConnecting(true);
        return false;
      },
    },
    {
      name: "Deshacer",
      hint: "Revertir tu última edición",
      run: () => project.undo.undo(),
    },
  ];
  const clean = query
    .toLowerCase()
    .replace(/^(añade|agrega|añadir|add)\s+(un\s+|una\s+)?/, "")
    .split(/\s+y\s+con[eé]cta/)[0]
    .trim();
  const results = useMemo(
    () =>
      [
        ...actions
          .filter(
            (a) =>
              a.name.toLowerCase().includes(query.toLowerCase()) ||
              a.hint.toLowerCase().includes(query.toLowerCase()),
          )
          .map((a) => ({ ...a, type: "action" as const })),
        ...PART_LIST.filter(
          (p) =>
            p.name.toLowerCase().includes(clean) ||
            p.type.includes(clean) ||
            p.partNumber?.toLowerCase().includes(clean) ||
            p.keywords.some((k) => k.includes(clean)),
        )
          .slice(0, 20)
          .map((p) => ({
            name: p.partNumber ?? p.name,
            hint: p.partNumber ? p.name : p.description,
            type: "part" as const,
            run: () => {
              if (project.readOnly) return;
              if (/reloj|clock/i.test(query) && /con[eé]cta/i.test(query)) {
                const clocks = snapshot.parts.filter(
                  (part) => part.type === "clock",
                );
                const pin = ["CP", "CLK", "CPU", "1CLK"].find((pin) =>
                  p.pins(p.defaults).some((d) => d.id === pin),
                );
                if (clocks.length !== 1 || !pin) {
                  ui().showToast(
                    "Selecciona los pines de origen y destino para evitar una conexión ambigua.",
                  );
                  setConnecting(true);
                  return false;
                }
                const right = Math.max(
                  0,
                  ...snapshot.parts.map((part) => {
                    const b = partBounds(part);
                    return b.x + b.w;
                  }),
                );
                const id = project.addPart(
                  p.type,
                  Math.ceil((right + 60) / 10) * 10,
                  clocks[0].y,
                );
                const created = project
                    .snapshot()
                    .parts.find((part) => part.id === id)!,
                  out = PARTS.clock
                    .pins(clocks[0].props)
                    .find((d) => d.id === "OUT")!,
                  into = p.pins(p.defaults).find((d) => d.id === pin)!;
                project.addWire(
                  {
                    ...toWorld(clocks[0], out),
                    part: clocks[0].id,
                    pin: "OUT",
                  },
                  { ...toWorld(created, into), part: id, pin },
                  [],
                  "#e1b65b",
                );
                ui().select([id]);
                ui().showToast(
                  `${p.partNumber ?? p.name}: ${pin} conectado al reloj.`,
                  "ok",
                );
              } else ui().setPlacing(p.type);
            },
          })),
      ].slice(0, 24),
    [query, snapshot, project.readOnly],
  );
  const execute = (index: number) => {
    const result = results[index];
    if (!result) return;
    if (result.run() !== false) close(false);
  };
  const pins = snapshot.parts
    .filter((p) => PARTS[p.type].category !== "Protoboards")
    .flatMap((p) =>
      PARTS[p.type].pins(p.props).map((pin) => ({
        value: JSON.stringify([p.id, pin.id]),
        name: `${p.props.label || PARTS[p.type].partNumber || PARTS[p.type].name} · ${pin.id}`,
      })),
    );
  const connect = () => {
    if (!from || !to || from === to || project.readOnly) return;
    const end = (value: string) => {
      const [id, pin] = JSON.parse(value) as string[];
      const p = snapshot.parts.find((p) => p.id === id)!,
        def = PARTS[p.type].pins(p.props).find((p) => p.id === pin)!;
      return { ...toWorld(p, def), part: id, pin };
    };
    project.addWire(end(from), end(to), [], "#6c9de8");
    close(false);
    ui().showToast("Conexión creada.", "ok");
  };
  return (
    <dialog
      ref={dialog}
      className="command-dialog"
      onCancel={() => close(false)}
      onClick={(e) => {
        if (e.target === e.currentTarget) close(false);
      }}
      onClose={() => close(false)}
    >
      <div className="command-box">
        <div className="command-input">
          <Search size={18} />
          <input
            ref={input}
            aria-label="Buscar acciones y componentes"
            placeholder="Busca, añade, conecta…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (connecting) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(results.length - 1, a + 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              }
              if (e.key === "Enter") {
                e.preventDefault();
                execute(active);
              }
            }}
          />
          <button
            className="icon-btn"
            aria-label="Cerrar comandos"
            onClick={() => close(false)}
          >
            <X size={15} />
          </button>
        </div>
        {connecting ? (
          <div className="connect-command">
            <h3>Conectar dos pines</h3>
            <p>La conexión usa los pines reales de ambos componentes.</p>
            <label>
              Desde
              <select
                aria-label="Pin de origen"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              >
                <option value="">Elegir pin…</option>
                {pins.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Hasta
              <select
                aria-label="Pin de destino"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              >
                <option value="">Elegir pin…</option>
                {pins.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="btn"
              disabled={!from || !to || from === to || project.readOnly}
              onClick={connect}
            >
              <Workflow size={14} /> Crear conexión
            </button>
          </div>
        ) : (
          <div
            className="command-results"
            role="listbox"
            aria-label="Resultados"
          >
            {results.length ? (
              results.map((result, i) => (
                <button
                  role="option"
                  aria-selected={active === i}
                  key={`${result.type}-${result.name}`}
                  className={active === i ? "active" : ""}
                  disabled={project.readOnly && result.type === "part"}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => execute(i)}
                >
                  {result.type === "part" ? (
                    <Plus size={16} />
                  ) : (
                    <Command size={15} />
                  )}
                  <span>
                    <strong>{result.name}</strong>
                    <small>{result.hint}</small>
                  </span>
                  {active === i && <CornerDownLeft size={14} />}
                </button>
              ))
            ) : (
              <div className="lab-empty">
                No hay resultados para esta búsqueda.
              </div>
            )}
          </div>
        )}
        <footer>
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> navegar
          </span>
          <span>
            <kbd>↵</kbd> ejecutar
          </span>
          <span>
            <kbd>esc</kbd> cerrar
          </span>
        </footer>
      </div>
    </dialog>
  );
}
