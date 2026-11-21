import * as THREE from 'three';

/** 1 mm en unidades del documento (paso 2,54 mm = 10). */
export const MM = 10 / 2.54;
/** Altura del cuerpo de una protoboard (8,5 mm): la mesa queda por debajo. */
export const BOARD_H = 8.5 * MM;
export const TABLE_Y = -BOARD_H;

export type Theme3D = 'dark' | 'light';

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

let noiseTex: THREE.Texture | null = null;
/** Grano fino del plástico inyectado: rompe el brillo plano que delata un render. */
export function plasticNoise() {
  if (noiseTex) return noiseTex;
  const [c, g] = canvas(128, 128);
  const img = g.createImageData(128, 128);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 118 + rnd() * 20;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  noiseTex = new THREE.CanvasTexture(c);
  noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping;
  noiseTex.repeat.set(0.06, 0.06);
  return noiseTex;
}

let holeTex: THREE.Texture | null = null;
/** Orificio cuadrado de protoboard: embudo con cuatro paredes, contacto metálico al fondo. */
export function holeTexture() {
  if (holeTex) return holeTex;
  const S = 64;
  const [c, g] = canvas(S, S);
  const o = 4, i0 = 22, i1 = S - 22;
  const wall = (pts: number[][], color: string) => {
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts.slice(1)) g.lineTo(p[0], p[1]);
    g.closePath();
    g.fillStyle = color;
    g.fill();
  };
  // Borde levemente iluminado
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.fillRect(o - 2, o - 2, S - 2 * o + 4, S - 2 * o + 4);
  wall([[o, o], [S - o, o], [i1, i0], [i0, i0]], '#55534e'); // arriba (en sombra)
  wall([[o, o], [i0, i0], [i0, i1], [o, S - o]], '#6c6a64'); // izquierda
  wall([[S - o, o], [S - o, S - o], [i1, i1], [i1, i0]], '#8b8880'); // derecha
  wall([[o, S - o], [i0, i1], [i1, i1], [S - o, S - o]], '#a19d94'); // abajo (iluminada)
  const grad = g.createRadialGradient(S / 2, S / 2, 1, S / 2, S / 2, 12);
  grad.addColorStop(0, '#08090a');
  grad.addColorStop(1, '#1d1e1f');
  g.fillStyle = grad;
  g.fillRect(i0, i0, i1 - i0, i1 - i0);
  // Lengüeta del contacto (níquel)
  g.fillStyle = 'rgba(170,176,182,0.55)';
  g.fillRect(i0 + 2, S / 2 - 1, i1 - i0 - 4, 2);
  holeTex = new THREE.CanvasTexture(c);
  holeTex.colorSpace = THREE.SRGBColorSpace;
  holeTex.anisotropy = 4;
  return holeTex;
}

let sharedMats: Record<string, THREE.Material> | null = null;
/** Materiales PBR compartidos: una instancia por tipo para que el renderizador agrupe. */
export function mats() {
  if (sharedMats) return sharedMats;
  const noise = plasticNoise();
  sharedMats = {
    abs: new THREE.MeshStandardMaterial({ color: '#f4f2ec', roughness: 0.58, metalness: 0, bumpMap: noise, bumpScale: 0.25 }),
    absSide: new THREE.MeshStandardMaterial({ color: '#ebe8e0', roughness: 0.62, metalness: 0, bumpMap: noise, bumpScale: 0.25 }),
    channel: new THREE.MeshStandardMaterial({ color: '#d9d5cb', roughness: 0.75 }),
    hole: new THREE.MeshStandardMaterial({ map: holeTexture(), transparent: true, depthWrite: false, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    nickel: new THREE.MeshStandardMaterial({ color: '#c9ccd0', roughness: 0.28, metalness: 1 }),
    tin: new THREE.MeshStandardMaterial({ color: '#d8d9db', roughness: 0.22, metalness: 1 }),
    gold: new THREE.MeshStandardMaterial({ color: '#e6c27a', roughness: 0.25, metalness: 1 }),
    header: new THREE.MeshStandardMaterial({ color: '#141516', roughness: 0.55 }),
    epoxy: new THREE.MeshStandardMaterial({ color: '#1d1e20', roughness: 0.62, bumpMap: noise, bumpScale: 0.35 }),
    pvc: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.38, clearcoat: 0.35, clearcoatRoughness: 0.35 }),
  };
  return sharedMats;
}

/** Tapete de trabajo: goma mate con retícula de 10 mm, se funde con el fondo hacia el horizonte. */
export function tableTexture(theme: Theme3D) {
  const S = 512;
  const [c, g] = canvas(S, S);
  g.fillStyle = theme === 'dark' ? '#202225' : '#c4c7cc';
  g.fillRect(0, 0, S, S);
  g.strokeStyle = theme === 'dark' ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.06)';
  g.lineWidth = 2;
  for (let i = 0; i <= S; i += S / 4) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, S); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(S, i); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Sombra de contacto horneada (oclusión ambiental bajo cada pieza). */
let blobTex: THREE.Texture | null = null;
export function contactShadowTexture() {
  if (blobTex) return blobTex;
  const S = 64;
  const [c, g] = canvas(S, S);
  const grad = g.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.25)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  blobTex = new THREE.CanvasTexture(c);
  return blobTex;
}

export function shadowMaterial() {
  return new THREE.MeshBasicMaterial({ map: contactShadowTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
}

/** Rótulo en una textura de lienzo: texto nítido sobre la cara superior de un cuerpo. */
export function labelTexture(lines: string[], w: number, h: number, opts: { color?: string; bg?: string; font?: string; scale?: number } = {}) {
  const k = opts.scale ?? 6;
  const [c, g] = canvas(Math.max(8, Math.round(w * k)), Math.max(8, Math.round(h * k)));
  if (opts.bg) {
    g.fillStyle = opts.bg;
    g.fillRect(0, 0, c.width, c.height);
  }
  g.fillStyle = opts.color ?? 'rgba(235,235,235,0.85)';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const size = Math.min(c.height / (lines.length + 0.6), (c.width / Math.max(...lines.map((l) => l.length), 1)) * 1.6);
  g.font = `${opts.font ?? '600'} ${size}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
  lines.forEach((l, i) => g.fillText(l, c.width / 2, c.height / 2 + (i - (lines.length - 1) / 2) * size * 1.15));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function disposeObject(o: THREE.Object3D) {
  o.traverse((n) => {
    const m = n as THREE.Mesh;
    if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose();
    const list = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of list) {
      if (sharedMats && Object.values(sharedMats).includes(mat)) continue;
      if (mat.userData?.shared) continue;
      for (const v of Object.values(mat)) if (v instanceof THREE.Texture && !v.userData.shared && v !== noiseTex && v !== holeTex && v !== blobTex) v.dispose();
      mat.dispose();
    }
  });
}
