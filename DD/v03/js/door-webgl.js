// WebGL 開門場景（由 door.js 在首次繪製之後以動態 import() 載入）。
// 幾何體與紋理全部由程式生成，不載入任何模型或圖檔。只在開門動畫與尺寸改變時渲染（隨需渲染）。
import * as THREE from '../vendor/three/three.custom.min.js';

/* ===== 場景常數（世界單位；門寬 = 1）===== */
const DOOR_W = 1, DOOR_H = 2.1;             // 門寬、門高（比例 1:2.1，與 CSS 門一致）
const DOOR_THICK = DOOR_W * 0.04;           // 門厚：約為門寬的 4%
const DOOR_GAP = 0.004;                     // 門板與門洞的縫隙（門縫透光）
const JAMB = 0.07, FRAME_DEPTH = 0.3;       // 門框寬度（比例同 CSS 的 --door-jamb-ratio）、深度
const MAX_ANGLE = 100;                      // 開門角度（度）
const CAM_DIST = 4;                         // 關門時鏡頭離門的距離；越小透視越強
const CAM_END_Z = -4.4;                     // 鏡頭穿過門口後的終點（z）
const ROOM = { halfWidth: 2.6, depth: 6, above: 0.7 }; // 門後空間：半寬、深度、高出門頂的高度
const AMBIENT_INTENSITY = Math.PI * 0.95;   // 環境光（Three.js 的光照單位含 π 係數）
const LIGHT_INTENSITY = Math.PI * 2.2;        // 門後暖金色點光源的最大強度
const LIGHT_DECAY = 1.2;
const LIGHT_MIN = 0.25, GLOW_MAX = 0.55;                     // 關門時光的比例（透過門縫透出）
const PIXEL_RATIO_MAX = 1.5;                // 像素比上限（iOS 記憶體較緊）
const TEXTURE_SIZE = 256;                   // 程式生成紋理的尺寸上限
const SLOW_FRAME_MS = 50, SLOW_FRAME_SAMPLES = 5; // 開門期間最近 N 格平均幀時間超過門檻就放棄 WebGL

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const cssMs = (name) => { const v = css(name); return (parseFloat(v) || 0) * (/ms$/.test(v) ? 1 : 1000); };
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (t) => Math.min(1, Math.max(0, t));

