/* ==========================================================================
   Interactions. Everything animated here is transform/opacity driven, runs in
   requestAnimationFrame, and stops its own loop as soon as it has settled.
   ========================================================================== */
(function () {
  'use strict';

  var doc = document, body = doc.body, root = doc.documentElement;
  var cfg = window.MH_CONFIG || {};
  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;

  function $(s, c) { return (c || doc).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || doc).querySelectorAll(s)); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  function sfx(name) { if (window.MH_AUDIO && window.MH_AUDIO[name]) { try { window.MH_AUDIO[name](); } catch (e) { /* ignore */ } } }

  /* ---------------------------------------------------------------------
     1. Cinematic intro
     --------------------------------------------------------------------- */
  (function intro() {
    var el = $('#intro'), skip = $('#skip-intro');
    var finished = false, timer = 0;

    function finish(fast) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (fast) {
        $$('.rv-hero').forEach(function (n) {
          var d = parseFloat(n.style.getPropertyValue('--d')) || 0;
          n.style.setProperty('--d', (d * 0.35) + 's');
        });
      }
      if (el) el.classList.add('out');
      if (skip) skip.classList.add('gone');
      body.classList.add('ready');
      ssSet('mh.seen', '1');
      setTimeout(function () { if (el && el.parentNode) el.parentNode.removeChild(el); }, 1100);
    }

    if (!el || reduced) { finish(false); return; }
    var seen = ssGet('mh.seen') === '1';
    timer = setTimeout(function () { finish(false); }, seen ? 900 : 2700);
    if (skip) skip.addEventListener('click', function () { finish(true); });
  })();

  /* ---------------------------------------------------------------------
     2. Scroll reveals
     --------------------------------------------------------------------- */
  (function reveals() {
    var items = $$('.rv');
    if (!('IntersectionObserver' in window)) { items.forEach(function (n) { n.classList.add('in'); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.15 });
    items.forEach(function (n) { io.observe(n); });
  })();

  /* ---------------------------------------------------------------------
     3. Hero parallax (mouse on desktop, touch + scroll on phones)
     --------------------------------------------------------------------- */
  (function parallax() {
    var hero = $('.hero');
    if (!hero || reduced) return;
    var layers = $$('[data-depth]', hero).map(function (n) { return { el: n, d: parseFloat(n.getAttribute('data-depth')) || 0 }; });
    var s = { tx: 0, ty: 0, cx: 0, cy: 0, sy: 0 }, raf = 0;
    var strength = finePointer ? 1 : 0.55;

    function apply() {
      for (var i = 0; i < layers.length; i++) {
        var l = layers[i];
        var x = -s.cx * l.d * strength, y = -s.cy * l.d * .7 * strength - s.sy * l.d * .03;
        l.el.style.transform = 'translate3d(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px,0)';
      }
    }
    function tick() {
      raf = 0;
      s.cx += (s.tx - s.cx) * .08; s.cy += (s.ty - s.cy) * .08;
      apply();
      if (Math.abs(s.tx - s.cx) > .002 || Math.abs(s.ty - s.cy) > .002) raf = requestAnimationFrame(tick);
    }
    function wake() { if (!raf) raf = requestAnimationFrame(tick); }

    function move(x, y) { s.tx = (x / window.innerWidth - .5) * 2; s.ty = (y / window.innerHeight - .5) * 2; wake(); }
    window.addEventListener('pointermove', function (e) { if (window.scrollY < window.innerHeight * 1.1) move(e.clientX, e.clientY); }, { passive: true });
    window.addEventListener('touchmove', function (e) { var t = e.touches[0]; if (t && window.scrollY < window.innerHeight * 1.1) move(t.clientX, t.clientY); }, { passive: true });
    window.addEventListener('scroll', function () {
      var y = Math.min(window.scrollY, window.innerHeight * 1.2);
      if (y !== s.sy) { s.sy = y; wake(); }
    }, { passive: true });
  })();

  /* ---------------------------------------------------------------------
     4. Cursor glow (desktop pointer + brief glow on touch)
     --------------------------------------------------------------------- */
  (function glow() {
    var g = $('#cursor-glow');
    if (!g || reduced) return;
    var tx = 0, ty = 0, x = 0, y = 0, raf = 0, hideT = 0, first = true;

    function tick() {
      raf = 0;
      x += (tx - x) * .14; y += (ty - y) * .14;
      g.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
      if (Math.abs(tx - x) > .4 || Math.abs(ty - y) > .4) raf = requestAnimationFrame(tick);
    }
    function set(px, py, autoHide) {
      tx = px; ty = py;
      if (first) { x = px; y = py; first = false; }
      g.classList.add('on');
      clearTimeout(hideT);
      if (autoHide) hideT = setTimeout(function () { g.classList.remove('on'); }, 900);
      if (!raf) raf = requestAnimationFrame(tick);
    }
    if (finePointer) {
      window.addEventListener('pointermove', function (e) { set(e.clientX, e.clientY, false); }, { passive: true });
      doc.addEventListener('mouseleave', function () { g.classList.remove('on'); });
    } else {
      var h = function (e) { var t = e.touches[0]; if (t) set(t.clientX, t.clientY, true); };
      window.addEventListener('touchstart', h, { passive: true });
      window.addEventListener('touchmove', h, { passive: true });
    }
  })();

  /* ---------------------------------------------------------------------
     5. Magnetic buttons + tilt cards (hover-capable devices only)
     --------------------------------------------------------------------- */
  (function hoverFx() {
    if (!finePointer || reduced) return;

    $$('.magnetic').forEach(function (el) {
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        var x = (e.clientX - (r.left + r.width / 2)) * .26;
        var y = (e.clientY - (r.top + r.height / 2)) * .34;
        el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
      });
      el.addEventListener('pointerleave', function () { el.style.transform = ''; });
    });

    $$('.tilt').forEach(function (el) {
      var raf = 0, rx = 0, ry = 0;
      function paint() { raf = 0; el.style.transform = 'perspective(900px) rotateX(' + rx.toFixed(2) + 'deg) rotateY(' + ry.toFixed(2) + 'deg)'; }
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - .5, py = (e.clientY - r.top) / r.height - .5;
        ry = px * 7; rx = -py * 7;
        if (!raf) raf = requestAnimationFrame(paint);
      });
      el.addEventListener('pointerleave', function () { rx = 0; ry = 0; if (!raf) raf = requestAnimationFrame(paint); });
    });
  })();

  /* ---------------------------------------------------------------------
     6. Developer section: words light up one after another
     --------------------------------------------------------------------- */
  (function words() {
    var list = $('#words'), end = $('#beginning');
    if (!list) return;
    var lis = $$('li', list), done = false;
    function run() {
      if (done) return; done = true;
      lis.forEach(function (li, i) { setTimeout(function () { li.classList.add('on'); }, reduced ? 0 : i * 560); });
      setTimeout(function () { if (end) end.classList.add('on'); }, reduced ? 0 : lis.length * 560 + 250);
    }
    if (!('IntersectionObserver' in window)) { run(); return; }
    var io = new IntersectionObserver(function (en) { if (en[0].isIntersecting) { run(); io.disconnect(); } }, { threshold: .45 });
    io.observe(list);
  })();

  /* ---------------------------------------------------------------------
     7. Iraq section: digital network (static SVG, a few pulsing nodes)
     --------------------------------------------------------------------- */
  (function network() {
    var svg = $('#net');
    if (!svg) return;
    var NS = 'http://www.w3.org/2000/svg';
    var lite = root.classList.contains('lite') || window.innerWidth < 720;
    var N = lite ? 14 : 24, VW = 1200, VH = 800;
    svg.setAttribute('viewBox', '0 0 ' + VW + ' ' + VH);

    var seed = 20260;                                  // deterministic layout
    function rnd() { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }

    var pts = [], i, j;
    for (i = 0; i < N; i++) pts.push({ x: 60 + rnd() * (VW - 120), y: 40 + rnd() * (VH - 80) });

    var frag = doc.createDocumentFragment(), seen = {};
    for (i = 0; i < N; i++) {
      var ds = [];
      for (j = 0; j < N; j++) if (j !== i) ds.push({ j: j, d: Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) });
      ds.sort(function (a, b) { return a.d - b.d; });
      for (var k = 0; k < 2; k++) {
        var a = Math.min(i, ds[k].j), b = Math.max(i, ds[k].j), key = a + '-' + b;
        if (seen[key]) continue; seen[key] = 1;
        var ln = doc.createElementNS(NS, 'line');
        ln.setAttribute('x1', pts[a].x.toFixed(1)); ln.setAttribute('y1', pts[a].y.toFixed(1));
        ln.setAttribute('x2', pts[b].x.toFixed(1)); ln.setAttribute('y2', pts[b].y.toFixed(1));
        frag.appendChild(ln);
      }
    }
    for (i = 0; i < N; i++) {
      var c = doc.createElementNS(NS, 'circle');
      c.setAttribute('cx', pts[i].x.toFixed(1)); c.setAttribute('cy', pts[i].y.toFixed(1));
      c.setAttribute('r', (i % 5 === 0 ? 3.4 : 2));
      if (i % 5 === 0) { c.setAttribute('class', 'hot'); c.style.setProperty('--dl', (i * .37 % 3.6).toFixed(2) + 's'); }
      frag.appendChild(c);
    }
    svg.appendChild(frag);
  })();

  /* ---------------------------------------------------------------------
     8. "What's next?" — scroll-driven sticky stage
     --------------------------------------------------------------------- */
  (function stage() {
    var track = $('#teaser-track'), st = $('#stage');
    if (!track || !st) return;
    var beats = $$('.beat', st), cur = -2, live = null, ticking = false;

    function update() {
      ticking = false;
      var r = track.getBoundingClientRect(), vh = window.innerHeight;
      var inView = r.top < vh && r.bottom > 0;
      if (inView !== live) { live = inView; st.classList.toggle('live', inView); }
      if (reduced) return;

      var total = Math.max(1, r.height - vh);
      var p = clamp(-r.top / total, 0, 1);
      var step = r.top > 0 ? -1 : Math.min(beats.length - 1, Math.floor(p * beats.length));
      if (step !== cur) {
        cur = step;
        for (var i = 0; i < beats.length; i++) beats[i].classList.toggle('on', i === step);
      }
    }
    function req() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
    window.addEventListener('scroll', req, { passive: true });
    window.addEventListener('resize', req);
    update();
  })();

  /* ---------------------------------------------------------------------
     9. Cinematic section transition for the hero buttons
     --------------------------------------------------------------------- */
  (function nav() {
    var wipe = $('#wipe'), busy = false;

    function jump(target, id) {
      var top = target.getBoundingClientRect().top + window.scrollY;
      try { window.scrollTo({ top: top, behavior: 'instant' }); } catch (e) { window.scrollTo(0, top); }
      try { history.replaceState(null, '', '#' + id); } catch (e) { /* file:// or restricted */ }
    }

    $$('.js-go').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var id = a.getAttribute('data-target'), target = id && doc.getElementById(id);
        if (!target || busy) return;
        if (reduced || !wipe) { jump(target, id); return; }
        busy = true;
        wipe.classList.add('run');
        sfx('whoosh');
        setTimeout(function () { jump(target, id); }, 480);
        setTimeout(function () { wipe.classList.remove('run'); busy = false; }, 1100);
      });
    });

    // soft click sound for other buttons (music toggle + anything with .btn that isn't a transition)
    $$('.btn:not(.js-go), #music-toggle').forEach(function (b) { b.addEventListener('click', function () { sfx('click'); }); });
  })();

  /* ---------------------------------------------------------------------
     10. Countdown — only when a REAL launch date is set in js/config.js
     --------------------------------------------------------------------- */
  (function countdown() {
    var box = $('#countdown');
    var t = cfg.launchDate ? Date.parse(cfg.launchDate) : NaN;
    if (!box || isNaN(t) || t <= Date.now()) return;

    var out = { d: $('[data-u="d"]', box), h: $('[data-u="h"]', box), m: $('[data-u="m"]', box), s: $('[data-u="s"]', box) };
    var prev = {}, timer = 0;
    function pad(n) { return n < 10 ? '0' + n : String(n); }
    function set(k, v) { if (prev[k] !== v) { prev[k] = v; out[k].textContent = v; } }
    function tick() {
      var left = Math.max(0, Math.floor((t - Date.now()) / 1000));
      set('d', pad(Math.floor(left / 86400)));
      set('h', pad(Math.floor(left % 86400 / 3600)));
      set('m', pad(Math.floor(left % 3600 / 60)));
      set('s', pad(left % 60));
      if (left === 0) { clearInterval(timer); box.hidden = true; }
    }
    box.hidden = false;
    tick();
    timer = setInterval(tick, 1000);
  })();

})();
