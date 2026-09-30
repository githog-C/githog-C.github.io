(function () {
  var root = document.documentElement, scene = document.getElementById('door-scene'),
      main = document.getElementById('content'), btn = scene && scene.querySelector('.door'),
      leaf = scene && scene.querySelector('.door-leaf'), timer, leaving, done;
  if (!btn || /[?&]nodoor([=&]|$)/.test(location.search)) return;
  function ms(name) { // 讀 CSS 變數（如 1.2s、300ms）並轉為毫秒
    var v = getComputedStyle(scene).getPropertyValue(name).trim();
    return (parseFloat(v) || 0) * (/ms$/.test(v) ? 1 : 1000);
  }
  function close() { // 初始狀態；bfcache 返回時也用它重設
    clearTimeout(timer); leaving = done = false;
    scene.className = 'door-scene'; scene.hidden = false; btn.disabled = false;
    main.inert = true; root.classList.add('door-closed'); root.dataset.door = 'ready';
  }
  function finish() { // 只執行一次
    if (done) return; done = true; clearTimeout(timer);
    leaf.style.willChange = ''; scene.hidden = true; main.inert = false;
    root.classList.remove('door-closed'); root.dataset.door = 'done';
    main.focus({ preventScroll: true });
  }
  function leave() { // 場景淡出；transitionend 之外以 setTimeout 作後援
    if (leaving) return; leaving = true; clearTimeout(timer);
    scene.classList.add('is-leaving'); timer = setTimeout(finish, ms('--door-fade-duration') + 200);
  }
  btn.addEventListener('click', function () {
    if (btn.disabled) return;
    btn.disabled = true; root.dataset.door = 'opening';
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return leave();
    leaf.style.willChange = 'transform'; scene.classList.add('is-open');
    timer = setTimeout(leave, ms('--door-duration') + 200);
  });
  scene.addEventListener('transitionend', function (e) {
    if (e.target === leaf && e.propertyName === 'transform') leave();
    else if (e.target === scene && e.propertyName === 'opacity') finish();
  });
  addEventListener('pageshow', function (e) { if (e.persisted) close(); });
  close();
})();