function woodTexture(c1, c2) { // 程式生成的木紋（不載入圖檔）
  const S = TEXTURE_SIZE, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d'), grad = g.createLinearGradient(0, 0, S, 0);
  grad.addColorStop(0, c1); grad.addColorStop(0.55, c2); grad.addColorStop(1, c1);
  g.fillStyle = grad; g.fillRect(0, 0, S, S);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647; // 固定種子，每次結果相同
  for (let x = 0; x < S; x += 1 + rnd() * 6) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,.08)' : 'rgba(255,235,200,.06)';
    g.fillRect(x, 0, 1 + rnd() * 2, S);
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function glowTexture(color) { // 徑向漸層光暈
  const S = 128, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d'), grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  const c = new THREE.Color(color), rgb = [c.r, c.g, c.b].map((v) => Math.round(Math.pow(v, 1 / 2.2) * 255)).join(',');
  grad.addColorStop(0, `rgba(${rgb},1)`); grad.addColorStop(0.5, `rgba(${rgb},.45)`); grad.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grad; g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const yieldToMain = () => new Promise((r) => setTimeout(r, 0)); // 初始化分成數個工作，避免單一長任務卡住主執行緒

/**
 * 建立場景並渲染第一格（畫布此時由 CSS 保持透明）。
 * @param {{container: HTMLElement, getDoorRect: () => DOMRect, onLost?: () => void}} opts
 * @returns {Promise<{open: () => Promise<boolean>, abort: () => void, dispose: () => void, stats: () => object}>}
 */
export async function createDoorScene({ container, getDoorRect, onLost }) {
  const coarse = matchMedia('(pointer: coarse)').matches;
  const renderer = new THREE.WebGLRenderer({ antialias: !coarse, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, PIXEL_RATIO_MAX));
  renderer.shadowMap.enabled = false; // 不用陰影、不用後處理
  renderer.setClearColor(new THREE.Color(css('--door-wall')));
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  container.appendChild(canvas);

  await yieldToMain();
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, 1, 0.05, 60);
  camera.position.set(0, 0, CAM_DIST);
  const wall = new THREE.Color(css('--door-wall'));
  const mats = {
    wood: new THREE.MeshLambertMaterial({ map: woodTexture(css('--door-wood-1'), css('--door-wood-2')) }),
    panel: new THREE.MeshLambertMaterial({ map: woodTexture(css('--door-wood-2'), css('--door-wood-1')), color: 0xdddddd }),
    frame: new THREE.MeshLambertMaterial({ color: css('--door-frame-color') }),
    knob: new THREE.MeshLambertMaterial({ color: css('--door-knob-1') }),
    wall: new THREE.MeshBasicMaterial({ color: wall }),
    room: new THREE.MeshLambertMaterial({ color: css('--door-room') }),
    back: new THREE.MeshBasicMaterial({ color: css('--door-glow-core') }),
  };
  const glowMap = glowTexture(css('--door-glow'));
  const glowMat = (opacity) => new THREE.MeshBasicMaterial({ map: glowMap, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  const glowGap = glowMat(GLOW_MAX * LIGHT_MIN), glowBack = glowMat(GLOW_MAX * LIGHT_MIN);
  const add = (geo, mat, x, y, z, parent = scene) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };

  // 牆：門洞四周（門框之外）；以及門後的空間
  const halfW = DOOR_W / 2, halfH = DOOR_H / 2, edge = halfW + JAMB, top = halfH + JAMB, BIG = 40;
  add(new THREE.PlaneGeometry(BIG, BIG), mats.wall, -edge - BIG / 2, 0, 0);
  add(new THREE.PlaneGeometry(BIG, BIG), mats.wall, edge + BIG / 2, 0, 0);
  add(new THREE.PlaneGeometry(edge * 2, BIG), mats.wall, 0, top + BIG / 2, 0);
  add(new THREE.PlaneGeometry(edge * 2, BIG), mats.wall, 0, -halfH - BIG / 2, 0);
  const rw = ROOM.halfWidth, rd = ROOM.depth, rt = halfH + ROOM.above;
  add(new THREE.PlaneGeometry(rw * 2, rd), mats.room, 0, -halfH, -rd / 2).rotation.x = -Math.PI / 2;  // 地板
  add(new THREE.PlaneGeometry(rw * 2, rd), mats.room, 0, rt, -rd / 2).rotation.x = Math.PI / 2;       // 天花板
  add(new THREE.PlaneGeometry(rd, rt + halfH), mats.room, -rw, (rt - halfH) / 2, -rd / 2).rotation.y = Math.PI / 2;  // 左牆
  add(new THREE.PlaneGeometry(rd, rt + halfH), mats.room, rw, (rt - halfH) / 2, -rd / 2).rotation.y = -Math.PI / 2;  // 右牆
  add(new THREE.PlaneGeometry(rw * 2, rt + halfH), mats.back, 0, (rt - halfH) / 2, -rd);              // 後牆（發亮）
  add(new THREE.PlaneGeometry(rw * 2.2, rt + halfH + 1), glowBack, 0, (rt - halfH) / 2, -rd + 0.02);  // 後牆光暈（AdditiveBlending）
  add(new THREE.PlaneGeometry(DOOR_W * 2.4, DOOR_H * 1.5), glowGap, 0, 0, -0.06);                     // 門後光暈：門縫透光

  // 門框（3 個 BoxGeometry）
  const fz = 0.05 - FRAME_DEPTH / 2;
  add(new THREE.BoxGeometry(JAMB, DOOR_H + JAMB, FRAME_DEPTH), mats.frame, -halfW - JAMB / 2, JAMB / 2, fz);
  add(new THREE.BoxGeometry(JAMB, DOOR_H + JAMB, FRAME_DEPTH), mats.frame, halfW + JAMB / 2, JAMB / 2, fz);
  add(new THREE.BoxGeometry(DOOR_W + 2 * JAMB, JAMB, FRAME_DEPTH), mats.frame, 0, halfH + JAMB / 2, fz);

  // 門：以 Group 作為樞紐，樞紐在左緣；開門時旋轉 group.rotation.y（正值為向內開）
  const leafW = DOOR_W - 2 * DOOR_GAP, leafH = DOOR_H - 2 * DOOR_GAP;
  const hinge = new THREE.Group();
  hinge.position.set(-halfW + DOOR_GAP, 0, 0);
  scene.add(hinge);
  add(new THREE.BoxGeometry(leafW, leafH, DOOR_THICK), mats.wood, leafW / 2, 0, -DOOR_THICK / 2, hinge);
  for (const [py, ph] of [[0.5, 0.85], [-0.5, 0.9]]) { // 凸起的門板
    add(new THREE.BoxGeometry(leafW * 0.72, ph, 0.02), mats.panel, leafW / 2, py, 0.008, hinge);
    add(new THREE.BoxGeometry(leafW * 0.72, ph, 0.02), mats.panel, leafW / 2, py, -DOOR_THICK - 0.008, hinge);
  }
  for (const z of [0.05, -DOOR_THICK - 0.05]) add(new THREE.SphereGeometry(0.045, 12, 8), mats.knob, leafW * 0.9, -0.02, z, hinge); // 門把（低分段）
  add(new THREE.CylinderGeometry(0.014, 0.014, 0.05 + DOOR_THICK + 0.05, 8), mats.knob, leafW * 0.9, -0.02, -DOOR_THICK / 2, hinge).rotation.x = Math.PI / 2;

  scene.add(new THREE.AmbientLight(0xffffff, AMBIENT_INTENSITY));
  const point = new THREE.PointLight(css('--door-glow'), LIGHT_INTENSITY * LIGHT_MIN, 0, LIGHT_DECAY);
  point.position.set(0, 0.3, -rd + 1.4);
  scene.add(point);

  await yieldToMain();
  // ===== 尺寸與鏡頭：讓關門時的 WebGL 門與 CSS 門的位置、大小一致 =====
  function resize() {
    const w = container.clientWidth, h = container.clientHeight, r = getDoorRect();
    if (!w || !h || !r.width) return;
    renderer.setSize(w, h, false); // canvas 只有實際需要的尺寸；CSS 負責 100% 顯示
    camera.aspect = w / h;
    camera.fov = 2 * Math.atan((h * (DOOR_W / r.width)) / 2 / CAM_DIST) * 180 / Math.PI;
    camera.updateProjectionMatrix();
  }
  let renderQueued = false, running = false, raf = 0, disposed = false;
  const render = () => { if (!disposed) renderer.render(scene, camera); };
  const requestRender = () => {
    if (renderQueued || running || disposed) return;
    renderQueued = true;
    requestAnimationFrame(() => { renderQueued = false; resize(); render(); });
  };
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(requestRender) : null;
  if (ro) ro.observe(container); else addEventListener('resize', requestRender);

  // ===== 開門、鏡頭穿過門口 =====
  let finishOpen = null, opened = false, last = null; // last：上一格的時間戳；分頁隱藏後歸零，避免把隱藏期間算成掉幀
  function stop(result) {
    cancelAnimationFrame(raf); running = false;
    if (finishOpen) { const f = finishOpen; finishOpen = null; f(result); }
  }
  function open() {
    if (opened || disposed) return Promise.resolve(false);
    opened = true;
    return new Promise((resolve) => {
      finishOpen = resolve; running = true;
      const openMs = cssMs('--door-duration'), camMs = cssMs('--door-camera-duration');
      let elapsed = 0; const samples = []; last = null;
      const step = (now) => {
        if (!running) return;
        if (last !== null) {
          const dt = now - last;
          elapsed += Math.min(dt, 100); // 分頁隱藏後恢復時，不讓時間一次跳過
          if (elapsed <= openMs) { // 只在開門期間監測幀時間
            samples.push(dt); if (samples.length > SLOW_FRAME_SAMPLES) samples.shift();
            if (samples.length === SLOW_FRAME_SAMPLES && samples.reduce((a, b) => a + b, 0) / SLOW_FRAME_SAMPLES > SLOW_FRAME_MS) return stop(false);
          }
        }
        last = now;
        const a = ease(clamp01(elapsed / openMs));
        hinge.rotation.y = a * MAX_ANGLE * Math.PI / 180;
        point.intensity = LIGHT_INTENSITY * (LIGHT_MIN + (1 - LIGHT_MIN) * a);
        glowGap.opacity = glowBack.opacity = GLOW_MAX * (LIGHT_MIN + (1 - LIGHT_MIN) * a);
        camera.position.z = CAM_DIST + (CAM_END_Z - CAM_DIST) * ease(clamp01((elapsed - openMs) / camMs));
        render();
        if (elapsed >= openMs + camMs) return stop(true);
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    });
  }
  const onVisibility = () => { last = null; }; // 分頁隱藏時 rAF 自然暫停；恢復後重新計時
  const onContextLost = (e) => { e.preventDefault(); if (running) stop(false); else if (onLost) onLost(); };
  document.addEventListener('visibilitychange', onVisibility);
  canvas.addEventListener('webglcontextlost', onContextLost);

  function dispose() { // 釋放幾何體、材質、紋理與 renderer，移除 canvas
    if (disposed) return;
    stop(false); disposed = true;
    if (ro) ro.disconnect(); else removeEventListener('resize', requestRender);
    document.removeEventListener('visibilitychange', onVisibility);
    canvas.removeEventListener('webglcontextlost', onContextLost);
    scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    for (const m of [...Object.values(mats), glowGap, glowBack]) { if (m.map) m.map.dispose(); m.dispose(); }
    glowMap.dispose();
    renderer.dispose();
    renderer.forceContextLoss(); // 立即歸還 GPU 記憶體
    canvas.remove();
  }

  try {
    resize();
    if (renderer.compileAsync) await renderer.compileAsync(scene, camera); // 先編譯著色器，避免點擊時卡頓
    await yieldToMain();
    render();
    await nextFrame(); // 確認第一格已完成，door.js 才會淡入替換 CSS 門
  } catch (err) { dispose(); throw err; }

  const stats = () => { const i = renderer.info; return { triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, pixelRatio: renderer.getPixelRatio(), canvas: [canvas.width, canvas.height] }; };
  return { open, abort: () => stop(false), dispose, stats };
}
