import { useEffect, useRef, useState } from 'react';
import { FileAudio, HardDrive, Music2, Plus, Trash2, UploadCloud } from 'lucide-react';
import { buildNetlist, pinKey } from '../core/netlist';
import type { CircuitSnapshot } from '../core/types';
import { PARTS } from '../parts';
import type { SimClient } from '../sim/client';

const EVENT = 'circuitstudio-audio-updated';
const db = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open('circuitstudio-audio', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('tracks');
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
const key = (room: string, part: string, track: number) => `${room}:${part}:${track}`;
async function getTrack(room: string, part: string, track: number): Promise<Blob | undefined> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('tracks', 'readonly');
    const request = tx.objectStore('tracks').get(key(room, part, track));
    request.onsuccess = () => resolve(request.result as Blob | undefined);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => database.close();
  });
}
async function saveTracks(room: string, part: string, files: File[]) {
  const database = await db();
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction('tracks', 'readwrite');
    for (const file of files) {
      const number = Number(file.name.match(/^(\d{1,4})\.(?:mp3|wav)$/i)?.[1]);
      if (!number || number > 9999) { tx.abort(); reject(new Error('Usa nombres como 0001.mp3 o 0002.mp3.')); return; }
      tx.objectStore('tracks').put(file, key(room, part, number));
    }
    tx.oncomplete = () => { database.close(); resolve(); };
    tx.onerror = () => { database.close(); reject(tx.error); };
    tx.onabort = () => database.close();
  });
  window.dispatchEvent(new Event(EVENT));
}

type Track = { number: number; name: string; size: number };

async function listTracks(room: string, part: string): Promise<Track[]> {
  const database = await db();
  const prefix = `${room}:${part}:`;
  return new Promise((resolve, reject) => {
    const tracks: Track[] = [];
    const tx = database.transaction('tracks', 'readonly');
    const request = tx.objectStore('tracks').openCursor(IDBKeyRange.bound(prefix, `${prefix}\uffff`));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const number = Number(String(cursor.key).slice(prefix.length));
      const file = cursor.value as File;
      if (Number.isInteger(number) && number > 0) tracks.push({ number, name: file.name || `${String(number).padStart(4, '0')}.mp3`, size: file.size });
      cursor.continue();
    };
    tx.oncomplete = () => { database.close(); resolve(tracks.sort((a, b) => a.number - b.number)); };
    tx.onerror = () => { database.close(); reject(tx.error); };
    tx.onabort = () => { database.close(); reject(tx.error); };
  });
}

async function removeTrack(room: string, part: string, number: number) {
  const database = await db();
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction('tracks', 'readwrite');
    tx.objectStore('tracks').delete(key(room, part, number));
    tx.oncomplete = () => { database.close(); resolve(); };
    tx.onerror = () => { database.close(); reject(tx.error); };
    tx.onabort = () => { database.close(); reject(tx.error); };
  });
  window.dispatchEvent(new Event(EVENT));
}

function fileSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function DFPlayerFiles({ room, part }: { room: string; part: string }) {
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let active = true;
    setTracks(null); setMessage(''); setRemoving(null);
    const refresh = () => { void listTracks(room, part).then((items) => { if (active) setTracks(items); }).catch(() => { if (active) { setError(true); setMessage('No se pudieron leer los archivos guardados.'); } }); };
    refresh(); window.addEventListener(EVENT, refresh);
    return () => { active = false; window.removeEventListener(EVENT, refresh); };
  }, [room, part]);
  const upload = async (files: File[]) => {
    if (!files.length || busy) return;
    setBusy(true); setMessage(''); setError(false);
    try {
      const numbers = files.map((file) => Number(file.name.match(/^(\d{1,4})\.(?:mp3|wav)$/i)?.[1]));
      if (numbers.some((number) => !number || number > 9999)) throw new Error('Usa nombres numerados como 0001.mp3 o 0002.wav.');
      if (new Set(numbers).size !== numbers.length) throw new Error('Cada pista debe tener un número diferente.');
      await saveTracks(room, part, files);
      setMessage(files.length === 1 ? 'Pista guardada.' : `${files.length} pistas guardadas.`);
    } catch (reason) { setError(true); setMessage(reason instanceof Error ? reason.message : 'No se pudieron guardar los archivos.'); }
    finally { setBusy(false); }
  };
  const remove = async (number: number) => {
    setBusy(true); setMessage(''); setError(false);
    try { await removeTrack(room, part, number); setRemoving(null); setMessage('Pista eliminada.'); }
    catch { setError(true); setMessage('No se pudo eliminar la pista.'); }
    finally { setBusy(false); }
  };
  return <section className="insp-section audio-files" aria-labelledby="audio-files-title">
    <div className="audio-files-heading"><div><h3 id="audio-files-title">Archivos de audio</h3><p>Biblioteca del DFPlayer</p></div><span className="audio-files-count">{tracks === null ? '…' : `${tracks.length} ${tracks.length === 1 ? 'pista' : 'pistas'}`}</span></div>
    <input ref={input} className="audio-files-input" type="file" tabIndex={-1} aria-hidden="true" multiple accept=".mp3,.wav,audio/mpeg,audio/wav" aria-label="Seleccionar archivos de audio" onChange={(event) => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ''; void upload(files); }} />
    {tracks?.length ? <div className="audio-track-list" aria-label="Pistas guardadas">{tracks.map((track) => <div className="audio-track" key={track.number}>
      <span className="audio-track-icon"><Music2 size={15} aria-hidden="true" /></span><span className="audio-track-info"><strong title={track.name}>{track.name}</strong><span>Pista {String(track.number).padStart(4, '0')} · {fileSize(track.size)}</span></span>
      {removing === track.number ? <span className="audio-track-confirm"><button type="button" onClick={() => void remove(track.number)} disabled={busy}>Eliminar</button><button type="button" onClick={() => setRemoving(null)}>Cancelar</button></span> : <button type="button" className="audio-track-remove" aria-label={`Eliminar ${track.name}`} onClick={() => setRemoving(track.number)}><Trash2 size={15} /></button>}
    </div>)}</div> : tracks && <div className={`audio-empty ${dragging ? 'is-dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); void upload(Array.from(event.dataTransfer.files)); }}>
      <span className="audio-empty-icon"><FileAudio size={19} aria-hidden="true" /></span><strong>Agrega tus pistas</strong><span>Arrastra archivos aquí o selecciónalos.</span>
    </div>}
    <button type="button" className="audio-upload" disabled={busy || tracks === null} onClick={() => input.current?.click()}>{tracks?.length ? <Plus size={15} /> : <UploadCloud size={15} />} {busy ? 'Guardando…' : tracks?.length ? 'Añadir pistas' : 'Seleccionar archivos'}</button>
    <p className="audio-files-format">MP3 o WAV · Ejemplo: <span>0001.mp3</span></p>
    <p className="audio-files-privacy"><HardDrive size={13} aria-hidden="true" /><span>Guardados solo en este navegador. No se comparten ni exportan.</span></p>
    {message && <p className={`audio-files-message ${error ? 'is-error' : ''}`} role={error ? 'alert' : 'status'}>{message}</p>}
  </section>;
}

export function useDFPlayerAudio(engine: SimClient, room: string, snapshot: CircuitSnapshot) {
  useEffect(() => {
    const players = snapshot.parts.filter((p) => p.type === 'dfplayer-mini');
    if (!players.length) return;
    const net = buildNetlist(snapshot, PARTS).netOf;
    const connected = (id: string) => {
      const a = net.get(pinKey(id, 'SPK1')), b = net.get(pinKey(id, 'SPK2'));
      return a !== undefined && b !== undefined && a !== b && snapshot.parts.some((p) => {
        if (p.type !== 'speaker-50mm') return false;
        const x = net.get(pinKey(p.id, 'A')), y = net.get(pinKey(p.id, 'B'));
        return (a === x && b === y) || (a === y && b === x);
      });
    };
    const active = new Map<string, { audio: HTMLAudioElement; url: string; token: string }>();
    const finished = new Map<string, string>();
    let disposed = false;
    const pending = new Map<string, string>();
    const stop = (id: string) => { const item = active.get(id); if (item) { item.audio.pause(); URL.revokeObjectURL(item.url); active.delete(id); } pending.delete(id); };
    const update = () => {
      for (const p of players) {
        const v = engine.getVisual(p.id);
        if (!engine.running || !v?.powered || !connected(p.id)) { stop(p.id); continue; }
        const token = `${v.track}:${v.sequence}`;
        const item = active.get(p.id);
        if (finished.get(p.id) === token) continue;
        if (engine.lab.paused || engine.lab.seeking || !v.playing) { if (item?.token === token) item.audio.pause(); else stop(p.id); continue; }
        if (item?.token === token) {
          item.audio.volume = Math.max(0, Math.min(1, Number(v.volume) / 30));
          if (item.audio.paused) void item.audio.play().catch(() => {});
          continue;
        }
        if (pending.get(p.id) === token) continue;
        stop(p.id);
        pending.set(p.id, token);
        void getTrack(room, p.id, Number(v.track)).then((blob) => {
          if (disposed || pending.get(p.id) !== token || !blob) return;
          const url = URL.createObjectURL(blob), audio = new Audio(url);
          audio.volume = Math.max(0, Math.min(1, Number(v.volume) / 30));
          active.set(p.id, { audio, url, token });
          audio.onended = () => { if (active.get(p.id)?.audio === audio) { finished.set(p.id, token); engine.setInput(p.id, 'finished', Number(v.sequence)); stop(p.id); } };
          void audio.play().catch(() => { stop(p.id); });
        }).catch(() => { pending.delete(p.id); });
      }
    };
    const refresh = () => { for (const id of pending.keys()) pending.delete(id); update(); };
    const unsubscribe = engine.subscribeStatus(update);
    window.addEventListener(EVENT, refresh);
    update();
    return () => { disposed = true; unsubscribe(); window.removeEventListener(EVENT, refresh); for (const id of active.keys()) stop(id); };
  }, [engine, room, snapshot]);
}
