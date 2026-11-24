import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { CircuitSnapshot } from '../../core/types';
import { CircuitScene } from './scene';
import { onSkinReady } from './skin';
import { Highlighter, type Focus } from './highlight';
import { Labels } from './labels';
import { MM, TABLE_Y, tableTexture, type Theme3D } from './materials';

export type Preset = 'top' | 'iso' | 'free';

interface Cam {
  tx: number;
  tz: number;
  dist: number;
  yaw: number;
  tilt: number;
}

const FOV = 28;
const MAX_TILT = THREE.MathUtils.degToRad(78);
const ISO: Pick<Cam, 'yaw' | 'tilt'> = { yaw: THREE.MathUtils.degToRad(-28), tilt: THREE.MathUtils.degToRad(52) };
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

export interface Stats {
  firstFrame: number;
  build: number;
  calls: number;
  triangles: number;
  frameMs: number;
}

export interface ViewerEvents {
  onPick(hit: { part?: string; wire?: string } | null, additive: boolean): void;
  onHover?(hit: { part?: string; wire?: string } | null): void;
  onStats?(s: Stats): void;
  /** Toque sobre una pieza: si la pieza lo consume (pulsador, interruptor, mando), la cámara no se mueve. */
  onPartPointerDown?(partId: string, point: THREE.Vector3, e: PointerEvent): boolean;
}

