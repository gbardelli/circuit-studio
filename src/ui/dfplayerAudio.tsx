import { useEffect, useState } from 'react';
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

export function DFPlayerFiles({ room, part }: { room: string; part: string }) {
  const [message, setMessage] = useState('');
  return <div className="insp-section"><h3>Archivos de audio</h3>
    <label className="btn sm" style={{ display: 'inline-flex', cursor: 'pointer' }}>Cargar pistas
      <input type="file" multiple accept=".mp3,.wav,audio/mpeg,audio/wav" style={{ display: 'none' }} onChange={(event) => {
        const files = Array.from(event.currentTarget.files ?? []);
        event.currentTarget.value = '';
        if (!files.length) return;
        void saveTracks(room, part, files).then(() => setMessage(`${files.length} archivo(s) cargado(s).`)).catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'No se pudieron guardar los archivos.'));
      }} />
    </label>
    <p className="insp-hint">Nómbralos 0001.mp3, 0002.mp3… Se guardan solo en este navegador; no se comparten ni exportan.</p>
    {message && <p className="insp-hint" role="status">{message}</p>}
  </div>;
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
