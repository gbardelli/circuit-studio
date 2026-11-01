import { HintButton } from "./Overlays";
import { useState } from "react";
import { Check, Crosshair, LockKeyhole } from "lucide-react";
import { useEditor, useSnapshot } from "./context";
import { useUi } from "./store";
import { PARTS } from "../parts";
export interface CircuitNote {
  id: string;
  part: string;
  text: string;
  author: string;
  created: number;
  resolved: boolean;
  parent?: string;
}
export function circuitNotes(meta: IterableIterator<[string, unknown]>) {
  return [...meta]
    .filter(([key]) => key.startsWith("note:"))
    .map(([, note]) => note as CircuitNote)
    .filter((n) => n && typeof n.id === "string" && typeof n.text === "string");
}
export function Notes() {
  const { project } = useEditor(),
    snapshot = useSnapshot(),
    selection = useUi((s) => s.selection),
    select = useUi((s) => s.select);
  const [text, setText] = useState(""),
    [showResolved, setShowResolved] = useState(false),
    [reply, setReply] = useState<string | null>(null);
  const notes = circuitNotes(project.meta.entries()),
    roots = notes
      .filter((n) => !n.parent && (showResolved || !n.resolved))
      .sort((a, b) => a.created - b.created);
  const selected = snapshot.parts.find((p) => selection.includes(p.id));
  const send = () => {
    const parent = notes.find((n) => n.id === reply),
      part = parent?.part ?? selected?.id;
    if (!text.trim() || !part || project.readOnly) return;
    const id = crypto.randomUUID();
    project.setMeta(`note:${id}`, {
      id,
      part,
      text: text.trim().slice(0, 2000),
      author: project.user.name,
      created: Date.now(),
      resolved: false,
      ...(parent ? { parent: parent.id } : {}),
    });
    setText("");
    setReply(null);
  };
  return (
    <div className="notes-layout">
      <div className="notes-feed">
        <div className="lab-section-head">
          <span className="notes-count">
            {roots.length} {roots.length === 1 ? "comentario" : "comentarios"}
          </span>
          <label>
            <input
              type="checkbox"
              checked={showResolved}
              onChange={(e) => setShowResolved(e.target.checked)}
            />{" "}
            Resueltos
          </label>
        </div>
        {!roots.length ? (
          <div className="notes-empty">
            <strong>
              {!showResolved && notes.some(note=>!note.parent) ? "Sin comentarios pendientes" : "Sin comentarios"}
            </strong>
            <p>
              {project.readOnly
                ? "Los comentarios del equipo aparecerán aquí."
                : selected ? "Añade una observación para esta pieza." : "Selecciona una pieza del lienzo para comentar."}
            </p>
          </div>
        ) : (
          roots.map((note) => {
            const p = snapshot.parts.find((p) => p.id === note.part);
            const created = Number.isFinite(note.created)
              ? new Date(note.created)
              : null;
            return (
              <article
                className={`circuit-note ${note.resolved ? "resolved" : ""}`}
                key={note.id}
              >
                <header>
                  <HintButton
                    className="note-anchor"
                    disabled={!p}
                    onClick={() => select([note.part])}
                  >
                    <Crosshair size={14} aria-hidden="true" />
                    <span>
                      {p
                        ? String(
                            p.props.label ||
                              PARTS[p.type].partNumber ||
                              PARTS[p.type].name,
                          )
                        : "Componente eliminado"}
                    </span>
                  </HintButton>
                  {note.resolved && (
                    <span className="note-resolved">
                      <Check size={14} />
                      Resuelto
                    </span>
                  )}
                </header>
                <div className="note-author">
                  <strong>{note.author}</strong>
                  {created && (
                    <time
                      dateTime={created.toISOString()}
                      title={created.toLocaleString("es")}
                    >
                      {created.toLocaleString("es", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  )}
                </div>
                <p>{note.text}</p>
                {notes
                  .filter((n) => n.parent === note.id)
                  .map((n) => (
                    <div className="note-reply" key={n.id}>
                      <strong>{n.author}</strong>
                      <p>{n.text}</p>
                    </div>
                  ))}
                <footer>
                  <HintButton
                    disabled={project.readOnly}
                    onClick={() => {
                      setReply(note.id);
                      setText("");
                    }}
                  >
                    Responder
                  </HintButton>
                  <HintButton
                    disabled={project.readOnly}
                    onClick={() =>
                      project.setMeta(`note:${note.id}`, {
                        ...note,
                        resolved: !note.resolved,
                      })
                    }
                  >
                    <Check size={12} />
                    {note.resolved ? "Reabrir" : "Resolver"}
                  </HintButton>
                </footer>
              </article>
            );
          })
        )}
      </div>
      {project.readOnly ? (
        <aside className="note-compose note-readonly">
          <LockKeyhole size={18} aria-hidden="true" />
          <strong>Solo lectura</strong>
          <p>Necesitas acceso de edición para comentar.</p>
        </aside>
      ) : (
        <div className="note-compose">
          <div className="note-compose-heading">
            <strong>{reply ? "Respuesta" : "Nuevo comentario"}</strong>
            {reply && (
              <HintButton
                className="btn ghost"
                onClick={() => {
                  setReply(null);
                  setText("");
                }}
              >
                Cancelar
              </HintButton>
            )}
          </div>
          <span className="note-compose-target">
            {reply
              ? "En el hilo seleccionado"
              : selected
                ? String(
                    selected.props.label ||
                      PARTS[selected.type].partNumber ||
                      PARTS[selected.type].name,
                  )
                : "Selecciona una pieza del lienzo"}
          </span>
          <textarea
            aria-label="Comentario"
            placeholder="Escribe un comentario…"
            maxLength={2000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={project.readOnly || (!selected && !reply)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") send();
            }}
          />
          <div className="note-compose-actions">
            <span className="note-limit">
              {text.length > 1800 ? `${text.length} / 2000` : null}
            </span>
            <HintButton
              className="btn primary"
              disabled={
                !text.trim() || project.readOnly || (!selected && !reply)
              }
              onClick={send}
            >
              {reply ? "Responder" : "Comentar"}
            </HintButton>
          </div>
        </div>
      )}
    </div>
  );
}
