/* ==========================================================================
   Particle network — dependency-free canvas, tuned for low CPU use.
   - Reacts to mouse, touch and scroll.
   - Particle count scales with screen size and device capability.
   - Watches its own frame time and trims particles automatically if slow.
   - Pauses when the tab is hidden; draws one static frame for reduced motion.
   ========================================================================== */
(function () {
  'use strict';

  var canvas = document.getElementById('bg');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d', { alpha: true });

  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var nav = navigator;
  var weak = (nav.deviceMemory && nav.deviceMemory <= 2) ||
             (nav.hardwareConcurrency && nav.hardwareConcurrency <= 2) ||
             (nav.connection && nav.connection.saveData);
  if (weak) document.documentElement.classList.add('lite');

  var W = 0, H = 0, dpr = 1, parts = [], raf = 0, running = false;
  var ptr = { x: -9999, y: -9999, on: false };
  var scrollV = 0, lastY = window.scrollY || 0;
  var frameAvg = 16, frames = 0, lastTrim = 0, last = 0;

  var LINK = 120;          // link distance (px), reduced on small screens
  var POINTER_R = 150;
  var minFrame = weak ? 33 : 0;   // cap to ~30fps on weak devices

  function targetCount() {
    var base = Math.round((W * H) / 15000);
    var mobile = W < 720;
    if (mobile) base = Math.round(base * 0.7);
    if (weak) base = Math.round(base * 0.55);
    return Math.max(24, Math.min(base, 90));
  }

  function rand(a, b) { return a + Math.random() * (b - a); }

  function make() {
    var kind = Math.random();
    return {
      x: rand(0, W), y: rand(0, H),
      vx: rand(-.12, .12), vy: rand(-.12, .12),
      r: rand(.7, 1.9),
      c: kind < .14 ? 'rgba(255,90,60,' : kind < .22 ? 'rgba(184,145,79,' : 'rgba(244,241,236,'
    };
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, weak ? 1 : 1.5);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    LINK = W < 720 ? 95 : 125;
    var n = targetCount();
    while (parts.length < n) parts.push(make());
    if (parts.length > n) parts.length = n;
    parts.forEach(function (p) { if (p.x > W) p.x = rand(0, W); if (p.y > H) p.y = rand(0, H); });
    if (!running) draw(0);
  }

  function step(dt) {
    var drift = scrollV * 0.35;
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      p.x += p.vx * dt * .06;
      p.y += (p.vy * dt * .06) - drift;

      if (ptr.on) {
        var dx = p.x - ptr.x, dy = p.y - ptr.y, d2 = dx * dx + dy * dy;
        if (d2 < POINTER_R * POINTER_R && d2 > 1) {
          var d = Math.sqrt(d2), f = (1 - d / POINTER_R) * .9;
          p.x += (dx / d) * f; p.y += (dy / d) * f;
        }
      }
      if (p.x < -10) p.x = W + 10; else if (p.x > W + 10) p.x = -10;
      if (p.y < -10) p.y = H + 10; else if (p.y > H + 10) p.y = -10;
    }
    scrollV *= .9;
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    var n = parts.length, L2 = LINK * LINK, i, j, p, q;

    ctx.lineWidth = 1;
    for (i = 0; i < n; i++) {
      p = parts[i];
      for (j = i + 1; j < n; j++) {
        q = parts[j];
        var dx = p.x - q.x; if (dx > LINK || dx < -LINK) continue;
        var dy = p.y - q.y; if (dy > LINK || dy < -LINK) continue;
        var d2 = dx * dx + dy * dy;
        if (d2 < L2) {
          ctx.strokeStyle = 'rgba(244,241,236,' + ((1 - d2 / L2) * .16).toFixed(3) + ')';
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
        }
      }
      if (ptr.on) {
        var px = p.x - ptr.x, py = p.y - ptr.y, pd = px * px + py * py;
        if (pd < POINTER_R * POINTER_R) {
          ctx.strokeStyle = 'rgba(255,90,60,' + ((1 - pd / (POINTER_R * POINTER_R)) * .5).toFixed(3) + ')';
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(ptr.x, ptr.y); ctx.stroke();
        }
      }
    }
    for (i = 0; i < n; i++) {
      p = parts[i];
      ctx.fillStyle = p.c + '.75)';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832); ctx.fill();
    }
  }

  function loop(now) {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    var dt = now - last;
    if (dt < minFrame) return;
    last = now;
    if (dt > 100) dt = 16;            // tab was throttled; avoid a jump

    step(dt);
    draw();

    // adaptive quality: if frames are consistently slow, drop ~20% of particles
    frameAvg = frameAvg * .95 + dt * .05;
    if (++frames > 90 && now - lastTrim > 2500 && frameAvg > 26 && parts.length > 22) {
      parts.length = Math.max(22, Math.floor(parts.length * .8));
      lastTrim = now; frames = 0;
      document.documentElement.classList.add('lite');
    }
  }

  function startLoop() { if (running || reduced) return; running = true; last = performance.now(); raf = requestAnimationFrame(loop); }
  function stopLoop() { running = false; cancelAnimationFrame(raf); }

  /* ---- input ---- */
  function setPtr(x, y) { ptr.x = x; ptr.y = y; ptr.on = true; }
  window.addEventListener('pointermove', function (e) { setPtr(e.clientX, e.clientY); }, { passive: true });
  window.addEventListener('touchstart', function (e) { var t = e.touches[0]; if (t) setPtr(t.clientX, t.clientY); }, { passive: true });
  window.addEventListener('touchmove', function (e) { var t = e.touches[0]; if (t) setPtr(t.clientX, t.clientY); }, { passive: true });
  window.addEventListener('touchend', function () { setTimeout(function () { ptr.on = false; }, 350); }, { passive: true });
  document.addEventListener('pointerleave', function () { ptr.on = false; });
  window.addEventListener('scroll', function () {
    var y = window.scrollY || 0;
    scrollV = Math.max(-6, Math.min(6, scrollV + (y - lastY) * .05));
    lastY = y;
  }, { passive: true });

  var rt = 0;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () {
      // ignore the small height changes caused by mobile browser toolbars showing/hiding
      if (window.innerWidth === W && Math.abs(window.innerHeight - H) < 140) return;
      resize();
    }, 150);
  });
  document.addEventListener('visibilitychange', function () { if (document.hidden) stopLoop(); else startLoop(); });

  resize();
  startLoop();
})();
