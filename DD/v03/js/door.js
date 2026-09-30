(function () {
  var WEBGL_TIMEOUT_MS = 3000; // Three.js 載入逾時（毫秒）；逾時、失敗或不支援時維持 CSS 門
  var MODULE_URL = document.currentScript && new URL('door-webgl.js', document.currentScript.src).href;
  var root = document.documentElement, scene = document.getElementById('door-scene'),
      main = document.getElementById('content'), btn = scene && scene.querySelector('.door'),
      leaf = scene && scene.querySelector('.door-leaf'), box = scene && scene.querySelector('.door-webgl'),
      reduce = matchMedia('(prefers-reduced-motion: reduce)'),
      timer, leaving, done, gl, glState, glToken = 0, scheduled;
  if (!btn || /[?&]nodoor([=&]|$)/.test(location.search)) return;
  function ms(name) { // 讀 CSS 變數（如 1.2s、300ms）並轉為毫秒
    var v = getComputedStyle(scene).getPropertyValue(name).trim();
    return (parseFloat(v) || 0) * (/ms$/.test(v) ? 1 : 1000);
  }

  // ===== CSS 門（自 v01 而來）=====
  function close() { // 初始狀態；bfcache 返回時也用它重設
    clearTimeout(timer); dropWebgl(); glState = 'idle'; leaving = done = false;
    scene.className = 'door-scene'; scene.hidden = false; btn.disabled = false;
    main.inert = true; root.classList.add('door-closed'); root.dataset.door = 'ready'; root.dataset.doorMode = 'css';
    scheduleWebgl();
  }
  function finish() { // 只執行一次
    if (done) return; done = true; clearTimeout(timer); glToken++;
    if (gl) { gl.dispose(); gl = null; } // 進入內容後釋放 GPU 資源並移除 canvas
    leaf.style.willChange = ''; scene.hidden = true; main.inert = false;
    root.classList.remove('door-closed'); root.dataset.door = 'done';
    main.focus({ preventScroll: true });
  }
  function leave() { // 場景淡出；transitionend 之外以 setTimeout 作後援
    if (leaving) return; leaving = true; clearTimeout(timer);
    scene.classList.add('is-leaving'); timer = setTimeout(finish, ms('--door-fade-duration') + 200);
  }
  function openCss() {
    leaf.style.willChange = 'transform'; scene.classList.add('is-open');
    timer = setTimeout(leave, ms('--door-duration') + 200);
  }

  // ===== WebGL 門（漸進增強）=====
  function hasWebgl2() {
    try {
      var g = document.createElement('canvas').getContext('webgl2'), x = g && g.getExtension('WEBGL_lose_context');
      if (x) x.loseContext();
      return !!g;
    } catch (e) { return false; }
  }
  function dropWebgl() { // 取消進行中的載入、釋放 WebGL、回到 CSS 門
    glToken++; glState = 'off';
    if (gl) { gl.dispose(); gl = null; }
    if (box) box.classList.remove('is-visible');
    if (scene) scene.classList.remove('webgl-active');
    root.dataset.doorMode = 'css';
  }
  function scheduleWebgl() { // 首次內容繪製（FCP）之後才開始載入，Three.js 不得延後首次繪製
    var fired;
    function go() { if (fired) return; fired = true; scheduled = false; setTimeout(startWebgl, 0); }
    function afterLoad() {
      if (performance.getEntriesByName('first-contentful-paint').length || !window.PerformanceObserver) return go();
      try {
        new PerformanceObserver(function (list, obs) {
          if (list.getEntriesByName('first-contentful-paint').length) { obs.disconnect(); go(); }
        }).observe({ type: 'paint', buffered: true });
      } catch (e) { go(); }
      setTimeout(go, 1500); // 不支援或一直沒有 FCP 時的後援
    }
    if (scheduled) return; scheduled = true;
    if (document.readyState === 'complete') afterLoad(); else addEventListener('load', afterLoad, { once: true });
  }
  function startWebgl() {
    if (glState !== 'idle' || done || btn.disabled || !MODULE_URL || reduce.matches ||
        /[?&]nowebgl([=&]|$)/.test(location.search) || !hasWebgl2()) return;
    glState = 'loading';
    var token = ++glToken, tid, timeout = new Promise(function (_, reject) { tid = setTimeout(reject, WEBGL_TIMEOUT_MS); });
    var load = import(MODULE_URL).then(function (m) {
      return new Promise(function (resolve) { setTimeout(resolve, 0); }).then(function () { // 讓出主執行緒：模組解析與場景建立分屬不同工作
        return m.createDoorScene({ container: box, getDoorRect: function () { return btn.getBoundingClientRect(); }, onLost: onLost });
      });
    }).then(function (c) { if (token !== glToken) { c.dispose(); throw 0; } return c; });
    Promise.race([load, timeout]).then(function (c) { clearTimeout(tid); activate(c, token); },
      function () { clearTimeout(tid); if (token === glToken) dropWebgl(); });
  }
  function activate(c, token) { // 第一格已渲染完成
    var swap = ms('--door-swap-duration') + 50;
    gl = c; box.classList.add('is-visible'); // 階段一：畫布淡入
    setTimeout(function () {
      if (token !== glToken) return;
      scene.classList.add('webgl-active'); // 階段二：CSS 門淡出
      setTimeout(function () { if (token !== glToken) return; glState = 'ready'; root.dataset.doorMode = 'webgl'; }, swap);
    }, swap);
  }
  function onLost() { if (!btn.disabled && !done) dropWebgl(); } // 開門中遺失時，open() 會回傳 false，由 fallback 處理
  function openWebgl() {
    var c = gl, stall = ms('--door-duration') + ms('--door-camera-duration') + 3000;
    timer = setTimeout(function () { c.abort(); }, stall); // 動畫停擺（例如分頁在背景）時的保險
    c.open().then(function (ok) {
      if (leaving || done) return;
      clearTimeout(timer);
      if (ok) leave(); else { dropWebgl(); openCss(); } // 掉幀或環境遺失：改以 CSS 門完成開門
    });
  }

  btn.addEventListener('click', function () {
    if (btn.disabled) return;
    btn.disabled = true; root.dataset.door = 'opening';
    if (reduce.matches) { dropWebgl(); return leave(); }
    if (glState === 'ready') return openWebgl();
    dropWebgl(); openCss(); // WebGL 尚未就緒：直接以 CSS 門開門，不等待
  });
  scene.addEventListener('transitionend', function (e) {
    if (e.target === leaf && e.propertyName === 'transform') leave();
    else if (e.target === scene && e.propertyName === 'opacity') finish();
  });
  addEventListener('pageshow', function (e) { if (e.persisted) close(); });
  close();
})();
