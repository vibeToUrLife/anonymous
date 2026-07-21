/* ════════════════════════════════════════════════════════════════
   horse-race.js — 🏇 全站赛马 · 万能决策器 (更多玩法)
   Anyone writes 2~12 options; each becomes a hand-drawn racehorse
   (with jockey) in a broadcast-style camera view: the camera follows
   the pack, the finish line stays OFF-SCREEN until the very end, and
   surges/overtakes are amplified because the camera only frames ~20%
   of the track. EVERYONE online sees the SAME race: the creator
   writes one tiny record {options, seed, startAt} to RTDB
   (horse_race/current) and every client replays the identical
   deterministic simulation — position is a pure function of
   (seed, horse, t) with t driven by Firebase server time.
   One race at a time site-wide (enforced by RTDB rules); a new race
   auto-pops the overlay for everyone (dismiss per race via ✕).
   Betting is intentionally NOT in v1 (future: current/bets/{uid}).
   ════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── constants ─────────────────────────────────────────────── */
  var COUNTDOWN_MS  = 15000;   // gate-open countdown after 开赛
  var FINISH_MIN_MS = 22000;   // fastest possible horse
  var FINISH_VAR_MS = 10000;   // finish spread → 22~32s
  var OVERRUN_MS    = 1500;    // glide past the line after finishing
  var END_HOLD_MS   = 2000;    // after last horse crosses → results
  var REOPEN_GAP_MS = 60000;   // rules allow a new race 60s after startAt
  var MIN_OPTS = 2, MAX_OPTS = 12, MAX_OPT_LEN = 24;
  var VIEW = 0.20;             // camera frames 20% of the track → drama zoom
  var LEAD_AT = 0.68;          // leader pinned at 68% of frame width
  var FINISH_AT = 0.74;        // where the finish post settles at the end

  var REDUCED = false;
  try { REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  /* 12 coat palettes: c=coat l=shade-light m=mane/tail a=silks/cloth */
  var COATS = [
    { c: '#a35c22', l: '#c07f42', m: '#5c3210', a: '#2563eb' },            // 栗
    { c: '#463f3c', l: '#635a56', m: '#221d1b', a: '#f59e0b' },            // 黑
    { c: '#e9e4d8', l: '#f7f4ec', m: '#b7ae9c', a: '#dc2626' },            // 白
    { c: '#c9963d', l: '#e0b96a', m: '#efe0b8', a: '#16a34a' },            // 金
    { c: '#8d939c', l: '#aab0b9', m: '#54585f', a: '#7c3aed' },            // 灰
    { c: '#8a4a2c', l: '#a86844', m: '#2a201d', a: '#0891b2' },            // 枣红
    { c: '#e5decf', l: '#f4efe4', m: '#6e421e', a: '#db2777', p: 1 },      // 花斑
    { c: '#5f3a20', l: '#7d5432', m: '#20160e', a: '#65a30d' },            // 深棕
    { c: '#e2d2b6', l: '#f1e6d2', m: '#c3b090', a: '#ea580c' },            // 奶油
    { c: '#6f7c8b', l: '#93a0ae', m: '#333a42', a: '#e11d48' },            // 青灰
    { c: '#b3653a', l: '#cd8a5e', m: '#7a3f1a', a: '#4f46e5' },            // 红棕
    { c: '#70421d', l: '#8f5f35', m: '#3e250e', a: '#0d9488' }             // 深栗
  ];
  var CROWD = ['#d8b4a0', '#a0b8d8', '#d8d0a0', '#b8a0d8', '#a0d8c0', '#d8a0a8', '#c8c8c8'];

  /* ── sound (Web Audio, all synthesized — no audio files) ───── */
  var SND = (function () {
    var ac = null, master = null, noiseBuf = null;
    var muted = false;
    try { muted = localStorage.getItem('hr_sound') === '0'; } catch (e) {}
    var crowd = null, crowdGain = null;     // looping crowd-noise bed
    var hoofNext = 0, hoofOn = false;
    var VOL = 0.5;

    function ensure() {
      if (ac) return true;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      try { ac = new AC(); } catch (e) { return false; }
      master = ac.createGain();
      master.gain.value = muted ? 0 : VOL;
      master.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      return true;
    }
    function resume() { if (ac && ac.state === 'suspended') { try { ac.resume(); } catch (e) {} } }
    function env(g, t0, a, peak, dec) {
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(peak, t0 + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + dec);
    }
    function blip(freq, t0, peak, dec, type) {
      var o = ac.createOscillator(), g = ac.createGain();
      o.type = type || 'sine'; o.frequency.value = freq;
      o.connect(g); g.connect(master);
      env(g, t0, 0.008, peak, dec);
      o.start(t0); o.stop(t0 + dec + 0.05);
    }
    function noise(t0, peak, dec, freq, q) {
      var src = ac.createBufferSource(); src.buffer = noiseBuf;
      src.playbackRate.value = 0.85 + Math.random() * 0.3;
      var flt = ac.createBiquadFilter();
      flt.type = 'bandpass'; flt.frequency.value = freq; flt.Q.value = q || 1;
      var g = ac.createGain();
      src.connect(flt); flt.connect(g); g.connect(master);
      env(g, t0, 0.005, peak, dec);
      src.start(t0, Math.random() * 0.5); src.stop(t0 + dec + 0.05);
    }

    return {
      poke: function () { resume(); },
      muted: function () { return muted; },
      toggle: function () {
        muted = !muted;
        try { localStorage.setItem('hr_sound', muted ? '0' : '1'); } catch (e) {}
        if (ensure()) {
          resume();
          master.gain.setTargetAtTime(muted ? 0 : VOL, ac.currentTime, 0.03);
        }
        return muted;
      },
      tick: function (last) {
        if (muted || !ensure()) return; resume();
        blip(last ? 1318 : 880, ac.currentTime, 0.10, 0.10, 'sine');
      },
      bell: function () {                       // starting gate bell
        if (muted || !ensure()) return; resume();
        var t0 = ac.currentTime;
        blip(1568, t0, 0.16, 0.7, 'triangle');
        blip(2093, t0, 0.10, 0.55, 'sine');
        blip(1046, t0 + 0.015, 0.06, 0.4, 'sine');
      },
      /* per-frame while racing: schedule gallop hits ahead + drive crowd.
         avgSf = mean normalized pack speed (surges → faster hoof tempo),
         pLead = leader progress (crowd swells over the final stretch). */
      race: function (avgSf, pLead) {
        if (muted || !ensure()) return; resume();
        var t = ac.currentTime;
        if (!crowd) {
          crowd = ac.createBufferSource(); crowd.buffer = noiseBuf; crowd.loop = true;
          var f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 750; f.Q.value = 0.6;
          crowdGain = ac.createGain(); crowdGain.gain.value = 0;
          crowd.connect(f); f.connect(crowdGain); crowdGain.connect(master);
          crowd.start();
        }
        var lvl = 0.10 + (pLead > 0.82 ? (Math.min(pLead, 1) - 0.82) / 0.18 * 0.14 : 0);
        crowdGain.gain.setTargetAtTime(lvl, t, 0.4);
        if (!hoofOn) { hoofOn = true; hoofNext = t + 0.05; }
        var stride = 1 / (1.9 + 0.5 * avgSf);   // gallop: da-da-da-DUM per stride
        var beats = [0, 0.14, 0.28, 0.47], vols = [0.35, 0.45, 0.55, 0.8];
        while (hoofNext < t + 0.30) {
          for (var L = 0; L < 2; L++) {          // two pack layers for depth
            var jit = L ? 0.045 : 0;
            for (var b = 0; b < beats.length; b++) {
              noise(hoofNext + beats[b] * stride + jit + Math.random() * 0.012,
                    vols[b] * (L ? 0.10 : 0.16), 0.055, 150 + Math.random() * 90, 1.1);
            }
          }
          hoofNext += stride;
        }
      },
      cheer: function () {                      // winner crosses the line
        if (muted || !ensure()) return; resume();
        var t0 = ac.currentTime;
        if (crowdGain) {
          crowdGain.gain.setTargetAtTime(0.34, t0, 0.06);
          crowdGain.gain.setTargetAtTime(0.14, t0 + 1.4, 0.5);
        }
        for (var i = 0; i < 8; i++) {            // scattered claps/whistles
          noise(t0 + Math.random() * 0.9, 0.10, 0.05, 2200 + Math.random() * 1500, 2);
        }
        var notes = [523.25, 659.25, 783.99, 1046.5];   // C‑E‑G‑C fanfare
        for (var k = 0; k < notes.length; k++) {
          blip(notes[k], t0 + 0.05 + k * 0.10, 0.12, k === 3 ? 0.5 : 0.16, 'triangle');
        }
      },
      raceEnd: function () {                    // all horses home → wind down
        if (!ac) return;
        hoofOn = false;
        if (crowdGain) crowdGain.gain.setTargetAtTime(0.0001, ac.currentTime, 0.8);
      },
      stopAll: function () {
        if (!ac) return;
        hoofOn = false;
        if (crowdGain) crowdGain.gain.setTargetAtTime(0.0001, ac.currentTime, 0.1);
      },
      setHidden: function (hid) {               // tab hidden → duck to silence
        if (!ac) return;
        master.gain.setTargetAtTime((hid || muted) ? 0 : VOL, ac.currentTime, 0.05);
      }
    };
  })();

  /* ── firebase handles ──────────────────────────────────────── */
  var rtdb = null;
  try { rtdb = firebase.database ? firebase.database() : null; } catch (e) { rtdb = null; }
  var srvOffset = 0;
  function serverNow() { return Date.now() + srvOffset; }
  function toast(msg, type) { if (typeof showToast === 'function') showToast(msg, type || ''); }
  function myName() {
    var u = (firebase.auth && firebase.auth().currentUser) || null;
    return (localStorage.getItem('flappy_name') || (u && u.displayName) || '匿名').slice(0, 40);
  }

  /* ── deterministic simulation ──────────────────────────────── */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Each horse: a finish time + 3 bounded sine waves over normalized race
     time u∈[0,1]. progress(u) = u + Σ amp·sin(2πf·u+φ)·sin(πu). Amps are
     scaled so |d(wobble)/du| < 1 → strictly monotone (never runs backward),
     endpoints are exact. Ranking is fully determined by the seed. */
  var WAVE_BANDS = [
    { f0: 0.5, f1: 1.0, budget: 0.55 },
    { f0: 1.2, f1: 2.0, budget: 0.28 },
    { f0: 2.6, f1: 4.2, budget: 0.12 }
  ];
  function precompute(seed, n) {
    var horses = [];
    for (var i = 0; i < n; i++) {
      var rng = mulberry32((seed ^ Math.imul(i + 1, 2654435761)) | 0);
      var finish = FINISH_MIN_MS + rng() * FINISH_VAR_MS;
      var waves = [];
      for (var k = 0; k < WAVE_BANDS.length; k++) {
        var b = WAVE_BANDS[k];
        var f = b.f0 + rng() * (b.f1 - b.f0);
        var budget = b.budget * (0.35 + 0.65 * rng());
        waves.push({ f: f, amp: budget / (2 * Math.PI * f + Math.PI), ph: rng() * Math.PI * 2 });
      }
      horses.push({ i: i, finish: finish, waves: waves, gallop: rng() * 6, pal: COATS[i % COATS.length] });
    }
    var order = horses.slice().sort(function (a, b) { return a.finish - b.finish || a.i - b.i; });
    for (var r = 0; r < order.length; r++) order[r].rank = r;
    return horses;
  }
  function progressAt(h, tMs) {
    if (tMs <= 0) return 0;
    if (tMs >= h.finish) {
      var o = Math.min((tMs - h.finish) / OVERRUN_MS, 1);
      return 1 + (1 - (1 - o) * (1 - o)) * 0.045;
    }
    var u = tMs / h.finish, w = 0;
    for (var k = 0; k < h.waves.length; k++) {
      var wv = h.waves[k];
      w += wv.amp * Math.sin(2 * Math.PI * wv.f * u + wv.ph);
    }
    return u + w * Math.sin(Math.PI * u);
  }
  /* normalized instantaneous speed (~1 = average pace) for cadence/lean */
  function speedAt(h, tMs) {
    if (tMs <= 0 || tMs >= h.finish) return tMs >= h.finish + OVERRUN_MS ? 0 : 0.4;
    var d = 160;
    var v = (progressAt(h, Math.min(tMs + d, h.finish - 1)) - progressAt(h, Math.max(tMs - d, 1))) / (2 * d);
    return Math.max(0.3, Math.min(1.8, v * h.finish));
  }

  /* ── race state ────────────────────────────────────────────── */
  var race = null, horses = null;
  var overlay = null, canvas = null, ctx = null;
  var isOpen = false, view = 'setup';
  var rafId = 0, lastFrameTs = 0;
  var lastAutoId = null, resultsShownFor = null, lastCountNum = null;
  var cheeredFor = null, endedFor = null;   // per-race sound gates
  var el = {};

  function raceOpts() {
    if (!race) return [];
    var o = race.options;
    if (Array.isArray(o)) return o;
    return Object.keys(o).sort(function (a, b) { return a - b; }).map(function (k) { return o[k]; });
  }
  function maxFinish() {
    var m = 0;
    for (var i = 0; i < horses.length; i++) m = Math.max(m, horses[i].finish);
    return m;
  }
  function minFinish() {
    var m = Infinity;
    for (var i = 0; i < horses.length; i++) m = Math.min(m, horses[i].finish);
    return m;
  }
  function stageNow() {
    if (!race || !horses) return 'none';
    var t = serverNow() - race.startAt;
    if (t < 0) return 'countdown';
    if (t < maxFinish() + END_HOLD_MS) return 'racing';
    return 'done';
  }

  /* ── styles ────────────────────────────────────────────────── */
  var css = '' +
  '.hr-overlay{position:fixed;inset:0;z-index:640;display:none;align-items:center;justify-content:center;' +
    'padding:14px;background:rgba(8,14,10,.74);backdrop-filter:blur(4px);}' +
  '.hr-overlay.show{display:flex;animation:pgFadeIn .2s ease;}' +
  '.hr-card{position:relative;width:100%;max-width:860px;max-height:92vh;display:flex;flex-direction:column;' +
    'background:linear-gradient(168deg,#14301f 0%,#0b2013 100%);border:1px solid rgba(255,255,255,.1);' +
    'border-radius:22px;box-shadow:0 26px 70px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.06);overflow:hidden;}' +
  '.hr-head{display:flex;align-items:center;gap:10px;padding:14px 52px 10px 18px;flex-shrink:0;}' +
  '.hr-mark{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;font-size:19px;' +
    'background:linear-gradient(135deg,#15803d,#166534);box-shadow:0 4px 14px rgba(21,128,61,.45);}' +
  '.hr-title{font-size:17px;font-weight:700;color:#fff;}' +
  '.hr-sub{font-size:11px;color:rgba(255,255,255,.55);}' +
  '.hr-close{position:absolute;top:10px;right:10px;z-index:2;width:40px;height:40px;border:none;border-radius:50%;' +
    'background:rgba(255,255,255,.1);color:#fff;font-size:15px;cursor:pointer;transition:background .15s;}' +
  '.hr-close:hover{background:rgba(255,80,80,.5);}' +
  '.hr-close:active{transform:scale(.94);}' +
  '.hr-body{padding:6px 16px 16px;overflow-y:auto;flex:1;min-height:0;}' +
  /* setup view */
  '.hr-setup-tip{font-size:12px;color:rgba(255,255,255,.65);margin:4px 2px 8px;}' +
  '.hr-ta{width:100%;min-height:170px;resize:vertical;box-sizing:border-box;padding:12px;border-radius:14px;' +
    'border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.28);color:#fff;font-size:14px;line-height:1.7;outline:none;}' +
  '.hr-ta:focus{border-color:#4ade80;}' +
  '.hr-ta::placeholder{color:rgba(255,255,255,.3);}' +
  '.hr-err{font-size:12px;color:#fca5a5;min-height:16px;margin:6px 2px;}' +
  '.hr-start{width:100%;min-height:48px;padding:13px;border:none;border-radius:14px;cursor:pointer;font-size:15px;' +
    'font-weight:700;color:#052e12;background:linear-gradient(135deg,#fbbf24,#d97706);box-shadow:0 6px 18px rgba(217,119,6,.35);' +
    'transition:transform .12s;}' +
  '.hr-start:active{transform:scale(.98);}' +
  '.hr-start:disabled{opacity:.55;cursor:not-allowed;transform:none;}' +
  '.hr-last{margin-top:12px;padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.06);' +
    'font-size:12.5px;color:rgba(255,255,255,.8);cursor:pointer;line-height:1.6;transition:background .15s;}' +
  '.hr-last:hover{background:rgba(255,255,255,.1);}' +
  /* live view: canvas + HUD chips */
  '.hr-trackwrap{position:relative;border-radius:14px;overflow:hidden;box-shadow:inset 0 2px 10px rgba(0,0,0,.35);}' +
  '.hr-canvas{display:block;width:100%;}' +
  '.hr-chip{position:absolute;top:10px;display:flex;align-items:center;gap:7px;max-width:46%;' +
    'background:rgba(8,12,8,.62);backdrop-filter:blur(6px);border:1px solid rgba(255,255,255,.16);' +
    'border-radius:999px;padding:5px 12px;color:#fff;font-size:12px;font-weight:700;}' +
  '.hr-chip-live{left:10px;}' +
  '.hr-chip-lead{right:10px;}' +
  '.hr-livedot{width:8px;height:8px;border-radius:50%;background:#ef4444;flex-shrink:0;' +
    'animation:hrPulse 1.2s ease-out infinite;}' +
  '@keyframes hrPulse{0%{box-shadow:0 0 0 0 rgba(239,68,68,.55);}100%{box-shadow:0 0 0 7px rgba(239,68,68,0);}}' +
  '.hr-clock{font-family:"Russo One",system-ui,sans-serif;font-weight:400;font-variant-numeric:tabular-nums;' +
    'letter-spacing:.5px;font-size:12.5px;color:#fde68a;}' +
  '.hr-leaddot{width:9px;height:9px;border-radius:50%;flex-shrink:0;box-shadow:0 0 0 2px rgba(255,255,255,.3);}' +
  '.hr-leadname{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;}' +
  '.hr-leadtag{color:#fbbf24;flex-shrink:0;}' +
  '.hr-count{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
    'pointer-events:none;background:radial-gradient(ellipse at center,rgba(4,10,5,.45),rgba(4,10,5,.12));}' +
  '.hr-count .num{font-family:"Russo One",system-ui,sans-serif;font-size:86px;color:#fbbf24;line-height:1;' +
    'text-shadow:0 4px 30px rgba(217,119,6,.55),0 2px 6px rgba(0,0,0,.6);}' +
  '.hr-count .num.tick{animation:hrTick .5s ease-out;}' +
  '@keyframes hrTick{0%{transform:scale(1.22);}100%{transform:scale(1);}}' +
  '.hr-count .lbl{font-size:13px;font-weight:600;color:rgba(255,255,255,.92);margin-top:8px;' +
    'text-shadow:0 2px 8px rgba(0,0,0,.8);padding:0 16px;text-align:center;}' +
  '.hr-count.go .num{color:#4ade80;text-shadow:0 4px 30px rgba(74,222,128,.6),0 2px 6px rgba(0,0,0,.6);}' +
  '.hr-mute{position:absolute;bottom:10px;right:10px;width:40px;height:40px;border:1px solid rgba(255,255,255,.16);' +
    'border-radius:50%;background:rgba(8,12,8,.62);backdrop-filter:blur(6px);color:#fff;font-size:16px;' +
    'cursor:pointer;transition:transform .12s;display:grid;place-items:center;}' +
  '.hr-mute:active{transform:scale(.92);}' +
  /* results: podium + rows */
  '.hr-results{margin-top:12px;}' +
  '.hr-res-champ{font-size:15px;font-weight:800;color:#fde68a;text-align:center;margin:2px 0 10px;}' +
  '.hr-podium{display:flex;align-items:flex-end;gap:8px;margin:0 0 10px;}' +
  '.hr-pod{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:3px;' +
    'border-radius:12px 12px 5px 5px;padding:10px 6px 8px;min-width:0;}' +
  '.hr-pod .pm{font-size:20px;line-height:1;}' +
  '.hr-pod .pd{width:12px;height:12px;border-radius:50%;box-shadow:0 0 0 2px rgba(255,255,255,.3);}' +
  '.hr-pod .pn{font-size:12.5px;font-weight:700;color:#fff;max-width:100%;overflow:hidden;' +
    'text-overflow:ellipsis;white-space:nowrap;}' +
  '.hr-pod .pt{font-family:"Russo One",system-ui,sans-serif;font-size:10.5px;color:rgba(255,255,255,.6);' +
    'font-variant-numeric:tabular-nums;}' +
  '.hr-pod-1{height:104px;background:linear-gradient(180deg,rgba(251,191,36,.30),rgba(251,191,36,.04));' +
    'border:1px solid rgba(251,191,36,.45);border-bottom-width:3px;}' +
  '.hr-pod-2{height:78px;background:linear-gradient(180deg,rgba(203,213,225,.22),rgba(203,213,225,.03));' +
    'border:1px solid rgba(203,213,225,.35);}' +
  '.hr-pod-3{height:64px;background:linear-gradient(180deg,rgba(217,119,6,.20),rgba(217,119,6,.03));' +
    'border:1px solid rgba(217,119,6,.35);}' +
  '.hr-res-row{display:flex;align-items:center;gap:9px;padding:7px 10px;border-radius:10px;margin-bottom:5px;' +
    'background:rgba(255,255,255,.05);font-size:13.5px;color:#fff;}' +
  '.hr-res-rank{width:24px;text-align:center;font-family:"Russo One",system-ui,sans-serif;font-size:12px;' +
    'color:rgba(255,255,255,.65);flex-shrink:0;}' +
  '.hr-res-dot{width:11px;height:11px;border-radius:50%;flex-shrink:0;box-shadow:0 0 0 2px rgba(255,255,255,.25);}' +
  '.hr-res-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
  '.hr-res-time{font-family:"Russo One",system-ui,sans-serif;font-size:11px;color:rgba(255,255,255,.55);' +
    'font-variant-numeric:tabular-nums;}' +
  '.hr-again{width:100%;min-height:48px;margin-top:10px;padding:12px;border:none;border-radius:14px;cursor:pointer;' +
    'font-size:14px;font-weight:700;color:#052e12;background:linear-gradient(135deg,#fbbf24,#d97706);transition:transform .12s;}' +
  '.hr-again:active{transform:scale(.98);}' +
  '@media (max-width:520px){.hr-overlay{padding:8px;}.hr-body{padding:4px 10px 12px;}.hr-count .num{font-size:64px;}' +
    '.hr-pod-1{height:88px;}.hr-pod-2{height:66px;}.hr-pod-3{height:56px;}}' +
  '@media (prefers-reduced-motion: reduce){.hr-livedot{animation:none;}.hr-count .num.tick{animation:none;}}';

  /* ── overlay DOM ───────────────────────────────────────────── */
  function injectAssets() {
    if (document.getElementById('hr-style')) return;
    var st = document.createElement('style');
    st.id = 'hr-style'; st.textContent = css;
    document.head.appendChild(st);
    /* Russo One — sporty display digits for clock/countdown (site already
       preconnects to fonts.googleapis.com; Chinese text stays system font) */
    var f = document.createElement('link');
    f.rel = 'stylesheet';
    f.href = 'https://fonts.googleapis.com/css2?family=Russo+One&display=swap';
    document.head.appendChild(f);
  }

  function buildOverlay() {
    if (overlay) return;
    injectAssets();
    overlay = document.createElement('div');
    overlay.className = 'hr-overlay';
    overlay.innerHTML =
      '<div class="hr-card">' +
        '<button class="hr-close" id="hrClose" title="关闭" aria-label="关闭">✕</button>' +
        '<div class="hr-head">' +
          '<div class="hr-mark">🏇</div>' +
          '<div><div class="hr-title">赛马 · 万能决策</div>' +
          '<div class="hr-sub">写下选项让马来决定 — 全站实时一起看</div></div>' +
        '</div>' +
        '<div class="hr-body">' +
          '<div id="hrSetup">' +
            '<div class="hr-setup-tip">一行一个选项（' + MIN_OPTS + '~' + MAX_OPTS + ' 个，每个 ≤' + MAX_OPT_LEN + ' 字）。开赛后倒计时 ' +
              (COUNTDOWN_MS / 1000) + ' 秒，全站在线的人都会看到同一场比赛！</div>' +
            '<textarea class="hr-ta" id="hrTa" maxlength="400" placeholder="例如：\n奶茶\n咖啡\n柠檬茶\n不喝了省钱"></textarea>' +
            '<div class="hr-err" id="hrErr"></div>' +
            '<button class="hr-start" id="hrStart">🏁 开赛！</button>' +
            '<div class="hr-last" id="hrLast" style="display:none"></div>' +
          '</div>' +
          '<div id="hrLive" style="display:none">' +
            '<div class="hr-trackwrap">' +
              '<canvas class="hr-canvas" id="hrCanvas"></canvas>' +
              '<div class="hr-chip hr-chip-live" id="hrChipLive" style="display:none">' +
                '<span class="hr-livedot"></span><span id="hrLiveTxt">LIVE</span>' +
                '<span class="hr-clock" id="hrClock"></span></div>' +
              '<div class="hr-chip hr-chip-lead" id="hrChipLead" style="display:none">' +
                '<span class="hr-leadtag" id="hrLeadTag">领先</span>' +
                '<span class="hr-leaddot" id="hrLeadDot"></span>' +
                '<span class="hr-leadname" id="hrLeadName"></span></div>' +
              '<div class="hr-count" id="hrCount" style="display:none">' +
                '<div class="num" id="hrCountNum"></div><div class="lbl" id="hrCountLbl"></div></div>' +
              '<button class="hr-mute" id="hrMute" aria-label="声音开关">🔊</button>' +
            '</div>' +
            '<div class="hr-results" id="hrResults" style="display:none"></div>' +
            '<button class="hr-again" id="hrAgain" style="display:none">🏇 发起新比赛</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    ['hrClose', 'hrSetup', 'hrTa', 'hrErr', 'hrStart', 'hrLast', 'hrLive',
     'hrCanvas', 'hrChipLive', 'hrLiveTxt', 'hrClock', 'hrChipLead', 'hrLeadTag', 'hrLeadDot', 'hrLeadName',
     'hrCount', 'hrCountNum', 'hrCountLbl', 'hrMute', 'hrResults', 'hrAgain']
      .forEach(function (id) { el[id] = document.getElementById(id); });
    canvas = el.hrCanvas; ctx = canvas.getContext('2d');

    el.hrMute.textContent = SND.muted() ? '🔇' : '🔊';
    el.hrMute.addEventListener('click', function (e) {
      e.stopPropagation();
      el.hrMute.textContent = SND.toggle() ? '🔇' : '🔊';
    });
    el.hrClose.addEventListener('click', closeOverlay);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeOverlay(); });
    el.hrStart.addEventListener('click', startRace);
    el.hrAgain.addEventListener('click', function () { showView('setup'); });
    el.hrLast.addEventListener('click', function () { showView('live'); });
    window.addEventListener('resize', function () { if (isOpen && view === 'live') sizeCanvas(); });
  }

  function openOverlay(which) {
    buildOverlay();
    isOpen = true;
    overlay.classList.add('show');
    showView(which);
    startLoop();
  }
  function closeOverlay() {
    if (!isOpen) return;
    isOpen = false;
    overlay.classList.remove('show');
    stopLoop();
    SND.stopAll();
    if (race && stageNow() !== 'done') {
      try { sessionStorage.setItem('hr_dismissed', race.id); } catch (e) {}
    }
  }
  function showView(v) {
    view = v;
    el.hrSetup.style.display = v === 'setup' ? '' : 'none';
    el.hrLive.style.display = v === 'live' ? '' : 'none';
    resultsShownFor = null; lastCountNum = null;
    if (v !== 'live') SND.stopAll();
    if (v === 'live') sizeCanvas();
    refreshSetup(true);
  }

  /* ── canvas sizing / geometry ──────────────────────────────── */
  var geo = { W: 0, H: 0, laneH: 0, s: 0, dpr: 1, skyH: 0, crowdH: 0, trackY: 0, labels: [] };
  function sizeCanvas() {
    if (!canvas || !horses) { if (canvas) { canvas.width = 0; canvas.height = 0; } return; }
    var n = horses.length;
    var wrapW = el.hrLive.clientWidth || overlay.querySelector('.hr-body').clientWidth || 600;
    var laneH = Math.max(40, Math.min(84, Math.floor((window.innerHeight * 0.58 - 100) / n)));
    var skyH = Math.max(38, Math.min(60, Math.round(laneH * 0.85)));
    var crowdH = Math.max(20, Math.min(32, Math.round(laneH * 0.45)));
    var W = wrapW, H = skyH + crowdH + 6 + n * laneH + 10;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.height = H + 'px';
    geo = { W: W, H: H, laneH: laneH, s: laneH * 0.40, dpr: dpr,
            skyH: skyH, crowdH: crowdH, trackY: skyH + crowdH + 6, labels: [] };
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = labelFont();
    var maxW = Math.min(W * 0.40, 180);
    var opts = raceOpts();
    for (var i = 0; i < n; i++) {
      var txt = String(opts[i] == null ? '?' : opts[i]);
      while (txt.length > 1 && ctx.measureText(txt).width > maxW) txt = txt.slice(0, -1);
      if (txt !== String(opts[i])) txt += '…';
      geo.labels.push(txt);
    }
  }
  function labelFont() {
    var px = Math.max(11, Math.min(14, Math.round(geo.laneH * 0.18)));
    return '600 ' + px + 'px system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
  }

  /* ── drawing helpers ───────────────────────────────────────── */
  function shade(hex, f) {
    var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return 'rgb(' + ((r * f) | 0) + ',' + ((g * f) | 0) + ',' + ((b * f) | 0) + ')';
  }
  function rr(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function hash01(n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

  /* ── the racehorse (bezier silhouette + jointed legs + jockey) ─
     Facing right, origin at body centre, unit s ≈ half body length.
     One closed path for rump→croup→back→withers→neck→poll→face→muzzle
     →jaw→throat→chest→belly→flank gives a real horse profile; legs are
     two-segment stroked limbs (upper thick, cannon thin, dark hooves);
     a crouched jockey in team silks rides over the withers. */
  function drawHorse(c, x, y, s, pal, num, run, ph, sf) {
    c.save();
    c.translate(x, y);
    var bounce = run ? Math.abs(Math.sin(ph)) * 0.09 * s : Math.sin(ph * 0.35) * 0.015 * s;
    c.translate(0, -bounce);
    if (run) {
      c.rotate(-(0.03 + Math.sin(ph) * 0.03) * Math.min(sf, 1.4));
      var stretch = 1 + Math.max(0, sf - 1) * 0.06;
      c.scale(stretch, 1);
    }
    var coat = pal.c, dark = shade(pal.c, 0.72), lite = pal.l, mane = pal.m;

    /* tail — streams back when galloping, hangs when standing */
    c.lineCap = 'round';
    for (var k = 0; k < 4; k++) {
      var tw = run ? Math.sin(ph * 2 + k * 1.2) * 0.05 * s : Math.sin(ph * 0.35 + k) * 0.012 * s;
      var sp = (k - 1.5) * 0.075 * s;
      c.strokeStyle = k % 2 ? mane : shade(mane, 1.25);
      c.lineWidth = s * (0.06 - k * 0.008);
      c.beginPath();
      c.moveTo(-0.54 * s, -0.20 * s);
      if (run) c.quadraticCurveTo(-0.82 * s, -0.30 * s + sp + tw, -1.06 * s, -0.10 * s + sp * 1.8 + tw * 2);
      else     c.quadraticCurveTo(-0.66 * s, -0.02 * s + sp * 0.4 + tw, -0.62 * s, 0.30 * s + sp * 0.5);
      c.stroke();
    }

    /* two-segment leg: shoulder/hip → knee/hock → hoof.
       Front knees bow forward, hind hocks bow backward. */
    function leg(front, phOff, far) {
      var jx = front ? 0.36 * s : -0.38 * s;      // shoulder / hip joint
      var jy = front ? 0.02 * s : 0.00;
      var cSwing = run ? Math.sin(ph + phOff) : 0;
      var lift   = run ? Math.max(0, Math.cos(ph + phOff)) * 0.16 * s : 0;
      var stand  = run ? 0 : (front ? (far ? 0.44 : 0.30) : (far ? -0.46 : -0.30)) * s - jx;
      var hoofX  = run ? jx + (front ? 0.16 : -0.10) * s + cSwing * (front ? 0.34 : 0.42) * s
                       : jx + stand;
      var hoofY  = 0.55 * s - lift;
      var mx, my;
      if (front) { mx = jx + (hoofX - jx) * 0.45 + 0.07 * s + lift * 0.35; my = 0.28 * s - lift * 0.40; }
      else       { mx = jx + (hoofX - jx) * 0.40 - 0.10 * s - lift * 0.30; my = 0.26 * s - lift * 0.35; }
      var col = far ? dark : coat;
      c.strokeStyle = col;
      c.lineWidth = s * 0.115;                     // upper limb (muscled)
      c.beginPath(); c.moveTo(jx, jy); c.quadraticCurveTo((jx + mx) / 2, (jy + my) / 2, mx, my); c.stroke();
      c.lineWidth = s * 0.068;                     // cannon
      c.beginPath(); c.moveTo(mx, my); c.quadraticCurveTo((mx + hoofX) / 2, (my + hoofY) / 2 + 0.02 * s, hoofX, hoofY); c.stroke();
      c.fillStyle = '#241c16';                     // hoof
      c.beginPath(); c.arc(hoofX + 0.012 * s, hoofY + 0.015 * s, s * 0.05, 0, Math.PI * 2); c.fill();
    }
    /* far-side pair first (darker, slightly offset phase) */
    leg(false, 0.55, true);
    leg(true,  Math.PI * 0.92 + 0.55, true);

    /* ── body + neck + head as ONE silhouette ── */
    c.fillStyle = coat;
    c.beginPath();
    c.moveTo(-0.55 * s, -0.18 * s);                                        // tail base
    c.quadraticCurveTo(-0.50 * s, -0.345 * s, -0.30 * s, -0.33 * s);       // croup (high rump)
    c.quadraticCurveTo(-0.02 * s, -0.28 * s,  0.16 * s, -0.315 * s);       // dipped back → withers
    c.quadraticCurveTo( 0.31 * s, -0.35 * s,  0.43 * s, -0.45 * s);        // withers up the neck
    c.quadraticCurveTo( 0.53 * s, -0.535 * s, 0.63 * s, -0.565 * s);       // crest to poll
    c.quadraticCurveTo( 0.73 * s, -0.585 * s, 0.81 * s, -0.55 * s);        // forehead
    c.quadraticCurveTo( 0.93 * s, -0.50 * s,  0.975 * s, -0.455 * s);      // face line
    c.quadraticCurveTo( 1.005 * s, -0.425 * s, 0.985 * s, -0.395 * s);     // muzzle tip
    c.quadraticCurveTo( 0.94 * s, -0.36 * s,  0.88 * s, -0.375 * s);       // lip / under-jaw
    c.quadraticCurveTo( 0.79 * s, -0.39 * s,  0.73 * s, -0.345 * s);       // jaw
    c.quadraticCurveTo( 0.635 * s, -0.26 * s, 0.575 * s, -0.165 * s);      // throat latch
    c.quadraticCurveTo( 0.545 * s, -0.06 * s, 0.55 * s,  0.015 * s);       // neck front → chest
    c.quadraticCurveTo( 0.56 * s,  0.13 * s,  0.45 * s,  0.19 * s);        // deep chest
    c.quadraticCurveTo( 0.18 * s,  0.265 * s, -0.03 * s, 0.245 * s);       // belly
    c.quadraticCurveTo(-0.31 * s,  0.22 * s, -0.46 * s,  0.115 * s);       // flank
    c.quadraticCurveTo(-0.575 * s, 0.02 * s, -0.55 * s, -0.18 * s);        // haunch
    c.closePath();
    c.fill();

    /* muscle shading + belly light */
    c.fillStyle = lite;
    c.beginPath(); c.ellipse(0.10 * s, 0.13 * s, 0.34 * s, 0.11 * s, -0.05, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(0,0,0,.10)';
    c.beginPath(); c.ellipse(-0.30 * s, -0.05 * s, 0.20 * s, 0.20 * s, 0.2, 0, Math.PI * 2); c.fill();   // haunch muscle
    c.beginPath(); c.ellipse(0.38 * s, -0.02 * s, 0.13 * s, 0.16 * s, -0.1, 0, Math.PI * 2); c.fill();   // shoulder
    if (pal.p) {  /* pinto patches */
      c.fillStyle = '#7a4d28';
      c.beginPath(); c.ellipse(-0.18 * s, -0.08 * s, 0.15 * s, 0.12 * s, 0.3, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(0.22 * s, 0.08 * s, 0.11 * s, 0.08 * s, -0.2, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(0.62 * s, -0.44 * s, 0.08 * s, 0.06 * s, 0.4, 0, Math.PI * 2); c.fill();
    }

    /* cheek + face details */
    c.fillStyle = coat;
    c.beginPath(); c.ellipse(0.72 * s, -0.40 * s, 0.095 * s, 0.085 * s, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = shade(pal.l, 1.02);                                       // pale muzzle patch
    c.beginPath(); c.ellipse(0.93 * s, -0.425 * s, 0.055 * s, 0.045 * s, -0.35, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#2a1d14';                                                // nostril
    c.beginPath(); c.ellipse(0.945 * s, -0.435 * s, 0.020 * s, 0.016 * s, -0.3, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(0,0,0,.28)'; c.lineWidth = s * 0.014;             // mouth line
    c.beginPath(); c.moveTo(0.965 * s, -0.395 * s); c.quadraticCurveTo(0.91 * s, -0.375 * s, 0.87 * s, -0.38 * s); c.stroke();
    /* eye */
    c.fillStyle = '#170f0a';
    c.beginPath(); c.ellipse(0.755 * s, -0.485 * s, 0.030 * s, 0.026 * s, 0.2, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,.8)';
    c.beginPath(); c.arc(0.748 * s, -0.493 * s, 0.009 * s, 0, Math.PI * 2); c.fill();
    /* ears — pinned back at speed, pricked when standing */
    c.fillStyle = coat;
    if (run) {
      c.beginPath(); c.moveTo(0.640 * s, -0.565 * s); c.lineTo(0.545 * s, -0.635 * s); c.lineTo(0.575 * s, -0.545 * s); c.closePath(); c.fill();
      c.fillStyle = dark;
      c.beginPath(); c.moveTo(0.600 * s, -0.575 * s); c.lineTo(0.495 * s, -0.63 * s); c.lineTo(0.535 * s, -0.545 * s); c.closePath(); c.fill();
    } else {
      c.beginPath(); c.moveTo(0.615 * s, -0.565 * s); c.lineTo(0.635 * s, -0.72 * s); c.lineTo(0.685 * s, -0.575 * s); c.closePath(); c.fill();
      c.fillStyle = dark;
      c.beginPath(); c.moveTo(0.545 * s, -0.565 * s); c.lineTo(0.545 * s, -0.70 * s); c.lineTo(0.605 * s, -0.57 * s); c.closePath(); c.fill();
    }

    /* mane — wavy strands along the crest, flying at speed */
    c.strokeStyle = mane; c.lineWidth = s * 0.055; c.lineCap = 'round';
    for (var mnk = 0; mnk < 3; mnk++) {
      var mw = run ? Math.sin(ph * 2 + mnk * 1.3) * 0.035 * s : Math.sin(ph * 0.35 + mnk) * 0.008 * s;
      c.beginPath();
      c.moveTo(0.60 * s, (-0.56 + mnk * 0.015) * s);
      c.quadraticCurveTo(0.42 * s, (-0.50 + mnk * 0.03) * s + mw,
                         (0.24 - mnk * 0.05) * s, (-0.37 + mnk * 0.02) * s + mw * 1.5);
      c.stroke();
    }
    /* forelock */
    c.beginPath(); c.moveTo(0.66 * s, -0.575 * s);
    c.quadraticCurveTo(0.74 * s, -0.56 * s, 0.78 * s, -0.525 * s); c.stroke();

    /* ── saddle cloth + number + jockey in silks ── */
    var silks = pal.a;
    c.fillStyle = silks;
    rr(c, 0.00 * s, -0.30 * s, 0.30 * s, 0.26 * s, 0.05 * s); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = s * 0.020;
    rr(c, 0.00 * s, -0.30 * s, 0.30 * s, 0.26 * s, 0.05 * s); c.stroke();
    c.fillStyle = '#fff';
    c.font = '400 ' + (0.17 * s) + 'px "Russo One",system-ui,sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(String(num), 0.15 * s, -0.165 * s);
    /* girth strap */
    c.strokeStyle = 'rgba(0,0,0,.30)'; c.lineWidth = s * 0.035;
    c.beginPath(); c.moveTo(0.14 * s, -0.04 * s); c.lineTo(0.15 * s, 0.20 * s); c.stroke();

    /* jockey: crouched racing seat — thigh up, shin to stirrup, torso
       folded over the neck, arms reaching to the reins */
    var jb = run ? Math.sin(ph + 0.6) * 0.02 * s : 0;   // posting bob
    c.strokeStyle = shade(silks, 0.75); c.lineWidth = s * 0.075;            // thigh
    c.beginPath(); c.moveTo(0.10 * s, -0.34 * s + jb); c.lineTo(0.27 * s, -0.28 * s + jb); c.stroke();
    c.lineWidth = s * 0.055;                                                // shin (dark boot)
    c.strokeStyle = '#231f1e';
    c.beginPath(); c.moveTo(0.27 * s, -0.28 * s + jb); c.lineTo(0.24 * s, -0.12 * s + jb * 0.5); c.stroke();
    c.fillStyle = silks;                                                    // torso folded forward
    c.beginPath(); c.ellipse(0.185 * s, -0.475 * s + jb, 0.155 * s, 0.095 * s, -0.42, 0, Math.PI * 2); c.fill();
    c.strokeStyle = silks; c.lineWidth = s * 0.055;                         // arm to the reins
    c.beginPath(); c.moveTo(0.28 * s, -0.50 * s + jb);
    c.quadraticCurveTo(0.38 * s, -0.46 * s + jb, 0.475 * s, -0.435 * s + jb * 0.5); c.stroke();
    c.fillStyle = '#f4e6d0';                                                // hand
    c.beginPath(); c.arc(0.48 * s, -0.435 * s + jb * 0.5, 0.032 * s, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff';                                                   // helmet
    c.beginPath(); c.arc(0.315 * s, -0.555 * s + jb, 0.068 * s, 0, Math.PI * 2); c.fill();
    c.fillStyle = silks;                                                    // helmet band
    c.beginPath(); c.arc(0.315 * s, -0.555 * s + jb, 0.068 * s, Math.PI * 0.9, Math.PI * 1.9); c.fill();
    c.fillStyle = 'rgba(0,0,0,.35)';                                        // visor
    c.beginPath(); c.ellipse(0.365 * s, -0.545 * s + jb, 0.030 * s, 0.014 * s, -0.2, 0, Math.PI * 2); c.fill();

    /* reins */
    c.strokeStyle = 'rgba(60,40,25,.55)'; c.lineWidth = s * 0.016;
    c.beginPath(); c.moveTo(0.48 * s, -0.44 * s + jb * 0.5);
    c.quadraticCurveTo(0.70 * s, -0.44 * s, 0.90 * s, -0.415 * s); c.stroke();

    /* near-side legs on top */
    leg(false, 0, false);
    leg(true,  Math.PI * 0.92, false);

    c.restore();
  }

  /* speed lines behind a surging horse (visual only) */
  function drawSpeedLines(c, x, y, s, ph) {
    c.strokeStyle = 'rgba(255,255,255,.30)'; c.lineWidth = 1.5; c.lineCap = 'round';
    for (var k = 0; k < 3; k++) {
      var off = ((ph * 0.6 + k * 0.33) % 1);
      var lx = x - s * (1.1 + off * 0.9), ly = y - s * (0.35 - k * 0.25);
      c.beginPath(); c.moveTo(lx, ly); c.lineTo(lx - s * (0.35 - off * 0.15), ly); c.stroke();
    }
  }
  function drawDust(c, x, y, s, ph) {
    for (var k = 0; k < 3; k++) {
      var life = ((ph / (Math.PI * 2) + k / 3) % 1 + 1) % 1;
      c.fillStyle = 'rgba(196,166,120,' + (0.30 * (1 - life)).toFixed(3) + ')';
      c.beginPath();
      c.arc(x - (0.7 + life * 0.6) * s, y + (0.44 - life * 0.22) * s, (0.05 + 0.10 * life) * s, 0, Math.PI * 2);
      c.fill();
    }
  }

  /* ── broadcast camera scene ────────────────────────────────── */
  function render() {
    if (!ctx || !horses || !canvas.width) return;
    var n = horses.length, W = geo.W, H = geo.H, laneH = geo.laneH, s = geo.s;
    var skyH = geo.skyH, crowdH = geo.crowdH, trackY = geo.trackY;
    var now = serverNow(), t = now - race.startAt;
    var stage = stageNow();
    ctx.setTransform(geo.dpr, 0, 0, geo.dpr, 0, 0);

    /* camera: follow the front-runner (max progress is continuous through
       lead changes), pinned at LEAD_AT of frame; once the line comes into
       reach the camera parks so the finish post sits at FINISH_AT. */
    var pLead = 0;
    if (stage !== 'countdown') {
      for (var q = 0; q < n; q++) pLead = Math.max(pLead, progressAt(horses[q], t));
    }
    var camLeft = Math.min(pLead - LEAD_AT * VIEW, 1 - FINISH_AT * VIEW);
    var px = function (p) { return ((p - camLeft) / VIEW) * W; };   // world→screen
    var camPx = camLeft / VIEW * W;                                  // scroll distance in px

    /* SKY */
    var g = ctx.createLinearGradient(0, 0, 0, skyH + crowdH);
    g.addColorStop(0, '#a8d8ea'); g.addColorStop(1, '#d8ecdf');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, skyH);
    if (!REDUCED) {
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      for (var cl = 0; cl < 3; cl++) {
        var cyc = W * 1.3;
        var raw = (t * 0.004 + cl * 0.45 * W + camPx * 0.02) % cyc;
        if (raw < 0) raw += cyc;
        var cx = W - raw;
        var cy = skyH * (0.25 + 0.22 * cl);
        ctx.beginPath();
        ctx.ellipse(cx, cy, 26 - cl * 5, 8 - cl, 0, 0, Math.PI * 2);
        ctx.ellipse(cx + 16, cy + 3, 18 - cl * 4, 6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    /* GRANDSTAND — dark stand + colored crowd dots, parallax 0.35× */
    ctx.fillStyle = '#31423a'; ctx.fillRect(0, skyH, W, crowdH);
    ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(0, skyH, W, 2);
    var dotGap = 9, rows = Math.max(2, Math.floor((crowdH - 8) / 8));
    var crowdOff = camPx * 0.35;
    for (var col = Math.floor(crowdOff / dotGap); col * dotGap - crowdOff < W; col++) {
      var sx = col * dotGap - crowdOff + 4;
      for (var rw = 0; rw < rows; rw++) {
        var hsh = hash01(col * 7.13 + rw * 13.7);
        if (hsh < 0.82) {
          ctx.fillStyle = CROWD[(col * 3 + rw * 5) % CROWD.length];
          var jump = (!REDUCED && stage === 'racing' && hsh > 0.62) ? Math.abs(Math.sin(t * 0.006 + col)) * 2 : 0;
          ctx.beginPath(); ctx.arc(sx, skyH + 6 + rw * 8 + (hsh - 0.5) * 3 - jump, 2.4, 0, Math.PI * 2); ctx.fill();
        }
      }
    }

    /* TOP RAIL — white rail with posts, parallax 1× */
    ctx.fillStyle = '#f2efe6'; ctx.fillRect(0, skyH + crowdH, W, 4);
    ctx.fillStyle = '#d9d4c5';
    var postGapW = 0.012;   // world units
    for (var pw = Math.ceil(camLeft / postGapW) - 1; ; pw++) {
      var postX = px(pw * postGapW);
      if (postX > W + 4) break;
      if (postX > -4) ctx.fillRect(postX, skyH + crowdH, 2.5, 6);
    }

    /* TRACK — dirt with speckles + lane dashes, 1× */
    var tg = ctx.createLinearGradient(0, trackY, 0, H);
    tg.addColorStop(0, '#c39a5e'); tg.addColorStop(1, '#a87f48');
    ctx.fillStyle = tg; ctx.fillRect(0, trackY, W, H - trackY);
    ctx.fillStyle = 'rgba(90,60,30,.16)';
    var spkGap = 0.0045;
    for (var sk = Math.ceil(camLeft / spkGap) - 1; ; sk++) {
      var skX = px(sk * spkGap);
      if (skX > W + 3) break;
      if (skX > -3) {
        var hh = hash01(sk * 3.77);
        ctx.fillRect(skX, trackY + 4 + hh * (H - trackY - 10), 2 + hh * 2, 1.6);
      }
    }
    ctx.strokeStyle = 'rgba(255,255,255,.15)'; ctx.lineWidth = 1;
    ctx.setLineDash([7, 9]);
    for (var ln = 1; ln < n; ln++) {
      var dashOff = camPx % 16;
      ctx.lineDashOffset = dashOff;
      ctx.beginPath(); ctx.moveTo(0, trackY + ln * laneH + 0.5); ctx.lineTo(W, trackY + ln * laneH + 0.5); ctx.stroke();
    }
    ctx.setLineDash([]); ctx.lineDashOffset = 0;

    /* furlong markers every 10% of the track (never reveals the finish) */
    for (var fm = 1; fm <= 9; fm++) {
      var fx = px(fm * 0.1);
      if (fx < -6 || fx > W + 6) continue;
      for (var seg = 0; seg < 4; seg++) {
        ctx.fillStyle = seg % 2 ? '#fff' : '#d94848';
        ctx.fillRect(fx - 2, trackY - 22 + seg * 5, 4, 5);
      }
      ctx.fillStyle = 'rgba(0,0,0,.18)';
      ctx.fillRect(fx - 1, trackY - 2, 2, 4);
    }

    /* START gate (scrolls away after the off) */
    var sx0 = px(0);
    if (sx0 > -30) {
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.fillRect(sx0 - 1.5, trackY, 3, H - trackY - 10);
      ctx.fillStyle = '#3b5a48';
      ctx.fillRect(sx0 - 4, skyH + crowdH - 14, 8, 18);
    }

    /* FINISH post — only exists near the end of the race */
    var fxp = px(1);
    if (fxp < W + 30) {
      var sq2 = 5;
      for (var fy = trackY - 26; fy < H - 10; fy += sq2) {
        for (var fxs = 0; fxs < 2; fxs++) {
          ctx.fillStyle = ((fy / sq2 | 0) + fxs) % 2 ? '#f5f2ea' : '#1e1e1e';
          ctx.fillRect(fxp + fxs * sq2 - sq2, fy, sq2, Math.min(sq2, H - 10 - fy));
        }
      }
      /* FINISH pennant */
      ctx.fillStyle = '#c22e2e';
      ctx.beginPath();
      ctx.moveTo(fxp - sq2, trackY - 26); ctx.lineTo(fxp - sq2 - 34, trackY - 19); ctx.lineTo(fxp - sq2, trackY - 12);
      ctx.closePath(); ctx.fill();
    }

    /* HORSES (dust → speed lines → horse → label/badge per lane) */
    var frameNow = performance.now();
    var dt = lastFrameTs ? Math.min((frameNow - lastFrameTs) / 1000, 0.1) : 0.016;
    lastFrameTs = frameNow;
    ctx.font = labelFont();

    for (var j = 0; j < n; j++) {
      var h = horses[j];
      var running = stage === 'racing' && t < h.finish + OVERRUN_MS;
      var sf = stage === 'racing' ? speedAt(h, t) : 0;
      h.gallop += dt * (running ? (5.5 + 10 * sf) : 1.2);
      var p = stage === 'countdown' ? 0 : progressAt(h, t);
      var x = px(p);
      var laneTop = trackY + j * laneH;
      var yC = laneTop + laneH * 0.62 + (!REDUCED && running ? Math.sin(t * 0.0011 + j * 2.1) * laneH * 0.03 : 0);

      /* dropped out of frame → edge tag with the lane number */
      if (x < -2.2 * s) {
        ctx.fillStyle = 'rgba(8,12,8,.55)';
        rr(ctx, 4, laneTop + laneH * 0.5 - 9, 34, 18, 9); ctx.fill();
        ctx.fillStyle = h.pal.a;
        ctx.beginPath(); ctx.arc(14, laneTop + laneH * 0.5, 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.font = '400 10px "Russo One",system-ui,sans-serif';
        ctx.fillText('‹' + (j + 1), 21, laneTop + laneH * 0.5);
        ctx.font = labelFont(); ctx.textBaseline = 'alphabetic';
        continue;
      }
      if (x > W + 2.2 * s) continue;

      /* soft ground shadow */
      ctx.fillStyle = 'rgba(60,38,18,.25)';
      ctx.beginPath(); ctx.ellipse(x, yC + 0.56 * s, 0.72 * s, 0.10 * s, 0, 0, Math.PI * 2); ctx.fill();

      if (!REDUCED && running && t > 400) drawDust(ctx, x, yC, s, h.gallop);
      if (!REDUCED && running && sf > 1.22) drawSpeedLines(ctx, x, yC, s, h.gallop);
      drawHorse(ctx, x, yC, s, h.pal, j + 1, running, h.gallop, sf);

      /* option label above the horse */
      var lbl = geo.labels[j] || '';
      var lw = ctx.measureText(lbl).width;
      var lx = Math.max(6 + lw / 2, Math.min(W - 6 - lw / 2, x));
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(40,26,10,.60)'; ctx.lineJoin = 'round';
      ctx.strokeText(lbl, lx, laneTop + laneH * 0.20);
      ctx.fillStyle = '#fff';
      ctx.fillText(lbl, lx, laneTop + laneH * 0.20);

      /* rank badge once across the line */
      if (stage !== 'countdown' && t >= h.finish) {
        var medal = h.rank === 0 ? '🥇' : h.rank === 1 ? '🥈' : h.rank === 2 ? '🥉' : null;
        var bx = Math.min(x + s * 1.3, W - 14), by = laneTop + laneH * 0.42;
        if (medal) {
          ctx.font = (laneH * 0.34) + 'px system-ui,sans-serif';
          ctx.fillText(medal, bx, by + laneH * 0.12);
          ctx.font = labelFont();
        } else {
          ctx.fillStyle = 'rgba(0,0,0,.45)';
          ctx.beginPath(); ctx.arc(bx, by, laneH * 0.15, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.textBaseline = 'middle';
          ctx.font = '400 ' + Math.round(laneH * 0.17) + 'px "Russo One",system-ui,sans-serif';
          ctx.fillText(String(h.rank + 1), bx, by);
          ctx.font = labelFont(); ctx.textBaseline = 'alphabetic';
        }
      }
    }

    /* BOTTOM RAIL — foreground, parallax 1.25× (depth + speed cue) */
    ctx.fillStyle = '#efece2'; ctx.fillRect(0, H - 10, W, 4);
    ctx.fillStyle = '#cfcaba';
    var fgGap = 34, fgOff = (camPx * 1.25) % fgGap;
    for (var fp = -1; fp * fgGap - fgOff < W + 6; fp++) {
      ctx.fillRect(fp * fgGap - fgOff, H - 8, 4, 8);
    }
  }

  /* ── live HUD ──────────────────────────────────────────────── */
  function updateLive() {
    var stage = stageNow();
    if (stage === 'none') { showView('setup'); return; }
    var t = serverNow() - race.startAt;

    if (stage === 'countdown') {
      el.hrChipLive.style.display = 'none';
      el.hrChipLead.style.display = 'none';
      el.hrCount.style.display = '';
      el.hrCount.classList.remove('go');
      var num = Math.max(1, Math.ceil(-t / 1000));
      if (num !== lastCountNum) {
        lastCountNum = num;
        el.hrCountNum.textContent = num;
        el.hrCountNum.classList.remove('tick');
        void el.hrCountNum.offsetWidth;
        el.hrCountNum.classList.add('tick');
        if (num <= 5) SND.tick(num === 1);
      }
      el.hrCountLbl.textContent = '「' + (race.byName || '有人') + '」发起了比赛 · ' + raceOpts().length + ' 位选手就位';
      el.hrResults.style.display = 'none'; el.hrAgain.style.display = 'none';
    } else if (stage === 'racing') {
      if (t < 900) {
        el.hrCount.style.display = '';
        el.hrCount.classList.add('go');
        if (lastCountNum !== 'go') {
          lastCountNum = 'go';
          el.hrCountNum.textContent = 'GO!';
          el.hrCountLbl.textContent = '';
          el.hrCountNum.classList.remove('tick');
          void el.hrCountNum.offsetWidth;
          el.hrCountNum.classList.add('tick');
          SND.bell();
        }
      } else el.hrCount.style.display = 'none';
      el.hrChipLive.style.display = '';
      el.hrLiveTxt.textContent = 'LIVE';
      el.hrClock.textContent = (t / 1000).toFixed(1) + 's';
      var lead = null, best = -1, sfSum = 0, sfN = 0;
      for (var i = 0; i < horses.length; i++) {
        var p = progressAt(horses[i], t);
        if (p > best) { best = p; lead = horses[i]; }
        if (t < horses[i].finish) { sfSum += speedAt(horses[i], t); sfN++; }
      }
      SND.race(sfN ? sfSum / sfN : 0.5, best);
      if (cheeredFor !== race.id && t >= minFinish() && t < minFinish() + 2500) {
        cheeredFor = race.id;         // winner just crossed → crowd erupts
        SND.cheer();
      }
      if (lead) {
        el.hrChipLead.style.display = '';
        el.hrLeadTag.textContent = t > lead.finish ? '冲线' : '领先';
        el.hrLeadDot.style.background = lead.pal.a;
        el.hrLeadName.textContent = raceOpts()[lead.i];
      }
      el.hrResults.style.display = 'none'; el.hrAgain.style.display = 'none';
    } else { /* done */
      if (endedFor !== race.id) { endedFor = race.id; SND.raceEnd(); }
      el.hrCount.style.display = 'none';
      el.hrChipLead.style.display = 'none';
      el.hrChipLive.style.display = '';
      el.hrLiveTxt.textContent = '完赛';
      var winner = null;
      for (var w = 0; w < horses.length; w++) if (horses[w].rank === 0) winner = horses[w];
      el.hrClock.textContent = winner ? (winner.finish / 1000).toFixed(2) + 's' : '';
      showResults();
    }
  }

  function showResults() {
    if (resultsShownFor === race.id) { el.hrResults.style.display = ''; el.hrAgain.style.display = ''; return; }
    resultsShownFor = race.id;
    var opts = raceOpts();
    var order = horses.slice().sort(function (a, b) { return a.rank - b.rank; });
    el.hrResults.textContent = '';

    var champ = document.createElement('div');
    champ.className = 'hr-res-champ';
    champ.textContent = '🎉 冠军 — ' + opts[order[0].i];
    el.hrResults.appendChild(champ);

    /* podium: 2nd | 1st | 3rd */
    var podium = document.createElement('div');
    podium.className = 'hr-podium';
    var podOrder = order.length >= 3 ? [order[1], order[0], order[2]] : (order.length === 2 ? [order[1], order[0]] : [order[0]]);
    podOrder.forEach(function (h) {
      var col = document.createElement('div');
      col.className = 'hr-pod hr-pod-' + (h.rank + 1);
      var pm = document.createElement('div'); pm.className = 'pm';
      pm.textContent = h.rank === 0 ? '🥇' : h.rank === 1 ? '🥈' : '🥉';
      var pd = document.createElement('div'); pd.className = 'pd'; pd.style.background = h.pal.a;
      var pn = document.createElement('div'); pn.className = 'pn'; pn.textContent = opts[h.i];
      var pt = document.createElement('div'); pt.className = 'pt'; pt.textContent = (h.finish / 1000).toFixed(2) + 's';
      col.appendChild(pm); col.appendChild(pd); col.appendChild(pn); col.appendChild(pt);
      podium.appendChild(col);
    });
    el.hrResults.appendChild(podium);

    order.slice(3).forEach(function (h) {
      var row = document.createElement('div');
      row.className = 'hr-res-row';
      var rank = document.createElement('span'); rank.className = 'hr-res-rank'; rank.textContent = String(h.rank + 1);
      var dot = document.createElement('span'); dot.className = 'hr-res-dot'; dot.style.background = h.pal.a;
      var name = document.createElement('span'); name.className = 'hr-res-name'; name.textContent = opts[h.i];
      var time = document.createElement('span'); time.className = 'hr-res-time'; time.textContent = (h.finish / 1000).toFixed(2) + 's';
      row.appendChild(rank); row.appendChild(dot); row.appendChild(name); row.appendChild(time);
      el.hrResults.appendChild(row);
    });
    el.hrResults.style.display = '';
    el.hrAgain.style.display = '';
  }

  /* ── setup view chrome ─────────────────────────────────────── */
  var setupCache = '';
  function refreshSetup(force) {
    if (!isOpen || view !== 'setup') return;
    var stage = stageNow();
    var key, label, disabled;
    if (stage === 'countdown' || stage === 'racing') {
      key = 'live'; label = '⏱ 比赛进行中 — 点击去观战'; disabled = false;
    } else if (race && stage === 'done' && serverNow() < race.startAt + REOPEN_GAP_MS) {
      var wait = Math.ceil((race.startAt + REOPEN_GAP_MS - serverNow()) / 1000);
      key = 'wait' + wait; label = '🏁 开赛！（上一场刚结束，' + wait + ' 秒后可开）'; disabled = true;
    } else {
      key = 'ready'; label = '🏁 开赛！'; disabled = false;
    }
    if (!force && key === setupCache) return;
    setupCache = key;
    el.hrStart.textContent = label;
    el.hrStart.disabled = disabled;
    el.hrStart.dataset.mode = (key === 'live') ? 'watch' : 'start';

    if (race && stage === 'done') {
      var opts = raceOpts();
      var order = horses.slice().sort(function (a, b) { return a.rank - b.rank; });
      var parts = ['上一场：'];
      order.slice(0, 3).forEach(function (h) {
        parts.push((h.rank === 0 ? '🥇' : h.rank === 1 ? '🥈' : '🥉') + opts[h.i]);
      });
      el.hrLast.textContent = parts.join('  ') + '　点击看完整排名 ›';
      el.hrLast.style.display = '';
    } else el.hrLast.style.display = 'none';
  }

  function startRace() {
    if (el.hrStart.dataset.mode === 'watch') { showView('live'); return; }
    var user = firebase.auth && firebase.auth().currentUser;
    if (!user) { toast('请先登录', 'error'); return; }
    if (!rtdb) { toast('实时服务不可用', 'error'); return; }
    var lines = el.hrTa.value.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
    if (lines.length < MIN_OPTS) { el.hrErr.textContent = '至少要 ' + MIN_OPTS + ' 个选项哦'; return; }
    if (lines.length > MAX_OPTS) { el.hrErr.textContent = '最多 ' + MAX_OPTS + ' 个选项（现在有 ' + lines.length + ' 个）'; return; }
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].length > MAX_OPT_LEN) { el.hrErr.textContent = '第 ' + (i + 1) + ' 个选项太长了（≤' + MAX_OPT_LEN + ' 字）'; return; }
    }
    el.hrErr.textContent = '';
    el.hrStart.disabled = true;
    var startAt = serverNow() + COUNTDOWN_MS;
    rtdb.ref('horse_race/current').set({
      id: 'r' + startAt + '_' + Math.floor(Math.random() * 1e4),
      options: lines,
      seed: Math.floor(Math.random() * 0x7fffffff),
      startAt: startAt,
      by: user.uid,
      byName: myName()
    }).then(function () {
      setupCache = '';               // listener will flip everyone (incl. us) to live
    }).catch(function () {
      toast('开赛失败：可能有比赛正在进行', 'error');
      el.hrStart.disabled = false;
    });
  }

  /* ── animation loop ────────────────────────────────────────── */
  function startLoop() {
    stopLoop();
    lastFrameTs = 0;
    var step = function () {
      if (!isOpen) return;
      if (view === 'live' && race && horses) {
        if (!canvas.width) sizeCanvas();
        updateLive();
        render();
      } else refreshSetup(false);
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
  }
  function stopLoop() { if (rafId) cancelAnimationFrame(rafId); rafId = 0; }

  /* ── RTDB listener + auto-popup broadcast ──────────────────── */
  function onRaceValue(val) {
    race = val || null;
    horses = null;
    if (race && race.seed != null && race.options) {
      horses = precompute(race.seed | 0, raceOpts().length);
    }
    if (!horses) race = null;
    setupCache = '';
    if (isOpen && view === 'live') { sizeCanvas(); resultsShownFor = null; }

    if (!race) { if (isOpen && view === 'live') showView('setup'); return; }

    var stage = stageNow();
    var dismissed = null;
    try { dismissed = sessionStorage.getItem('hr_dismissed'); } catch (e) {}
    var killed = window.FEATURES && window.FEATURES.horse_race === false;
    if (!killed && stage !== 'done' && race.id !== lastAutoId && race.id !== dismissed) {
      lastAutoId = race.id;
      openOverlay('live');            // the broadcast: everyone's page shows the race
    } else if (isOpen && stage !== 'done' && view === 'setup') {
      showView('live');               // already browsing the panel → jump to the track
    }
  }

  function attach() {
    if (!rtdb) return;
    try {
      rtdb.ref('.info/serverTimeOffset').on('value', function (s) { srvOffset = s.val() || 0; });
      rtdb.ref('horse_race/current').on('value',
        function (snap) { onRaceValue(snap.val()); },
        function () { /* permission denied (e.g. rules not pasted yet) — stay quiet */ });
    } catch (e) {}
  }

  /* ── wiring ────────────────────────────────────────────────── */
  function init() {
    var tile = document.getElementById('horseRaceBtn');
    if (tile) tile.addEventListener('click', function () {
      if (!(firebase.auth && firebase.auth().currentUser)) { toast('请先登录', 'error'); return; }
      if (!rtdb) { toast('实时服务不可用，稍后再试', 'error'); return; }
      openOverlay(race && stageNow() !== 'done' ? 'live' : 'setup');
    });
    var attached = false;
    if (firebase.auth) firebase.auth().onAuthStateChanged(function (u) {
      if (u && !attached) { attached = true; attach(); }
    });
    /* autoplay policy: resume the (suspended) audio context on any gesture */
    document.addEventListener('pointerdown', function () { SND.poke(); }, { passive: true });
    document.addEventListener('visibilitychange', function () { SND.setHidden(document.hidden); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
