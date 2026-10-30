import { useState } from "react";
import { Check, MessageSquare, Send } from "lucide-react";
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
          <MessageSquare size={15} />
          <strong>Comentarios del circuito</strong>
          <label>
            <input
              type="checkbox"
              checked={showResolved}
              onChange={(e) => setShowResolved(e.target.checked)}
            />{" "}
            Mostrar resueltos
          </label>
        </div>
        {!roots.length ? (
          <div className="lab-empty">
            <strong>La revisión, donde ocurre.</strong>
            <p>
              Selecciona un componente y deja una observación. El comentario
              queda anclado a esa pieza y se comparte con el equipo.
            </p>
          </div>
        ) : (
          roots.map((note) => {
            const p = snapshot.parts.find((p) => p.id === note.part);
            return (
              <article
                className={`circuit-note ${note.resolved ? "resolved" : ""}`}
                key={note.id}
              >
                <header>
                  <button onClick={() => select([note.part])}>
                    {p
                      ? String(
                          p.props.label ||
                            PARTS[p.type].partNumber ||
                            PARTS[p.type].name,
                        )
                      : "Componente eliminado"}
                  </button>
                  <time>
                    {new Date(note.created).toLocaleTimeString("es", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </header>
                <strong>{note.author}</strong>
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
                  <button
                    disabled={project.readOnly}
                    onClick={() => setReply(note.id)}
                  >
                    Responder
                  </button>
                  <button
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
                  </button>
                </footer>
              </article>
            );
          })
        )}
      </div>
      <div className="note-compose">
        <span>
          {reply
            ? "Responder al comentario"
            : selected
              ? `Comentario en ${selected.props.label || PARTS[selected.type].partNumber || PARTS[selected.type].name}`
              : "Selecciona un componente del lienzo"}
        </span>
        <textarea
          aria-label="Comentario"
          placeholder="Qué revisar, qué cambiar, qué comprobar…"
          maxLength={2000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={project.readOnly || (!selected && !reply)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") send();
          }}
        />
        <div>
          <small>Compartido con quienes acceden al circuito.</small>
          <button
            className="btn sm"
            disabled={!text.trim() || project.readOnly || (!selected && !reply)}
            onClick={send}
          >
            <Send size={13} /> Publicar
          </button>
        </div>
      </div>
    </div>
  );
}