/** Visor 3D: una sola cámara que va de cenital a perspectiva; renderiza solo cuando algo cambia. */
export class Viewer3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(FOV, 1, 1, 40000);
  readonly circuit = new CircuitScene();
  readonly highlighter = new Highlighter(this.circuit);
  private labels: Labels;
  private focus: Focus = { parts: [], wires: [], hoverPart: null, hoverWire: null, net: null };
  private cam: Cam = { tx: 0, tz: 0, dist: 1000, yaw: 0, tilt: 0 };
  private goal: Cam = { ...this.cam };
  private anim: { from: Cam; to: Cam; t0: number; ms: number; done?: () => void } | null = null;
  private raf = 0;
  private key: THREE.DirectionalLight;
  private table: THREE.Mesh;
  theme: Theme3D = 'dark';
  private ro: ResizeObserver;
  private composer: EffectComposer;
  private gtao: GTAOPass;
  /** Calidad final (oclusión ambiental) solo cuando la imagen está quieta. */
  ambientOcclusion = true;
  private offSkin: () => void;
  private width = 1;
  private height = 1;
  private dprFull: number;
  private interacting = 0;
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private shadowsDirty = true;
  stats: Stats = { firstFrame: 0, build: 0, calls: 0, triangles: 0, frameMs: 0 };
  private firstFrameFrom = 0;
  freeCam: Cam | null = null;
  reduceMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(private host: HTMLElement, private events: ViewerEvents, clickedAt = performance.now()) {
    this.firstFrameFrom = clickedAt;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', alpha: false });
    this.dprFull = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(this.dprFull);
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none';
    this.renderer.domElement.tabIndex = 0;
    host.appendChild(this.renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    pmrem.dispose();

    // Luz principal de estudio (sombras), relleno cálido desde abajo-izquierda.
    this.key = new THREE.DirectionalLight('#fffaf2', 2.1);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.0003;
    this.key.shadow.normalBias = 0.5;
    this.key.shadow.radius = 4;
    this.scene.add(this.key, this.key.target);
    // Relleno frío sin sombras desde el lado opuesto y un contraluz que recorta los bordes.
    const fill = new THREE.DirectionalLight('#dce6ff', 0.22);
    fill.position.set(0.7, 0.55, 0.8);
    const rim = new THREE.DirectionalLight('#fff4e6', 0.3);
    rim.position.set(0.2, 0.35, -1);
    this.scene.add(fill, rim, new THREE.HemisphereLight('#eef3ff', '#3a3530', 0.18));

    this.table = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ roughness: 0.92 }));
    this.table.receiveShadow = true;
    this.table.position.y = TABLE_Y;
    this.table.userData.noPick = true;
    this.scene.add(this.table, this.circuit.root, this.highlighter.root);
    this.labels = new Labels(host);
    this.setTheme('dark');

    this.offSkin = onSkinReady(() => this.invalidate());
    // Oclusión ambiental (GTAO) en reposo: contacto oscuro bajo cada pieza, cable y pata.
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.gtao = new GTAOPass(this.scene, this.camera, 512, 512);
    this.gtao.updateGtaoMaterial({ radius: 26, distanceExponent: 1.4, thickness: 10, scale: 1.6, samples: 16, distanceFallOff: 1, screenSpaceRadius: false });
    this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 16 });
    this.gtao.blendIntensity = 1;
    this.composer.addPass(this.gtao);
    this.composer.addPass(new OutputPass());
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    this.bindInput();
  }

  setTheme(theme: Theme3D) {
    this.theme = theme;
    this.highlighter.setTheme(theme);
    if (this.labels) this.setFocus(this.focus);
    const bg = new THREE.Color(theme === 'dark' ? '#0b0c0e' : '#dfe2e6');
    this.scene.background = bg;
    this.scene.fog = new THREE.Fog(bg, 1000, 4000);
    const mat = this.table.material as THREE.MeshStandardMaterial;
    mat.map?.dispose();
    mat.map = tableTexture(theme);
    mat.color.set('#ffffff');
    mat.needsUpdate = true;
    this.fitLighting();
    this.scene.environmentIntensity = theme === 'dark' ? 0.32 : 0.45;
    this.key.intensity = theme === 'dark' ? 3.1 : 3.3;
    this.invalidate();
  }

  setCircuit(snap: CircuitSnapshot) {
    this.highlighter.clear();
    const ms = this.circuit.update(snap);
    this.highlighter.apply(this.focus);
    if (!this.stats.build || ms > 1) this.stats.build = ms;
    this.fitLighting();
    this.shadowsDirty = true;
    this.invalidate();
  }

  /** Selección, paso del cursor y red comprobada (se mantiene al reconstruir la escena). */
  setFocus(f: Focus) {
    this.focus = f;
    this.highlighter.apply(f);
    this.invalidate();
  }

  /** Encuadra una pieza: doble clic sobre ella o selección desde otro panel. */
  frameParts(ids: string[]) {
    const box = new THREE.Box3();
    for (const id of ids) {
      const e = this.circuit.parts.get(id);
      if (e) box.expandByObject(e.obj);
    }
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const dist = Math.max(160, Math.max(size.x, size.z) * 1.6 / Math.tan(THREE.MathUtils.degToRad(FOV / 2)) / 2);
    this.animateTo({ ...this.cam, tx: c.x, tz: c.z, dist, tilt: Math.max(this.cam.tilt, 0.6) }, 520);
  }

  /** Estado de la simulación en las piezas que lo muestran (LED, segmentos). */
  setVisual(partId: string, visual: import('../../parts/types').Visual | null) {
    this.lastVisual.set(partId, visual);
    const e = this.circuit.parts.get(partId);
    if (!e?.model.update) return;
    const o = this.overrides.get(partId);
    e.model.update(o ? { ...(visual ?? {}), ...o } : visual);
    this.invalidate();
  }

  /** Entrada local inmediata (botón pulsado): se ve al instante, sin esperar a la simulación. */
  setInputOverride(partId: string, key: string, value: number | boolean) {
    this.overrides.set(partId, { ...(this.overrides.get(partId) ?? {}), [key]: value });
    this.setVisual(partId, this.lastVisual.get(partId) ?? null);
  }

  private lastVisual = new Map<string, import('../../parts/types').Visual | null>();
  private overrides = new Map<string, Record<string, number | boolean>>();

  /** Piezas cuyo modelo refleja la simulación. */
  livePartIds() {
    return [...this.circuit.parts.entries()].filter(([, e]) => e.model.update).map(([id]) => id);
  }

  /** Luz y mesa a la medida del montaje: sombras nítidas sin desperdiciar resolución. */
  private fitLighting() {
    const b = this.circuit.bounds;
    const c = b.isEmpty() ? new THREE.Vector3() : b.getCenter(new THREE.Vector3());
    const size = b.isEmpty() ? 400 : Math.max(b.max.x - b.min.x, b.max.z - b.min.z, 200);
    const half = size * 0.75 + 60;
    // Luz de estudio baja (≈38°) desde atrás a la izquierda: sombras largas hacia quien mira.
    const dir = new THREE.Vector3(-0.75, 0.82, -0.62).normalize();
    this.key.position.copy(c).addScaledVector(dir, size * 2);
    this.key.target.position.copy(c);
    const sc = this.key.shadow.camera;
    sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half;
    sc.near = 1; sc.far = size * 4;
    sc.updateProjectionMatrix();
    const tile = 40 * MM;
    const span = Math.max(8000, size * 12);
    this.table.scale.set(span, 1, span);
    this.table.position.set(c.x, TABLE_Y, c.z);
    const map = (this.table.material as THREE.MeshStandardMaterial).map;
    if (map) {
      map.repeat.set(span / tile, span / tile);
      map.offset.set((c.x / tile) % 1, (-c.z / tile) % 1);
    }
  }

  /** Encuadre equivalente al del lienzo 2D: misma escala y centro, cámara cenital. */
  fromViewport(vp: { x: number; y: number; zoom: number }): Cam {
    const w = this.width, h = this.height;
    const visibleH = h / vp.zoom;
    return {
      tx: (w / 2 - vp.x) / vp.zoom,
      tz: (h / 2 - vp.y) / vp.zoom,
      dist: visibleH / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2)),
      yaw: 0,
      tilt: 0,
    };
  }

  toViewport(): { x: number; y: number; zoom: number } {
    const c = this.cam;
    const visibleH = 2 * c.dist * Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const zoom = this.height / visibleH;
    return { x: this.width / 2 - c.tx * zoom, y: this.height / 2 - c.tz * zoom, zoom };
  }

  /** Arranca en el mismo encuadre cenital que el lienzo 2D: el primer fotograma coincide con él. */
  enter(vp: { x: number; y: number; zoom: number }) {
    const top = this.fromViewport(vp);
    this.cam = { ...top };
    this.goal = { ...top };
    this.invalidate();
  }

  /** Tras el fundido sobre el 2D, la cámara se inclina a la vista isométrica. */
  reveal() {
    this.preset('iso', this.cam);
  }

  exit(done: () => void) {
    const to = { ...this.cam, yaw: Math.round(this.cam.yaw / (Math.PI * 2)) * Math.PI * 2, tilt: 0 };
    this.animateTo(to, 520, done);
  }

  preset(p: Preset, base = this.cam) {
    if (p === 'free') {
      if (this.freeCam) this.animateTo(this.freeCam, 600);
      return;
    }
    if (this.cam.tilt > 0.02 || Math.abs(this.cam.yaw) > 0.02) this.freeCam = { ...this.cam };
    const b = this.circuit.bounds;
    const fit = !b.isEmpty();
    const c = fit ? b.getCenter(new THREE.Vector3()) : new THREE.Vector3(base.tx, 0, base.tz);
    const size = fit ? b.getSize(new THREE.Vector3()) : new THREE.Vector3(400, 0, 300);
    const aspect = this.width / this.height;
    const fitDist = (Math.max(size.z, size.x / aspect) * 0.56) / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const dist = p === 'top' ? fitDist : fitDist * 0.98;
    const to: Cam = p === 'top' ? { tx: c.x, tz: c.z, dist, yaw: 0, tilt: 0 } : { tx: c.x, tz: c.z, dist, ...ISO };
    this.animateTo(to, 900);
  }

  private animateTo(to: Cam, ms: number, done?: () => void) {
    if (this.reduceMotion) {
      this.cam = { ...to };
      this.goal = { ...to };
      this.anim = null;
      this.invalidate();
      done?.();
      return;
    }
    // Ruta corta para el giro.
    const from = { ...this.cam };
    let dy = to.yaw - from.yaw;
    dy = ((dy + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    this.anim = { from, to: { ...to, yaw: from.yaw + dy }, t0: performance.now(), ms, done };
    this.invalidate();
  }

  invalidate() {
    if (!this.raf) this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    this.raf = 0;
    let again = false;
    if (this.anim) {
      const k = Math.min(1, (now - this.anim.t0) / this.anim.ms);
      const e = ease(k);
      const { from, to } = this.anim;
      // Distancia en escala logarítmica: el zoom se percibe uniforme.
      this.cam = {
        tx: from.tx + (to.tx - from.tx) * e,
        tz: from.tz + (to.tz - from.tz) * e,
        dist: Math.exp(Math.log(from.dist) + (Math.log(to.dist) - Math.log(from.dist)) * e),
        yaw: from.yaw + (to.yaw - from.yaw) * e,
        tilt: from.tilt + (to.tilt - from.tilt) * e,
      };
      this.goal = { ...this.cam };
      if (k >= 1) {
        const done = this.anim.done;
        this.anim = null;
        done?.();
      } else again = true;
    } else {
      // Inercia: la cámara alcanza su meta con amortiguación crítica.
      const c = this.cam, g = this.goal;
      const f = 0.32;
      let moving = false;
      for (const k of ['tx', 'tz', 'yaw', 'tilt'] as const) {
        const d = g[k] - c[k];
        if (Math.abs(d) > 1e-4) {
          c[k] += d * f;
          moving = true;
        } else c[k] = g[k];
      }
      const dl = Math.log(g.dist) - Math.log(c.dist);
      if (Math.abs(dl) > 1e-4) {
        c.dist = Math.exp(Math.log(c.dist) + dl * f);
        moving = true;
      } else c.dist = g.dist;
      again = moving;
    }
    this.applyCamera();
    const t0 = performance.now();
    if (this.shadowsDirty) {
      this.renderer.shadowMap.needsUpdate = true;
      this.shadowsDirty = false;
    }
    if (this.ambientOcclusion && !again && !this.interacting) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    const focusIds = new Set(this.focus.parts);
    if (this.focus.hoverPart) focusIds.add(this.focus.hoverPart);
    this.labels.update(this.circuit, this.camera, this.width, this.height, this.cam.dist, focusIds);
    this.stats.frameMs = performance.now() - t0;
    this.stats.calls = this.renderer.info.render.calls;
    this.stats.triangles = this.renderer.info.render.triangles;
    if (!this.stats.firstFrame) {
      this.stats.firstFrame = performance.now() - this.firstFrameFrom;
    }
    this.events.onStats?.(this.stats);
    if (again) this.invalidate();
  };

  private applyCamera() {
    const c = this.cam;
    const tilt = Math.max(0.0005, c.tilt);
    const target = new THREE.Vector3(c.tx, 0, c.tz);
    this.camera.position.set(
      c.tx + c.dist * Math.sin(tilt) * Math.sin(c.yaw),
      c.dist * Math.cos(tilt),
      c.tz + c.dist * Math.sin(tilt) * Math.cos(c.yaw),
    );
    // Inclinación mínima no nula: en cenital «arriba» en pantalla sigue siendo −z (como el 2D).
    this.camera.up.set(0, 1, 0);
    this.camera.near = Math.max(0.5, c.dist * 0.02);
    this.camera.far = c.dist * 12 + 2000;
    this.camera.lookAt(target);
    this.camera.updateProjectionMatrix();
    const fog = this.scene.fog as THREE.Fog;
    fog.near = c.dist * 1.6;
    fog.far = c.dist * 5.5;
  }

  private resize() {
    const r = this.host.getBoundingClientRect();
    this.width = Math.max(1, r.width);
    this.height = Math.max(1, r.height);
    this.renderer.setSize(this.width, this.height, false);
    this.composer?.setPixelRatio(this.renderer.getPixelRatio());
    this.composer?.setSize(this.width, this.height);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.invalidate();
  }

  /** Durante el gesto baja la resolución; al soltar, vuelve la nitidez completa. */
  private busy() {
    if (!this.interacting) {
      this.renderer.setPixelRatio(Math.min(this.dprFull, 1.25));
      this.composer.setPixelRatio(Math.min(this.dprFull, 1.25));
    }
    this.interacting++;
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.interacting = 0;
      this.renderer.setPixelRatio(this.dprFull);
      this.composer.setPixelRatio(this.dprFull);
      this.invalidate();
    }, 160);
  }

  // ---------- Entrada: Maps/Figma ----------
  private ray = new THREE.Raycaster();
  private ndc(x: number, y: number) {
    const r = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  }
  /** Punto del plano de la protoboard bajo el cursor (usa la cámara de la meta, no la interpolada). */
  private groundAt(x: number, y: number, cam: Cam = this.goal) {
    const saved = this.cam;
    this.cam = cam;
    this.applyCamera();
    this.camera.updateMatrixWorld();
    this.ray.setFromCamera(this.ndc(x, y), this.camera);
    this.cam = saved;
    this.applyCamera();
    const p = new THREE.Vector3();
    return this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p) ? p : null;
  }

  /** Pieza y punto exacto bajo el cursor (para trasladar el toque a su dibujo 2D). */
  pickPoint(x: number, y: number): { part: string; point: THREE.Vector3 } | null {
    this.camera.updateMatrixWorld();
    this.ray.setFromCamera(this.ndc(x, y), this.camera);
    for (const h of this.ray.intersectObject(this.circuit.root, true)) {
      if (h.object.userData.wires) return null;
      if (!h.object.userData.noPick && h.object.userData.part) return { part: h.object.userData.part as string, point: h.point };
    }
    return null;
  }

  /** Píxeles por unidad del documento en un punto de la escena (escala del toque). */
  pixelsPerUnit(p: THREE.Vector3) {
    const a = p.clone().project(this.camera), b = p.clone().add(new THREE.Vector3(10, 0, 0)).project(this.camera);
    const c = p.clone().add(new THREE.Vector3(0, 0, 10)).project(this.camera);
    const sx = Math.hypot((b.x - a.x) * this.width, (b.y - a.y) * this.height) / 2 / 10;
    const sz = Math.hypot((c.x - a.x) * this.width, (c.y - a.y) * this.height) / 2 / 10;
    return Math.max(0.5, (sx + sz) / 2);
  }

  pick(x: number, y: number): { part?: string; wire?: string } | null {
    this.camera.updateMatrixWorld();
    this.ray.setFromCamera(this.ndc(x, y), this.camera);
    const hits = this.ray.intersectObject(this.circuit.root, true);
    for (const h of hits) {
      const o = h.object;
      if (o.userData.noPick) continue;
      if (o.userData.wires && h.faceIndex != null && this.circuit.wires) {
        const i = h.faceIndex * 3;
        const r = this.circuit.wires.ranges.find((q) => i >= q.start && i < q.end);
        if (r) return { wire: r.id };
      }
      if (o.userData.part) return { part: o.userData.part as string };
    }
    return null;
  }

  private bindInput() {
    const el = this.renderer.domElement;
    const pointers = new Map<number, { x: number; y: number }>();
    let mode: 'pan' | 'orbit' | null = null;
    let downAt = { x: 0, y: 0, t: 0 };
    let moved = false;
    let grab: THREE.Vector3 | null = null;
    let pinch: { d: number; a: number; mx: number; my: number } | null = null;
    let hoverAt: { x: number; y: number } | null = null;
    let hoverRaf = 0;
    el.addEventListener('pointerleave', () => {
      hoverAt = null;
      this.events.onHover?.(null);
    });

    const stopAnim = () => {
      if (this.anim) {
        this.anim = null;
        this.goal = { ...this.cam };
      }
    };
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      el.focus({ preventScroll: true });
      if (e.button === 0 && !e.shiftKey && !e.altKey && pointers.size === 0 && this.events.onPartPointerDown) {
        const hit = this.pickPoint(e.clientX, e.clientY);
        if (hit && this.events.onPartPointerDown(hit.part, hit.point, e)) return;
      }
      el.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      stopAnim();
      moved = false;
      downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
      if (pointers.size === 1) {
        mode = e.button === 2 || e.button === 1 || e.shiftKey || e.altKey ? 'orbit' : 'pan';
        grab = mode === 'pan' ? this.groundAt(e.clientX, e.clientY) : null;
      } else if (pointers.size === 2) {
        const [p, q] = [...pointers.values()];
        pinch = { d: Math.hypot(p.x - q.x, p.y - q.y), a: Math.atan2(q.y - p.y, q.x - p.x), mx: (p.x + q.x) / 2, my: (p.y + q.y) / 2 };
        mode = null;
      }
    });
    el.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) {
        // Un solo rayo por fotograma como mucho: el cursor no debe costar más que el render.
        hoverAt = { x: e.clientX, y: e.clientY };
        if (!hoverRaf)
          hoverRaf = requestAnimationFrame(() => {
            hoverRaf = 0;
            if (hoverAt) this.events.onHover?.(this.pick(hoverAt.x, hoverAt.y));
          });
        return;
      }
      const last = pointers.get(e.pointerId)!;
      const dx = e.clientX - last.x, dy = e.clientY - last.y;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 4) moved = true;
      if (!moved) return;
      this.busy();
      if (pointers.size >= 2 && pinch) {
        const [p, q] = [...pointers.values()];
        const d = Math.hypot(p.x - q.x, p.y - q.y), a = Math.atan2(q.y - p.y, q.x - p.x);
        const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
        const scale = pinch.d / Math.max(1, d);
        const twist = a - pinch.a;
        const vy = my - pinch.my;
        if (Math.abs(scale - 1) < 0.01 && Math.abs(twist) < 0.01 && Math.abs(vy) > Math.abs(mx - pinch.mx) * 1.5) {
          this.goal.tilt = THREE.MathUtils.clamp(this.goal.tilt + vy * 0.006, 0, MAX_TILT);
        } else {
          this.zoomAt(mx, my, scale);
          this.goal.yaw -= twist;
          this.panBy(mx - pinch.mx, my - pinch.my);
        }
        pinch = { d, a, mx, my };
      } else if (mode === 'orbit') {
        this.goal.yaw -= dx * 0.006;
        this.goal.tilt = THREE.MathUtils.clamp(this.goal.tilt + dy * 0.005, 0, MAX_TILT);
      } else if (mode === 'pan' && grab) {
        const now = this.groundAt(e.clientX, e.clientY);
        if (now) {
          this.goal.tx += grab.x - now.x;
          this.goal.tz += grab.z - now.z;
          this.cam.tx = this.goal.tx;
          this.cam.tz = this.goal.tz;
        }
      }
      this.invalidate();
    });
    const up = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 0) {
        if (!moved && e.button === 0) this.events.onPick(this.pick(e.clientX, e.clientY), e.shiftKey || e.metaKey || e.ctrlKey);
        mode = null;
        grab = null;
      }
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('dblclick', (e) => {
      const hit = this.pick(e.clientX, e.clientY);
      if (hit?.part) return this.frameParts([hit.part]);
      const p = this.groundAt(e.clientX, e.clientY);
      if (!p) return;
      this.animateTo({ ...this.cam, tx: p.x, tz: p.z, dist: this.cam.dist * 0.55 }, 450);
    });
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        stopAnim();
        this.busy();
        const px = e.deltaMode === 1 ? 16 : 1;
        // Rueda o pellizco del trackpad (ctrl): zoom hacia el cursor. Desplazamiento a dos dedos: mover.
        if (e.ctrlKey || (Math.abs(e.deltaX) < 0.5 && Number.isInteger(e.deltaY))) {
          this.zoomAt(e.clientX, e.clientY, Math.exp(e.deltaY * px * (e.ctrlKey ? 0.01 : 0.0018)));
        } else if (e.shiftKey) {
          this.goal.yaw -= e.deltaX * 0.004;
          this.goal.tilt = THREE.MathUtils.clamp(this.goal.tilt + e.deltaY * 0.004, 0, MAX_TILT);
        } else {
          this.panBy(-e.deltaX * px, -e.deltaY * px);
        }
        this.invalidate();
      },
      { passive: false },
    );
  }

  private panBy(dx: number, dy: number) {
    const c = this.goal;
    const r = this.renderer.domElement.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const a = this.groundAt(cx, cy), b = this.groundAt(cx + dx, cy + dy);
    if (!a || !b) return;
    c.tx -= b.x - a.x;
    c.tz -= b.z - a.z;
  }

  private zoomAt(x: number, y: number, f: number) {
    const g = this.goal;
    const p = this.groundAt(x, y);
    const nd = THREE.MathUtils.clamp(g.dist * f, 40, 20000);
    const k = nd / g.dist;
    g.dist = nd;
    if (p) {
      g.tx = p.x + (g.tx - p.x) * k;
      g.tz = p.z + (g.tz - p.z) * k;
    }
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    clearTimeout(this.idleTimer);
    this.ro.disconnect();
    this.offSkin();
    this.highlighter.clear();
    this.labels.dispose();
    this.circuit.dispose();
    this.scene.environment?.dispose();
    this.gtao.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}
