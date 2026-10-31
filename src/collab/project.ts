// Documento compartido del proyecto. Yjs garantiza la convergencia; las reglas
// eléctricas (redes derivadas, cables huérfanos) se aplican al leer, nunca se guardan.
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as awarenessProtocol from 'y-protocols/awareness';
import type { CircuitSnapshot, PartData, Props, Rotation, Vec, WireData, WireEnd } from '../core/types';
import { PARTS } from '../parts';
import { DEFAULT_SKETCH } from './sketch';
import { CLOUD, colorFor, sessionToken, sessionUser, type Role } from '../cloud';

export const LOCAL_ORIGIN = { local: true };

export interface UserInfo {
  id: string;
  name: string;
  color: string;
  image?: string | null;
}

export interface Presence {
  /** Id de cliente de Yjs: único por pestaña, aunque la misma persona abra varias. */
  clientId?: number;
  user: UserInfo;
  cursor: Vec | null;
  selection: string[];
  view?: 'board' | 'schematic';
  drag: { ids: string[]; dx: number; dy: number } | null;
}

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'local';

/** URL del servidor de salas. En desarrollo, el propio Vite lo enruta a /ws; en producción se configura con VITE_COLLAB_URL. */
function collabUrl(): string | null {
  const env = import.meta.env.VITE_COLLAB_URL as string | undefined;
  if (env) return env;
  if (CLOUD) return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/ws`;
  if (import.meta.env.DEV) return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  return null;
}

const NAMES = ['Ada', 'Nikola', 'Hedy', 'Alan', 'Grace', 'Marie', 'Georg', 'Rosalind', 'Claude', 'Lise', 'Emmy', 'André'];
export const PEER_COLORS = ['#b48cff', '#f2a65a', '#4cc38a', '#ff6b8a', '#5ab0ff', '#f2d14a', '#45d0c0', '#ff8f5a'];

export function localUser(): UserInfo {
  const signed = sessionUser();
  if (signed) return { id: signed.id, name: signed.name, image: signed.image, color: colorFor(signed.id) };
  try {
    const saved = localStorage.getItem('cs-user');
    if (saved) return JSON.parse(saved) as UserInfo;
  } catch {
    /* almacenamiento no disponible */
  }
  const user: UserInfo = {
    id: crypto.randomUUID(),
    name: NAMES[Math.floor(Math.random() * NAMES.length)],
    color: PEER_COLORS[Math.floor(Math.random() * PEER_COLORS.length)],
  };
  try {
    localStorage.setItem('cs-user', JSON.stringify(user));
  } catch {
    /* sin persistencia */
  }
  return user;
}

type YPart = Y.Map<unknown>;

export class Project {
  readonly doc = new Y.Doc();
  readonly parts = this.doc.getMap<YPart>('parts');
  readonly wires = this.doc.getMap<Y.Map<unknown>>('wires');
  readonly code = this.doc.getMap<Y.Text>('code');
  readonly meta = this.doc.getMap<unknown>('meta');
  readonly provider: WebsocketProvider | null;
  readonly awareness: awarenessProtocol.Awareness;
  readonly persistence: IndexeddbPersistence;
  readonly undo: Y.UndoManager;
  readonly user: UserInfo;
  connection: ConnectionState = 'connecting';
  synced = false;
  /** Quien solo puede ver no escribe en el documento (el servidor también lo impide). */
  readonly readOnly: boolean;
  private tokenTimer: ReturnType<typeof setInterval> | undefined;

  private cache = new Map<string, { json: string; data: PartData }>();
  private wireCache = new Map<string, { json: string; data: WireData }>();
  private snap: CircuitSnapshot = { parts: [], wires: [] };
  private stale = true;
  private listeners = new Set<() => void>();
  private scheduled = false;

  constructor(readonly room: string, readonly role: Role = 'owner') {
    this.user = role === 'viewer' && !sessionUser() ? { id: crypto.randomUUID(), name: 'Visitante', color: '#858c98' } : localUser();
    this.readOnly = role === 'viewer';
    this.persistence = new IndexeddbPersistence(`circuit-studio:${room}`, this.doc);
    const url = collabUrl();
    this.provider = url ? new WebsocketProvider(url, room, this.doc, { maxBackoffTime: 4000, connect: !CLOUD }) : null;
    if (this.provider && CLOUD) {
      // El token de sesión dura un minuto: se renueva antes de cada reconexión y cada 45 s.
      const provider = this.provider;
      const refresh = async () => {
        const token = await sessionToken();
        provider.params = { ...(this.readOnly ? { view: '1' } : {}), ...(token ? { token } : {}) };
      };
      void refresh().then(() => provider.connect());
      provider.on('connection-close', () => void refresh());
      this.tokenTimer = setInterval(() => void refresh(), 45_000);
    }
    this.awareness = this.provider?.awareness ?? new awarenessProtocol.Awareness(this.doc);
    if (this.provider) {
      this.provider.on('status', ({ status }: { status: ConnectionState }) => {
        this.connection = status;
        this.emit();
      });
      this.provider.on('sync', (synced: boolean) => {
        this.synced = synced;
        this.emit();
      });
    } else {
      // Sin servidor de salas: el circuito vive en este navegador (IndexedDB).
      this.connection = 'local';
      this.persistence.once('synced', () => {
        this.synced = true;
        this.emit();
      });
    }
    this.setPresence({ user: this.user, cursor: null, selection: [], drag: null });
    // El código entra en el ámbito para deshacer una restauración entera; lo que se teclea en el
    // editor de código llega con el origen de su enlace y conserva su propio deshacer.
    this.undo = new Y.UndoManager([this.parts, this.wires, this.code], { trackedOrigins: new Set([LOCAL_ORIGIN]), captureTimeout: 400 });
    this.doc.on('afterTransaction', () => {
      this.stale = true;
      this.emit();
    });
    this.awareness.on('change', () => this.emit());
  }

  destroy() {
    clearInterval(this.tokenTimer);
    this.awareness.setLocalState(null);
    this.provider?.destroy();
    if (!this.provider) this.awareness.destroy();
    this.persistence.destroy();
    this.doc.destroy();
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      this.listeners.forEach((l) => l());
    });
  }

  // ── Lectura ──────────────────────────────────────────────────────────────────
  snapshot(): CircuitSnapshot {
    if (!this.stale) return this.snap;
    const parts: PartData[] = [];
    const seen = new Set<string>();
    this.parts.forEach((ymap, id) => {
      const raw = ymap.toJSON() as Omit<PartData, 'id'>;
      if (!PARTS[raw.type]) return;
      const json = JSON.stringify(raw);
      seen.add(id);
      const hit = this.cache.get(id);
      if (hit && hit.json === json) {
        parts.push(hit.data);
        return;
      }
      const data: PartData = { id, type: raw.type, x: Number(raw.x) || 0, y: Number(raw.y) || 0, rot: (Number(raw.rot) || 0) as Rotation, props: { ...PARTS[raw.type].defaults, ...(raw.props ?? {}) } };
      if (Number.isFinite(raw.sx) && Number.isFinite(raw.sy)) {
        data.sx = Number(raw.sx);
        data.sy = Number(raw.sy);
        data.srot = (Number(raw.srot) || 0) as Rotation;
      }
      this.cache.set(id, { json, data });
      parts.push(data);
    });
    for (const id of this.cache.keys()) if (!seen.has(id)) this.cache.delete(id);

    const wires: WireData[] = [];
    const seenW = new Set<string>();
    this.wires.forEach((ymap, id) => {
      const raw = ymap.toJSON() as Omit<WireData, 'id'>;
      // Extremo cuyo componente ya no existe (borrado concurrente): queda suelto en su posición de respaldo.
      const fix = (end: WireEnd): WireEnd => (end.part && !seen.has(end.part) ? { x: end.x, y: end.y } : end);
      const fixed = { ...raw, a: fix(raw.a), b: fix(raw.b) };
      const json = JSON.stringify(fixed);
      seenW.add(id);
      const hit = this.wireCache.get(id);
      if (hit && hit.json === json) {
        wires.push(hit.data);
        return;
      }
      const data: WireData = { id, a: fixed.a, b: fixed.b, points: fixed.points ?? [], color: fixed.color ?? '#2fbf4a' };
      if (fixed.sch) data.sch = true;
      this.wireCache.set(id, { json, data });
      wires.push(data);
    });
    for (const id of this.wireCache.keys()) if (!seenW.has(id)) this.wireCache.delete(id);

    // Protoboards debajo, placas encima, el resto en orden de creación.
    const layer = (p: PartData) => (PARTS[p.type].category === 'Protoboards' ? 0 : PARTS[p.type].category === 'Placas' ? 1 : 2);
    parts.sort((a, b) => layer(a) - layer(b) || Number(this.parts.get(a.id)?.get('z') ?? 0) - Number(this.parts.get(b.id)?.get('z') ?? 0));
    this.snap = { parts, wires };
    this.stale = false;
    return this.snap;
  }

  get name() {
    return String(this.meta.get('name') ?? 'Proyecto sin título');
  }

  // ── Historial ────────────────────────────────────────────────────────────────
  /** El documento entero como actualización de Yjs: es lo que guarda una versión. */
  encodeState(): Uint8Array {
    return Y.encodeStateAsUpdate(this.doc);
  }

  /**
   * Deja el circuito como estaba en una versión: piezas, cables y código. El nombre se conserva.
   * Es una edición más del documento compartido: llega a todos y se deshace con Ctrl+Z.
   */
  restore(state: Uint8Array) {
    if (this.readOnly) return;
    const old = new Y.Doc();
    Y.applyUpdate(old, state);
    const copy = (src: Y.Map<unknown>) => {
      const m = new Y.Map<unknown>();
      src.forEach((v, k) => {
        if (v instanceof Y.Map) {
          const inner = new Y.Map<unknown>();
          v.forEach((iv, ik) => inner.set(ik, iv));
          m.set(k, inner);
        } else m.set(k, v);
      });
      return m;
    };
    // Un paso propio de deshacer: Ctrl+Z vuelve justo a lo que había antes de restaurar.
    this.undo.stopCapturing();
    this.tx(() => {
      for (const k of [...this.parts.keys()]) this.parts.delete(k);
      for (const k of [...this.wires.keys()]) this.wires.delete(k);
      for (const k of [...this.code.keys()]) this.code.delete(k);
      old.getMap<Y.Map<unknown>>('parts').forEach((m, k) => this.parts.set(k, copy(m) as YPart));
      old.getMap<Y.Map<unknown>>('wires').forEach((m, k) => this.wires.set(k, copy(m)));
      old.getMap<Y.Text>('code').forEach((t, k) => this.code.set(k, new Y.Text(t.toString())));
    });
    this.undo.stopCapturing();
    old.destroy();
  }

  peers(): Presence[] {
    const out: Presence[] = [];
    this.awareness.getStates().forEach((state, clientId) => {
      if (clientId === this.doc.clientID || !state?.user) return;
      out.push({ ...(state as Presence), clientId });
    });
    return out;
  }

  setPresence(patch: Partial<Presence>) {
    const aw = this.awareness;
    aw.setLocalState({ ...(aw.getLocalState() ?? {}), ...patch });
  }

  sketch(partId: string): Y.Text {
    let text = this.code.get(partId);
    if (!text && this.readOnly) return new Y.Text(DEFAULT_SKETCH);
    if (!text) {
      this.doc.transact(() => {
        text = new Y.Text(DEFAULT_SKETCH);
        this.code.set(partId, text);
      }, LOCAL_ORIGIN);
    }
    return text!;
  }

  // ── Escritura (siempre con origen local para el deshacer individual) ─────────
  private tx(fn: () => void) {
    if (this.readOnly) return;
    this.doc.transact(fn, LOCAL_ORIGIN);
  }

  setSketch(partId: string, source: string) {
    this.tx(() => {
      const text = this.code.get(partId);
      if (text) {
        text.delete(0, text.length);
        text.insert(0, source);
      } else {
        this.code.set(partId, new Y.Text(source));
      }
    });
  }

  setName(name: string) {
    this.tx(() => this.meta.set('name', name.slice(0, 120)));
  }

  setMeta(key:string,value:unknown) { this.tx(()=>this.meta.set(key,value)); }

  addPart(type: string, x: number, y: number, props: Props = {}, rot: Rotation = 0): string {
    const id = crypto.randomUUID();
    this.tx(() => {
      const m = new Y.Map<unknown>();
      m.set('type', type);
      m.set('x', x);
      m.set('y', y);
      m.set('rot', rot);
      m.set('z', Date.now());
      const p = new Y.Map<unknown>();
      for (const [k, v] of Object.entries(props)) p.set(k, v);
      m.set('props', p);
      this.parts.set(id, m);
      // El sketch nace con la placa, en la misma transacción, para que dos editores no creen dos.
      if (PARTS[type]?.mcu) this.code.set(id, new Y.Text(DEFAULT_SKETCH));
    });
    return id;
  }

  moveParts(moves: { id: string; x: number; y: number }[]) {
    this.tx(() => {
      for (const mv of moves) {
        const m = this.parts.get(mv.id);
        if (!m) continue;
        if (m.get('x') !== mv.x) m.set('x', mv.x);
        if (m.get('y') !== mv.y) m.set('y', mv.y);
      }
    });
  }

  /** A layout is one undoable operation; connectivity, code and properties stay untouched. */
  applyConnectionLayout(layout: CircuitSnapshot) {
    this.undo.stopCapturing();
    this.tx(() => {
      for (const p of layout.parts) {
        const m = this.parts.get(p.id);
        if (!m) continue;
        if (m.get('x') !== p.x) m.set('x', p.x);
        if (m.get('y') !== p.y) m.set('y', p.y);
      }
      for (const w of layout.wires) {
        const m = this.wires.get(w.id);
        if (!m) continue;
        if (JSON.stringify(m.get('points')) !== JSON.stringify(w.points)) m.set('points', w.points);
        if (m.get('color') !== w.color) m.set('color', w.color);
      }
    });
    this.undo.stopCapturing();
  }

  /** Posición de los símbolos en la vista de esquema. */
  moveSchematic(moves: { id: string; x: number; y: number }[]) {
    this.tx(() => {
      for (const mv of moves) {
        const m = this.parts.get(mv.id);
        if (!m) continue;
        m.set('sx', mv.x);
        m.set('sy', mv.y);
      }
    });
  }

  /** `current` es la posición de todos los símbolos: los que aún no tenían una fija la reciben,
   *  para que girar uno no recoloque la disposición automática del resto. */
  rotateSchematic(ids: string[], current: Map<string, { x: number; y: number }>) {
    this.tx(() => {
      for (const [id, at] of current) {
        const m = this.parts.get(id);
        if (m && m.get('sx') === undefined) {
          m.set('sx', at.x);
          m.set('sy', at.y);
        }
      }
      for (const id of ids) {
        const m = this.parts.get(id);
        if (m) m.set('srot', ((Number(m.get('srot')) || 0) + 90) % 360);
      }
    });
  }

  rotateParts(ids: string[]) {
    this.tx(() => {
      for (const id of ids) {
        const m = this.parts.get(id);
        if (m) m.set('rot', ((Number(m.get('rot')) || 0) + 90) % 360);
      }
    });
  }

  setProp(id: string, key: string, value: string | number | boolean) {
    this.tx(() => {
      const m = this.parts.get(id);
      const props = m?.get('props') as Y.Map<unknown> | undefined;
      if (props && props.get(key) !== value) props.set(key, value);
    });
  }

  deleteItems(partIds: string[], wireIds: string[]) {
    const gone = new Set(partIds);
    this.tx(() => {
      for (const id of wireIds) this.wires.delete(id);
      // Al borrar un componente se borran también sus cables (decisión local de quien borra).
      this.wires.forEach((w, id) => {
        const a = w.get('a') as WireEnd;
        const b = w.get('b') as WireEnd;
        if ((a.part && gone.has(a.part)) || (b.part && gone.has(b.part))) this.wires.delete(id);
      });
      for (const id of partIds) {
        this.parts.delete(id);
        this.code.delete(id);
      }
    });
  }

  addWire(a: WireEnd, b: WireEnd, points: Vec[], color: string, sch = false): string {
    const id = crypto.randomUUID();
    this.tx(() => {
      const m = new Y.Map<unknown>();
      m.set('a', a);
      m.set('b', b);
      m.set('points', points);
      m.set('color', color);
      if (sch) m.set('sch', true);
      this.wires.set(id, m);
    });
    return id;
  }

  updateWire(id: string, patch: Partial<Pick<WireData, 'points' | 'color' | 'a' | 'b'>>) {
    this.tx(() => {
      const m = this.wires.get(id);
      if (!m) return;
      for (const [k, v] of Object.entries(patch)) m.set(k, v);
    });
  }

  /** Duplica componentes (y los cables entre ellos) desplazados. Devuelve los ids nuevos. */
  duplicate(partIds: string[], dx: number, dy: number): string[] {
    const map = new Map<string, string>();
    const snap = this.snapshot();
    this.tx(() => {
      for (const p of snap.parts) {
        if (!partIds.includes(p.id)) continue;
        const id = crypto.randomUUID();
        map.set(p.id, id);
        const m = new Y.Map<unknown>();
        m.set('type', p.type);
        m.set('x', p.x + dx);
        m.set('y', p.y + dy);
        m.set('rot', p.rot);
        if (p.sx !== undefined && p.sy !== undefined) {
          m.set('sx', p.sx + dx);
          m.set('sy', p.sy + dy);
          m.set('srot', p.srot ?? 0);
        }
        m.set('z', Date.now());
        const props = new Y.Map<unknown>();
        for (const [k, v] of Object.entries(p.props)) props.set(k, v);
        m.set('props', props);
        this.parts.set(id, m);
        const code = this.code.get(p.id);
        if (code) this.code.set(id, new Y.Text(code.toString()));
      }
      for (const w of snap.wires) {
        if (!(w.a.part && map.has(w.a.part) && w.b.part && map.has(w.b.part))) continue;
        const m = new Y.Map<unknown>();
        m.set('a', { ...w.a, part: map.get(w.a.part), x: w.a.x + dx, y: w.a.y + dy });
        m.set('b', { ...w.b, part: map.get(w.b.part!), x: w.b.x + dx, y: w.b.y + dy });
        m.set('points', w.points.map((p) => ({ x: p.x + dx, y: p.y + dy })));
        m.set('color', w.color);
        if (w.sch) m.set('sch', true);
        this.wires.set(crypto.randomUUID(), m);
      }
    });
    return [...map.values()];
  }
}
