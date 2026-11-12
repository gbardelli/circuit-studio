import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { DFPlayerFiles } from './dfplayerAudio';

const pause = vi.fn();
const play = vi.fn(() => Promise.resolve());
class TestAudio {
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  pause = pause;
  play = play;
}
let renderer: ReactTestRenderer | undefined;
afterEach(() => { if (renderer) act(() => renderer!.unmount()); renderer = undefined; vi.unstubAllGlobals(); vi.restoreAllMocks(); pause.mockClear(); play.mockClear(); });

async function seed(file: File) {
  const request = indexedDB.open('circuitstudio-audio', 1);
  await new Promise<void>((resolve, reject) => {
    request.onupgradeneeded = () => request.result.createObjectStore('tracks');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const tx = database.transaction('tracks', 'readwrite');
      tx.objectStore('tracks').put(file, 'test-room:test-part:6');
      tx.oncomplete = () => { database.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  });
}

describe('DFPlayer audio preview', () => {
  it('plays a saved track on click, stops it and releases its object URL', async () => {
    vi.stubGlobal('window', new EventTarget());
    vi.stubGlobal('Audio', TestAudio);
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview');
    const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    await seed(new File(['audio'], '0006.wav', { type: 'audio/wav' }));
    await act(async () => { renderer = create(<DFPlayerFiles room="test-room" part="test-part" />); await new Promise(resolve => setTimeout(resolve, 40)); });
    const button = renderer!.root.findByProps({ 'aria-label': 'Reproducir 0006.wav' });
    await act(async () => { button.props.onClick(); await Promise.resolve(); });
    expect(createUrl).toHaveBeenCalledOnce();
    expect(play).toHaveBeenCalledOnce();
    expect(renderer!.root.findByProps({ 'aria-label': 'Detener 0006.wav' }).props['aria-pressed']).toBe(true);
    act(() => renderer!.root.findByProps({ 'aria-label': 'Detener 0006.wav' }).props.onClick());
    expect(pause).toHaveBeenCalledOnce();
    expect(revokeUrl).toHaveBeenCalledWith('blob:preview');
  });
});
