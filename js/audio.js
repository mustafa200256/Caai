/* ==========================================================================
   Music player + UI sounds
   - One single <audio> element for the whole page: it is never reloaded or
     restarted when the visitor moves between sections.
   - Never forces playback: if the browser blocks autoplay the button shows a
     "tap to play" state and music starts on the first real interaction.
   - Fades use a Web Audio GainNode (iOS ignores audio.volume); falls back to
     audio.volume when Web Audio is unavailable (e.g. page opened via file://).
   - ON/OFF choice persists in localStorage, playback position in sessionStorage.
   - Missing / broken file => the button is hidden and nothing else breaks.
   ========================================================================== */
(function () {
  'use strict';

  var cfg = (window.MH_CONFIG && window.MH_CONFIG.audio) || {};
  var btn = document.getElementById('music-toggle');
  var KEY_PREF = 'mh.audio.pref';   // 'on' | 'off' (absent on first visit)
  var KEY_POS = 'mh.audio.pos';

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } }

  var pref = lsGet(KEY_PREF);       // null on first visit
  var state = 'off';                // 'off' | 'playing' | 'pending'
  var unavailable = false;

  var audio = null, ctx = null, gain = null, graphReady = false, useGain = false;
  var level = 0, fadeId = 0, seekTo = null, restoredPos = false;
  var starting = false, resumeAfterHide = false, posTimer = 0, gestureArmed = false;

  var LABELS = {
    playing: 'الموسيقى تعمل',
    off: 'الموسيقى متوقفة',
    pending: 'اضغط لتشغيل الموسيقى'
  };

  /* ------------------------------ UI state ------------------------------ */
  function setState(s) {
    state = s;
    if (!btn) return;
    btn.dataset.state = s;
    btn.setAttribute('aria-pressed', s === 'playing' ? 'true' : 'false');
    btn.setAttribute('aria-label', s === 'playing' ? 'إيقاف الموسيقى' : 'تشغيل الموسيقى');
    var l = btn.querySelector('.music-label');
    if (l) l.textContent = LABELS[s];
  }

  function setPref(v) { pref = v; lsSet(KEY_PREF, v); }

  function markUnavailable() {
    if (unavailable) return;
    unavailable = true;
    cancelAnimationFrame(fadeId);
    if (audio) { try { audio.pause(); } catch (e) { /* ignore */ } }
    stopPosTimer();
    if (btn) btn.hidden = true;
    document.documentElement.classList.add('no-music');
  }

  /* ------------------------------ audio graph ----------------------------- */
  function ensureAudio() {
    if (audio) return audio;
    audio = new Audio();
    audio.preload = 'none';           // nothing is downloaded until the visitor starts the music
    audio.loop = true;
    audio.setAttribute('playsinline', '');
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* ignore */ }
    audio.addEventListener('error', markUnavailable);
    audio.addEventListener('loadedmetadata', function () {
      if (seekTo != null) { try { audio.currentTime = seekTo; } catch (e) { /* ignore */ } seekTo = null; }
    });
    audio.src = cfg.src;
    return audio;
  }

  function setupGraph() {
    if (graphReady) return;
    graphReady = true;
    var AC = window.AudioContext || window.webkitAudioContext;
    // MediaElementSource is silent for file:// pages, so only use it over http(s).
    if (!AC || location.protocol === 'file:') return;
    try {
      ctx = new AC();
      var src = ctx.createMediaElementSource(audio);
      gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(gain);
      gain.connect(ctx.destination);
      useGain = true;
    } catch (e) { ctx = null; gain = null; useGain = false; }
  }

  function setLevel(v) {
    level = v;
    if (useGain) { gain.gain.value = v; }
    else { try { audio.volume = Math.max(0, Math.min(1, v)); } catch (e) { /* ignore */ } }
  }

  function fadeTo(target, ms, done) {
    cancelAnimationFrame(fadeId);
    var from = level, t0 = performance.now();
    if (ms <= 0 || document.hidden) { setLevel(target); if (done) done(); return; }
    (function step(now) {
      var p = Math.min(1, (now - t0) / ms);
      var e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;   // easeInOut
      setLevel(from + (target - from) * e);
      if (p < 1) fadeId = requestAnimationFrame(step);
      else if (done) done();
    })(t0);
  }

  /* ------------------------------ position memory ------------------------- */
  function savePos() { if (audio && isFinite(audio.currentTime) && audio.currentTime > 0) ssSet(KEY_POS, String(audio.currentTime)); }
  function startPosTimer() { stopPosTimer(); posTimer = setInterval(savePos, 2000); }
  function stopPosTimer() { clearInterval(posTimer); posTimer = 0; }

  /* ------------------------------ play / stop ----------------------------- */
  function canAutostart() {
    try {
      if (navigator.userActivation && navigator.userActivation.hasBeenActive) return true;
      if (navigator.getAutoplayPolicy) {
        return navigator.getAutoplayPolicy('mediaelement') === 'allowed' &&
               navigator.getAutoplayPolicy('audiocontext') === 'allowed';
      }
    } catch (e) { /* ignore */ }
    return false;
  }

  function start() {
    if (unavailable || starting) return Promise.resolve(false);
    ensureAudio();

    // Still fading out from a previous "OFF": just fade back in, don't restart the track.
    if (!audio.paused && state !== 'playing') {
      setState('playing');
      fadeTo(cfg.targetVolume, cfg.fadeInMs);
      startPosTimer();
      return Promise.resolve(true);
    }

    starting = true;
    setupGraph();

    // iOS / Android only allow play() and AudioContext.resume() while the tap is still
    // "active", so both are called synchronously here — never after an await/then.
    var resumeP = (ctx && ctx.state !== 'running') ? ctx.resume() : null;
    if (resumeP && resumeP.catch) resumeP.catch(function () {});

    if (!restoredPos) {
      restoredPos = true;
      var t = parseFloat(ssGet(KEY_POS));
      if (isFinite(t) && t > 1) seekTo = t;
    }
    setLevel(0);

    var playP;
    try { playP = audio.play(); }
    catch (e) { starting = false; setState('pending'); return Promise.resolve(false); }

    return Promise.resolve(playP).then(function () {
      return resumeP ? resumeP.catch(function () {}) : null;
    }).then(function () {
      if (ctx && ctx.state !== 'running') {            // context still blocked: stay in "tap to play"
        audio.pause(); setState('pending'); return false;
      }
      if (seekTo != null && audio.readyState >= 1) { try { audio.currentTime = seekTo; } catch (e) { /* ignore */ } seekTo = null; }
      setState('playing');
      fadeTo(cfg.targetVolume, cfg.fadeInMs);
      startPosTimer();
      return true;
    }, function (err) {
      var n = err && err.name;
      if (n === 'NotAllowedError') { setState('pending'); }
      else if (n !== 'AbortError') { markUnavailable(); }
      return false;
    }).then(function (ok) { starting = false; return ok; },
            function () { starting = false; return false; });
  }

  function stop() {
    stopPosTimer();
    savePos();
    var wasPlaying = state === 'playing';
    setState('off');
    if (!audio || !wasPlaying) return;
    fadeTo(0, cfg.fadeOutMs, function () {
      if (state === 'off') { audio.pause(); savePos(); }
    });
  }

  function toggle() {
    if (state === 'playing') { setPref('off'); stop(); }
    else { setPref('on'); start(); }
  }

  /* ------------------------ first-interaction start ----------------------- */
  function onGesture(e) {
    if (btn && btn.contains(e.target)) return;               // the toggle handles itself
    if (unavailable || pref === 'off' || state === 'playing') { disarm(); return; }
    if (state !== 'pending') return;
    start().then(function (ok) { if (ok) disarm(); });
  }
  var GESTURES = ['pointerup', 'click', 'keydown', 'touchend'];
  function armGesture() {
    if (gestureArmed) return;
    gestureArmed = true;
    GESTURES.forEach(function (n) { document.addEventListener(n, onGesture, { capture: true, passive: true }); });
  }
  function disarm() {
    if (!gestureArmed) return;
    gestureArmed = false;
    GESTURES.forEach(function (n) { document.removeEventListener(n, onGesture, { capture: true }); });
  }

  /* ------------------------------ lifecycle ------------------------------- */
  document.addEventListener('visibilitychange', function () {
    if (!audio || unavailable) return;
    if (document.hidden) {
      if (state === 'playing' && !audio.paused) { resumeAfterHide = true; audio.pause(); savePos(); }
    } else if (resumeAfterHide) {
      resumeAfterHide = false;
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(function () {});
      if (state === 'playing') {
        audio.play().catch(function () { setState('pending'); armGesture(); });
      }
    }
  });
  window.addEventListener('pagehide', savePos);

  function checkFile() {
    if (!window.fetch) return;
    var run = function () {
      fetch(cfg.src, { method: 'HEAD', cache: 'no-store' })
        .then(function (r) { if (r.status === 404 || r.status === 410) markUnavailable(); })
        .catch(function () { /* offline or file:// — rely on the audio error event instead */ });
    };
    if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 3000 });
    else setTimeout(run, 1500);
  }

  function init() {
    if (!btn) return;
    if (!cfg.src) { btn.hidden = true; return; }
    var t = btn.querySelector('.music-track');
    if (t && cfg.title) t.textContent = cfg.title;

    btn.addEventListener('click', toggle);
    checkFile();

    if (pref === 'off') { setState('off'); return; }

    if (canAutostart()) {
      setState('pending');
      start().then(function (ok) { if (!ok && !unavailable && state === 'pending') armGesture(); });
    } else {
      setState('pending');
      armGesture();
    }
  }

  /* ------------------------------ UI sounds ------------------------------- */
  var sfxCtx = null, noise = null;

  function sfxAllowed() { return pref !== 'off' && !unavailable; }

  function getSfx() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      if (!sfxCtx) sfxCtx = new AC();
      if (sfxCtx.state === 'suspended') sfxCtx.resume();
      return sfxCtx;
    } catch (e) { return null; }
  }

  function click() {
    if (!sfxAllowed()) return;
    var c = getSfx(); if (!c) return;
    var t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(680, t);
    o.frequency.exponentialRampToValueAtTime(500, t + 0.09);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.03, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + 0.12);
  }

  function whoosh() {
    if (!sfxAllowed()) return;
    var c = getSfx(); if (!c) return;
    if (!noise) {
      noise = c.createBuffer(1, Math.floor(c.sampleRate * 1), c.sampleRate);
      var d = noise.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    var t = c.currentTime, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = noise;
    f.type = 'bandpass'; f.Q.value = 0.9;
    f.frequency.setValueAtTime(220, t);
    f.frequency.exponentialRampToValueAtTime(2200, t + 0.5);
    f.frequency.exponentialRampToValueAtTime(400, t + 1.0);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
    s.connect(f); f.connect(g); g.connect(c.destination);
    s.start(t); s.stop(t + 1.02);
  }

  window.MH_AUDIO = { click: click, whoosh: whoosh };

  init();
})();
