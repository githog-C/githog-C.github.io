(function () {
  // ===== 投影與場景常數（單位：viewBox 座標，viewBox 為 0 0 400 800）=====
  var VIEW_W = 400, VIEW_H = 800;    // 須與 index.html 的 viewBox 一致
  var FOCAL = 1000;                  // 焦距，建議 800–1200；越小透視越強
  var CX0 = 200, CY0 = 400;          // 投影中心預設值（門的中心）
  var OPEN_W = 295, OPEN_H = 620;    // 門洞尺寸（門高約為 viewBox 高度的 77%）
  var GAP = 1.5;                     // 門板與門洞之間的縫隙（門縫透光）
  var THICK = 10;                    // 門厚
  var MAX_ANGLE = 100;               // 開門角度（度）
  var CASING_W = 16, CASING_D = 50;  // 門框寬度、門框凸出牆面的深度
  var RAISE = 1.5;                   // 門板線條與門把凸出門面的高度
  var SHADE_MAX = 0.5;               // 開到最大角度時，門板變暗的程度（0–1）
  var LIGHT_MIN = 0.35, HALO_MIN_SCALE = 0.3; // 關門時的光：透明度、光暈縮放
  var PARALLAX = 0.02;               // 桌機滑鼠視差幅度（占 viewBox 尺寸的比例；0 = 關閉）
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; } // easeInOutCubic

  var root = document.documentElement, scene = document.getElementById('door-scene'),
      main = document.getElementById('content'), hit = scene && scene.querySelector('.door-hit');
  if (!hit || /[?&]nodoor([=&]|$)/.test(location.search)) return;
  var $ = function (id) { return document.getElementById(id); };
  var el = { halo: $('d-halo'), light: $('d-light'), edge: $('d-edge'), panel: $('d-panel'), shade: $('d-shade'),
    details: $('d-details'), l1: $('d-line-1'), l2: $('d-line-2'), knob: $('d-knob'), ref: $('d-ref'),
    rl: $('d-rev-l'), rr: $('d-rev-r'), rt: $('d-rev-t'), rb: $('d-rev-b'), ring: $('d-ring') };
  var LEAF_W = OPEN_W - 2 * GAP, LEAF_H = OPEN_H - 2 * GAP, HX = CX0 - OPEN_W / 2 + GAP, TY = CY0 - OPEN_H / 2 + GAP;
  var cx, cy, tx, ty, cosA, sinA, progress = 0, isFront, raf, moveRaf, timer, leaving, done, io;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)'), fine = matchMedia('(hover: hover) and (pointer: fine)');

  function proj(x, y, z) { // 透視投影：x' = cx + (X − cx)·f/(f + Z)
    var s = FOCAL / (FOCAL + z);
    return (cx + (x - cx) * s).toFixed(2) + ',' + (cy + (y - cy) * s).toFixed(2);
  }
  function leafPts(list) { // 門板局部座標 (u 沿門寬、v 沿門高、w 沿門厚) → 投影後的 points
    return list.map(function (p) { return proj(HX + p[0] * cosA - p[2] * sinA, TY + p[1], p[0] * sinA + p[2] * cosA); }).join(' ');
  }
  function rect(u0, v0, u1, v1, w) { return [[u0, v0, w], [u1, v0, w], [u1, v1, w], [u0, v1, w]]; }
  function show(node, on) { if (node._on !== on) { node._on = on; if (on) node.removeAttribute('display'); else node.setAttribute('display', 'none'); } }

  function renderDoor(p) { // 只更新既有元素的屬性，不重建 DOM
    var a = p * MAX_ANGLE * Math.PI / 180, front, w, pts, i, knob = [], r = LEAF_W * 0.042;
    cosA = Math.cos(a); sinA = Math.sin(a); progress = p;
    front = sinA * (cx - (HX + LEAF_W / 2 * cosA)) + cosA * (FOCAL + LEAF_W / 2 * sinA) >= 0; // 觀看者看到正面或背面
    w = front ? 0 : THICK;
    pts = leafPts(rect(0, 0, LEAF_W, LEAF_H, w));
    el.panel.setAttribute('points', pts); el.shade.setAttribute('points', pts);
    el.shade.setAttribute('fill-opacity', (SHADE_MAX * p).toFixed(3));
    if (front !== isFront) { isFront = front; el.panel.setAttribute('fill', front ? 'url(#wood)' : 'url(#woodBack)'); }
    show(el.details, front);
    el.l1.setAttribute('points', leafPts(rect(LEAF_W * 0.14, LEAF_H * 0.07, LEAF_W * 0.86, LEAF_H * 0.45, -RAISE)));
    el.l2.setAttribute('points', leafPts(rect(LEAF_W * 0.14, LEAF_H * 0.53, LEAF_W * 0.86, LEAF_H * 0.93, -RAISE)));
    for (i = 0; i < 12; i++) knob.push([LEAF_W * 0.92 + r * Math.cos(i * Math.PI / 6), LEAF_H * 0.52 + r * Math.sin(i * Math.PI / 6), -RAISE * 2]);
    el.knob.setAttribute('points', leafPts(knob));
    el.edge.setAttribute('points', leafPts([[LEAF_W, 0, 0], [LEAF_W, LEAF_H, 0], [LEAF_W, LEAF_H, THICK], [LEAF_W, 0, THICK]]));
    show(el.edge, cosA * (cx - (HX + LEAF_W * cosA - THICK / 2 * sinA)) + sinA * (-FOCAL - (LEAF_W * sinA + THICK / 2 * cosA)) > 0);
    el.light.setAttribute('opacity', (LIGHT_MIN + (1 - LIGHT_MIN) * p).toFixed(3));
    el.halo.setAttribute('opacity', (LIGHT_MIN + (1 - LIGHT_MIN) * p).toFixed(3));
    el.halo.setAttribute('transform', 'translate(' + CX0 + ' ' + CY0 + ') scale(' + (HALO_MIN_SCALE + (1 - HALO_MIN_SCALE) * p).toFixed(3) + ')');
  }
  function renderFrame() { // 門框凸出牆面：內側面與前緣經同一個投影函式，視差時可見
    var x0 = CX0 - OPEN_W / 2, x1 = CX0 + OPEN_W / 2, y0 = CY0 - OPEN_H / 2, y1 = CY0 + OPEN_H / 2, D = CASING_D, J = CASING_W;
    function poly(l) { return l.map(function (p) { return proj(p[0], p[1], p[2]); }).join(' '); }
    function path(l) { return 'M' + l.map(function (p) { return proj(p[0], p[1], p[2]); }).join('L') + 'Z'; }
    el.rl.setAttribute('points', poly([[x0, y0, -D], [x0, y1, -D], [x0, y1, 0], [x0, y0, 0]]));
    el.rr.setAttribute('points', poly([[x1, y0, -D], [x1, y1, -D], [x1, y1, 0], [x1, y0, 0]]));
    el.rt.setAttribute('points', poly([[x0, y0, -D], [x1, y0, -D], [x1, y0, 0], [x0, y0, 0]]));
    el.rb.setAttribute('points', poly([[x0, y1, -D], [x1, y1, -D], [x1, y1, 0], [x0, y1, 0]]));
    el.ring.setAttribute('d', path([[x0 - J, y0 - J, -D], [x1 + J, y0 - J, -D], [x1 + J, y1 + J, -D], [x0 - J, y1 + J, -D]]) +
      path([[x0, y0, -D], [x1, y0, -D], [x1, y1, -D], [x0, y1, -D]]));
  }
  function renderAll() { renderFrame(); renderDoor(progress); }

  function ms(name) { // 讀 CSS 變數（如 1.2s、300ms）並轉為毫秒
    var v = getComputedStyle(scene).getPropertyValue(name).trim();
    return (parseFloat(v) || 0) * (/ms$/.test(v) ? 1 : 1000);
  }
  function align() { // 讓透明按鈕對齊 SVG 中門的實際位置
    var r = el.ref.getBoundingClientRect(), s = scene.getBoundingClientRect();
    hit.style.left = (r.left - s.left) + 'px'; hit.style.top = (r.top - s.top) + 'px';
    hit.style.width = r.width + 'px'; hit.style.height = r.height + 'px';
  }
  function onMove(e) { // 視差：只記錄目標值，以 rAF 節流；停止移動後不再排程
    tx = CX0 - (e.clientX / innerWidth * 2 - 1) * PARALLAX * VIEW_W; ty = CY0 - (e.clientY / innerHeight * 2 - 1) * PARALLAX * VIEW_H;
    if (!moveRaf) moveRaf = requestAnimationFrame(function () { moveRaf = 0; cx = tx; cy = ty; renderAll(); });
  }
  function parallax(on) {
    removeEventListener('pointermove', onMove);
    if (moveRaf) { cancelAnimationFrame(moveRaf); moveRaf = 0; }
    if (on && PARALLAX && fine.matches && !reduce.matches) addEventListener('pointermove', onMove, { passive: true });
  }

  function close() { // 初始狀態；bfcache 返回時也用它重設
    clearTimeout(timer); cancelAnimationFrame(raf); raf = 0; leaving = done = false; isFront = null; progress = 0;
    cx = CX0; cy = CY0; renderAll(); align();
    scene.className = 'door-scene'; scene.hidden = false; hit.disabled = false;
    main.inert = true; root.classList.add('door-closed'); root.dataset.door = 'ready';
    if (window.ResizeObserver && !io) { io = new ResizeObserver(align); io.observe(scene); }
    parallax(true);
  }
  function finish() { // 只執行一次
    if (done) return; done = true; clearTimeout(timer);
    if (io) { io.disconnect(); io = null; }
    scene.hidden = true; main.inert = false; root.classList.remove('door-closed'); root.dataset.door = 'done';
    main.focus({ preventScroll: true });
  }
  function leave() { // 場景淡出；transitionend 之外以 setTimeout 作後援
    if (leaving) return; leaving = true; clearTimeout(timer);
    scene.classList.add('is-leaving'); timer = setTimeout(finish, ms('--door-fade-duration') + 200);
  }
  function open() { // requestAnimationFrame 只在開門期間執行
    var dur = ms('--door-duration'), t0 = null;
    raf = requestAnimationFrame(function step(now) {
      if (t0 === null) t0 = now;
      var t = Math.min(1, (now - t0) / dur);
      renderDoor(ease(t));
      if (t < 1) raf = requestAnimationFrame(step); else { raf = 0; leave(); }
    });
    timer = setTimeout(function () { cancelAnimationFrame(raf); raf = 0; renderDoor(1); leave(); }, dur + 300); // 分頁在背景時的後援
  }
  hit.addEventListener('click', function () {
    if (hit.disabled) return;
    hit.disabled = true; root.dataset.door = 'opening'; parallax(false);
    if (reduce.matches) return leave();
    open();
  });
  scene.addEventListener('transitionend', function (e) {
    if (e.target === scene && e.propertyName === 'opacity') finish();
  });
  addEventListener('pageshow', function (e) { if (e.persisted) close(); });
  if (!window.ResizeObserver) addEventListener('resize', align);
  close();
})();
