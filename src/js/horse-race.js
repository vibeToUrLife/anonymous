/* ════════════════════════════════════════════════════════════════
   horse-race.js — 🏇 全站赛马 · 万能决策器 (更多玩法)
   Anyone writes 2~12 options; each option becomes a hand-drawn horse
   that races with random speed. EVERYONE online sees the SAME race:
   the creator writes one tiny record {options, seed, startAt} to RTDB
   (horse_race/current) and every client replays the identical
   deterministic simulation — position is a pure function of
   (seed, horse, t) with t driven by Firebase server time, so all
   screens agree frame-by-frame and the final ranking is identical.
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

  /* 12 coat palettes: c=coat l=belly/muzzle m=mane/tail a=saddle-cloth */
  var COATS = [
    { c: '#b5651d', l: '#d99a62', m: '#6e3a10', a: '#2563eb' },            // 栗
    { c: '#4a4442', l: '#6f6663', m: '#26211f', a: '#f59e0b' },            // 黑
    { c: '#f3efe6', l: '#ffffff', m: '#cfc8b8', a: '#dc2626' },            // 白
    { c: '#d9a441', l: '#f0cf8e', m: '#efe3c0', a: '#16a34a' },            // 金
    { c: '#9aa0a8', l: '#c3c8cf', m: '#5b6068', a: '#7c3aed' },            // 灰
    { c: '#9a5533', l: '#c07d55', m: '#2a2020', a: '#0891b2' },            // 枣红
    { c: '#efe8db', l: '#ffffff', m: '#7a4a22', a: '#db2777', p: 1 },      // 花斑
    { c: '#6b4226', l: '#8a5c38', m: '#241a12', a: '#65a30d' },            // 深棕
    { c: '#efe0c8', l: '#f8f0e0', m: '#d9c8a8', a: '#ea580c' },            // 奶油
    { c: '#7d8a99', l: '#a5b0bd', m: '#3a4148', a: '#e11d48' },            // 青灰
    { c: '#c1703d', l: '#daa06d', m: '#8a4a20', a: '#4f46e5' },            // 红棕
    { c: '#7e4a21', l: '#a06a3c', m: '#4a2a10', a: '#0d9488' }             // 深栗
  ];

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
     endpoints are exact (starts at gate, finishes exactly at F). Ranking is
     therefore fully决定 by the finish times the shared seed hands out. */
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
      horses.push({ i: i, finish: finish, waves: waves, gallop: 0, pal: COATS[i % COATS.length] });
    }
    /* rank = finish-time order (ties broken by lane — deterministic) */
    var order = horses.slice().sort(function (a, b) { return a.finish - b.finish || a.i - b.i; });
    for (var r = 0; r < order.length; r++) order[r].rank = r;
    return horses;
  }
  function progressAt(h, tMs) {
    if (tMs <= 0) return 0;
    if (tMs >= h.finish) {                       // crossed → ease out to a stop just past the line
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
  /* normalized instantaneous speed (~1 = average pace) for leg cadence */
  function speedAt(h, tMs) {
    if (tMs <= 0 || tMs >= h.finish) return tMs >= h.finish + OVERRUN_MS ? 0 : 0.4;
    var d = 160;
    var v = (progressAt(h, Math.min(tMs + d, h.finish - 1)) - progressAt(h, Math.max(tMs - d, 1))) / (2 * d);
    return Math.max(0.3, Math.min(1.8, v * h.finish));
  }

  /* ── race state ────────────────────────────────────────────── */
  var race = null;        // latest horse_race/current value (or null)
  var horses = null;      // precomputed sim for race.seed
  var overlay = null, canvas = null, ctx = null;
  var isOpen = false, view = 'setup';   // 'setup' | 'live'
  var rafId = 0, lastFrameTs = 0;
  var lastAutoId = null;  // race id we already auto-popped for
  var resultsShownFor = null;
  var el = {};            // cached overlay elements

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
  /* 'countdown' | 'racing' | 'done' — derived purely from synced clock */
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
    'background:linear-gradient(168deg,#1c3a26 0%,#0e2416 100%);border:1px solid rgba(255,255,255,.1);' +
    'border-radius:22px;box-shadow:0 26px 70px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.06);overflow:hidden;}' +
  '.hr-head{display:flex;align-items:center;gap:10px;padding:14px 48px 10px 18px;flex-shrink:0;}' +
  '.hr-mark{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;font-size:19px;' +
    'background:linear-gradient(135deg,#86efac,#22c55e);box-shadow:0 4px 14px rgba(34,197,94,.35);}' +
  '.hr-title{font-size:17px;font-weight:700;color:#fff;}' +
  '.hr-sub{font-size:11px;color:rgba(255,255,255,.55);}' +
  '.hr-close{position:absolute;top:12px;right:12px;z-index:2;width:30px;height:30px;border:none;border-radius:50%;' +
    'background:rgba(255,255,255,.1);color:#fff;font-size:14px;cursor:pointer;}' +
  '.hr-close:hover{background:rgba(255,80,80,.5);}' +
  '.hr-body{padding:6px 16px 16px;overflow-y:auto;flex:1;min-height:0;}' +
  /* setup view */
  '.hr-setup-tip{font-size:12px;color:rgba(255,255,255,.65);margin:4px 2px 8px;}' +
  '.hr-ta{width:100%;min-height:170px;resize:vertical;box-sizing:border-box;padding:12px;border-radius:14px;' +
    'border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.28);color:#fff;font-size:14px;line-height:1.7;outline:none;}' +
  '.hr-ta:focus{border-color:#4ade80;}' +
  '.hr-ta::placeholder{color:rgba(255,255,255,.3);}' +
  '.hr-err{font-size:12px;color:#fca5a5;min-height:16px;margin:6px 2px;}' +
  '.hr-start{width:100%;padding:13px;border:none;border-radius:14px;cursor:pointer;font-size:15px;font-weight:700;' +
    'color:#052e12;background:linear-gradient(135deg,#86efac,#22c55e);box-shadow:0 6px 18px rgba(34,197,94,.35);}' +
  '.hr-start:active{transform:translateY(1px);}' +
  '.hr-start:disabled{opacity:.55;cursor:not-allowed;transform:none;}' +
  '.hr-last{margin-top:12px;padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.06);' +
    'font-size:12.5px;color:rgba(255,255,255,.8);cursor:pointer;line-height:1.6;}' +
  '.hr-last:hover{background:rgba(255,255,255,.1);}' +
  /* live view */
  '.hr-banner{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13.5px;font-weight:600;color:#fff;' +
    'padding:4px 2px 8px;min-height:22px;}' +
  '.hr-banner .lead{color:#86efac;}' +
  '.hr-trackwrap{position:relative;border-radius:14px;overflow:hidden;box-shadow:inset 0 2px 10px rgba(0,0,0,.35);}' +
  '.hr-canvas{display:block;width:100%;}' +
  '.hr-count{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
    'pointer-events:none;background:radial-gradient(ellipse at center,rgba(0,0,0,.38),rgba(0,0,0,.12));}' +
  '.hr-count .num{font-size:74px;font-weight:800;color:#fff;text-shadow:0 4px 22px rgba(0,0,0,.6);line-height:1;}' +
  '.hr-count .lbl{font-size:13px;color:rgba(255,255,255,.85);margin-top:6px;text-shadow:0 2px 8px rgba(0,0,0,.7);}' +
  '.hr-count.go .num{color:#86efac;}' +
  '.hr-results{margin-top:12px;}' +
  '.hr-res-champ{font-size:15px;font-weight:800;color:#fde68a;text-align:center;margin:2px 0 10px;}' +
  '.hr-res-row{display:flex;align-items:center;gap:9px;padding:7px 10px;border-radius:10px;margin-bottom:5px;' +
    'background:rgba(255,255,255,.05);font-size:13.5px;color:#fff;}' +
  '.hr-res-row.win{background:linear-gradient(90deg,rgba(253,230,138,.22),rgba(253,230,138,.05));' +
    'border:1px solid rgba(253,230,138,.35);}' +
  '.hr-res-rank{width:26px;text-align:center;font-size:15px;flex-shrink:0;}' +
  '.hr-res-dot{width:11px;height:11px;border-radius:50%;flex-shrink:0;box-shadow:0 0 0 2px rgba(255,255,255,.25);}' +
  '.hr-res-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
  '.hr-res-time{font-size:12px;color:rgba(255,255,255,.55);font-variant-numeric:tabular-nums;}' +
  '.hr-again{width:100%;margin-top:10px;padding:12px;border:none;border-radius:14px;cursor:pointer;font-size:14px;' +
    'font-weight:700;color:#052e12;background:linear-gradient(135deg,#86efac,#22c55e);}' +
  '@media (max-width:520px){.hr-overlay{padding:8px;}.hr-body{padding:4px 10px 12px;}.hr-count .num{font-size:56px;}}';

  /* ── overlay DOM ───────────────────────────────────────────── */
  function buildOverlay() {
    if (overlay) return;
    var st = document.createElement('style');
    st.id = 'hr-style'; st.textContent = css;
    document.head.appendChild(st);

    overlay = document.createElement('div');
    overlay.className = 'hr-overlay';
    overlay.innerHTML =
      '<div class="hr-card">' +
        '<button class="hr-close" id="hrClose" title="关闭">✕</button>' +
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
            '<div class="hr-banner"><span id="hrBanner1"></span><span class="lead" id="hrBanner2"></span></div>' +
            '<div class="hr-trackwrap">' +
              '<canvas class="hr-canvas" id="hrCanvas"></canvas>' +
              '<div class="hr-count" id="hrCount" style="display:none">' +
                '<div class="num" id="hrCountNum"></div><div class="lbl" id="hrCountLbl"></div></div>' +
            '</div>' +
            '<div class="hr-results" id="hrResults" style="display:none"></div>' +
            '<button class="hr-again" id="hrAgain" style="display:none">🏇 发起新比赛</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    ['hrClose', 'hrSetup', 'hrTa', 'hrErr', 'hrStart', 'hrLast', 'hrLive',
     'hrBanner1', 'hrBanner2', 'hrCanvas', 'hrCount', 'hrCountNum', 'hrCountLbl',
     'hrResults', 'hrAgain'].forEach(function (id) { el[id] = document.getElementById(id); });
    canvas = el.hrCanvas; ctx = canvas.getContext('2d');

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
    /* remember the dismissal so THIS race doesn't pop again (new ones will) */
    if (race && stageNow() !== 'done') {
      try { sessionStorage.setItem('hr_dismissed', race.id); } catch (e) {}
    }
  }
  function showView(v) {
    view = v;
    el.hrSetup.style.display = v === 'setup' ? '' : 'none';
    el.hrLive.style.display = v === 'live' ? '' : 'none';
    resultsShownFor = null;
    if (v === 'live') sizeCanvas();
    refreshSetup(true);
  }

  /* ── canvas sizing / track geometry ────────────────────────── */
  var geo = { W: 0, H: 0, laneH: 0, x0: 0, xF: 0, s: 0, dpr: 1, labels: [] };
  function sizeCanvas() {
    if (!canvas || !horses) { if (canvas) { canvas.width = 0; canvas.height = 0; } return; }
    var n = horses.length;
    var wrapW = el.hrLive.clientWidth || overlay.querySelector('.hr-body').clientWidth || 600;
    var laneH = Math.max(44, Math.min(88, Math.floor((window.innerHeight * 0.52) / n)));
    var W = wrapW, H = laneH * n;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.height = H + 'px';
    var s = laneH * 0.40;
    geo = { W: W, H: H, laneH: laneH, s: s, dpr: dpr,
            x0: s * 1.05 + 8, xF: W - (s * 1.25 + W * 0.045), labels: [] };
    /* pre-trim option labels to fit the track (canvas text, XSS-safe) */
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = labelFont();
    var maxW = Math.min(W * 0.42, 190);
    var opts = raceOpts();
    for (var i = 0; i < n; i++) {
      var txt = String(opts[i] == null ? '?' : opts[i]);
      while (txt.length > 1 && ctx.measureText(txt).width > maxW) txt = txt.slice(0, -1);
      if (txt !== String(opts[i])) txt += '…';
      geo.labels.push(txt);
    }
  }
  function labelFont() {
    var px = Math.max(11, Math.min(14, Math.round(geo.laneH * 0.17)));
    return '600 ' + px + 'px system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
  }

  /* ── drawing ───────────────────────────────────────────────── */
  function shade(hex, f) {
    var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return 'rgb(' + ((r * f) | 0) + ',' + ((g * f) | 0) + ',' + ((b * f) | 0) + ')';
  }
  function rr(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }

  /* A cartoon galloping horse, side view, facing right. (x,y)=body centre,
     s=scale unit (half body length). run=galloping vs standing at the gate;
     ph=gallop phase (advances with speed); sf=normalized speed for lean. */
  function drawHorse(c, x, y, s, pal, num, run, ph, sf) {
    c.save();
    c.translate(x, y);
    var bounce = run ? Math.abs(Math.sin(ph)) * 0.10 * s : (Math.sin(ph * 0.35) * 0.02 * s);
    c.translate(0, -bounce);
    if (run) c.rotate(-(0.04 + Math.sin(ph) * 0.035) * Math.min(sf, 1.4));

    var coat = pal.c, dark = shade(pal.c, 0.72), mane = pal.m;

    /* tail — 3 strands streaming back (drooping when standing) */
    c.strokeStyle = mane; c.lineCap = 'round';
    for (var k = 0; k < 3; k++) {
      var tw = run ? Math.sin(ph * 2 + k * 1.1) * 0.06 * s : Math.sin(ph * 0.35 + k) * 0.015 * s;
      var spread = (k - 1) * 0.09 * s;
      c.lineWidth = s * (0.075 - k * 0.012);
      c.beginPath();
      c.moveTo(-0.44 * s, -0.10 * s);
      if (run) c.quadraticCurveTo(-0.72 * s, -0.16 * s + spread + tw, -0.95 * s, -0.02 * s + spread * 1.6 + tw * 2);
      else     c.quadraticCurveTo(-0.60 * s, 0.06 * s + spread * 0.4 + tw, -0.62 * s, 0.34 * s + spread * 0.6);
      c.stroke();
    }

    /* legs — far pair first (darker), then body, then near pair on top.
       Cartoon gallop: back pair vs front pair roughly antiphase. */
    function leg(hipX, phOff, back, far) {
      var swing = run ? Math.sin(ph + phOff) : 0;
      var lift  = run ? Math.max(0, Math.sin(ph + phOff + 1.1)) : 0;
      var hx = hipX + (far ? -0.03 * s : 0) + (run ? 0 : (back ? -0.04 : 0.04) * s * (far ? 2 : 1));
      var hoofX = hx + swing * (back ? 0.30 : 0.26) * s + (back ? -0.05 : 0.05) * s;
      var hoofY = 0.52 * s - lift * 0.14 * s;
      var kneeX = hx + swing * 0.12 * s + (back ? -0.10 : 0.09) * s;
      c.strokeStyle = far ? dark : coat;
      c.lineWidth = s * 0.085; c.lineCap = 'round';
      c.beginPath(); c.moveTo(hx, 0.08 * s);
      c.quadraticCurveTo(kneeX, 0.30 * s, hoofX, hoofY);
      c.stroke();
      c.fillStyle = '#2b2320';
      c.beginPath(); c.arc(hoofX, hoofY + 0.01 * s, s * 0.052, 0, Math.PI * 2); c.fill();
    }
    leg(-0.30 * s, 0.45, true,  true);
    leg( 0.30 * s, Math.PI + 0.45, false, true);

    /* body */
    c.fillStyle = coat;
    c.beginPath(); c.ellipse(0, 0, 0.50 * s, 0.27 * s, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = pal.l;
    c.beginPath(); c.ellipse(0.03 * s, 0.10 * s, 0.33 * s, 0.14 * s, 0, 0, Math.PI * 2); c.fill();
    if (pal.p) {  /* pinto patches */
      c.fillStyle = '#8a5c38';
      c.beginPath(); c.ellipse(-0.16 * s, -0.06 * s, 0.14 * s, 0.11 * s, 0.3, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(0.20 * s, 0.04 * s, 0.10 * s, 0.08 * s, -0.2, 0, Math.PI * 2); c.fill();
    }

    /* neck (rotated ellipse bridging body → head) */
    c.fillStyle = coat;
    c.beginPath(); c.ellipse(0.40 * s, -0.28 * s, 0.26 * s, 0.135 * s, -0.82, 0, Math.PI * 2); c.fill();

    /* head (bobs slightly with the stride) */
    var hbob = run ? Math.sin(ph + 0.8) * 0.03 * s : 0;
    var hx2 = 0.60 * s, hy2 = -0.47 * s + hbob;
    c.beginPath(); c.ellipse(hx2, hy2, 0.17 * s, 0.10 * s, 0.35, 0, Math.PI * 2); c.fill();
    c.fillStyle = pal.l;                                     /* muzzle */
    c.beginPath(); c.ellipse(hx2 + 0.145 * s, hy2 + 0.055 * s, 0.085 * s, 0.06 * s, 0.35, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#3a2a20';                                 /* nostril */
    c.beginPath(); c.arc(hx2 + 0.19 * s, hy2 + 0.06 * s, 0.016 * s, 0, Math.PI * 2); c.fill();
    /* ears */
    c.fillStyle = coat;
    c.beginPath(); c.moveTo(hx2 - 0.10 * s, hy2 - 0.07 * s); c.lineTo(hx2 - 0.05 * s, hy2 - 0.20 * s);
    c.lineTo(hx2 - 0.00 * s, hy2 - 0.08 * s); c.closePath(); c.fill();
    c.fillStyle = dark;
    c.beginPath(); c.moveTo(hx2 - 0.16 * s, hy2 - 0.06 * s); c.lineTo(hx2 - 0.12 * s, hy2 - 0.18 * s);
    c.lineTo(hx2 - 0.07 * s, hy2 - 0.07 * s); c.closePath(); c.fill();
    /* eye */
    c.fillStyle = '#1d1712';
    c.beginPath(); c.arc(hx2 + 0.03 * s, hy2 - 0.015 * s, 0.026 * s, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,.85)';
    c.beginPath(); c.arc(hx2 + 0.022 * s, hy2 - 0.025 * s, 0.009 * s, 0, Math.PI * 2); c.fill();

    /* mane — lobes along the neck ridge, fluttering when running */
    c.fillStyle = mane;
    for (var m = 0; m < 4; m++) {
      var mt = m / 3;
      var mx = hx2 - 0.14 * s - mt * 0.38 * s + (run ? Math.sin(ph * 2 + m) * 0.02 * s : 0);
      var my = hy2 - 0.10 * s + mt * 0.30 * s;
      c.beginPath(); c.ellipse(mx, my, 0.075 * s, 0.055 * s, -0.8, 0, Math.PI * 2); c.fill();
    }
    c.beginPath(); c.ellipse(hx2 - 0.04 * s, hy2 - 0.12 * s, 0.05 * s, 0.035 * s, 0.3, 0, Math.PI * 2); c.fill();

    /* near-side legs (over the body) */
    leg(-0.30 * s, 0, true,  false);
    leg( 0.30 * s, Math.PI, false, false);

    /* saddle cloth + lane number */
    c.fillStyle = pal.a;
    rr(c, -0.19 * s, -0.20 * s, 0.34 * s, 0.30 * s, 0.06 * s); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = s * 0.022;
    rr(c, -0.19 * s, -0.20 * s, 0.34 * s, 0.30 * s, 0.06 * s); c.stroke();
    c.fillStyle = '#fff';
    c.font = '800 ' + (0.20 * s) + 'px system-ui,sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(String(num), -0.02 * s, -0.045 * s);

    c.restore();
  }

  function drawDust(c, x, y, s, ph) {
    for (var k = 0; k < 3; k++) {
      var life = ((ph / (Math.PI * 2) + k / 3) % 1 + 1) % 1;
      c.fillStyle = 'rgba(214,203,178,' + (0.22 * (1 - life)).toFixed(3) + ')';
      c.beginPath();
      c.arc(x - (0.6 + life * 0.55) * s, y + (0.42 - life * 0.2) * s, (0.05 + 0.09 * life) * s, 0, Math.PI * 2);
      c.fill();
    }
  }

  function render() {
    if (!ctx || !horses || !canvas.width) return;
    var n = horses.length, W = geo.W, H = geo.H, laneH = geo.laneH, s = geo.s;
    var now = serverNow(), t = now - race.startAt;
    var stage = stageNow();
    var dpr = geo.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    /* turf */
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#79b95b'); g.addColorStop(1, '#5c9c45');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (var i = 0; i < n; i++) {
      if (i % 2) { ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.fillRect(0, i * laneH, W, laneH); }
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1;
      ctx.setLineDash([6, 7]);
      ctx.beginPath(); ctx.moveTo(0, i * laneH + 0.5); ctx.lineTo(W, i * laneH + 0.5); ctx.stroke();
      ctx.setLineDash([]);
    }
    /* start line + finish checkers */
    ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fillRect(geo.x0 - 1, 0, 2, H);
    var sq = Math.max(6, Math.min(11, laneH / 5));
    for (var yq = 0; yq * sq < H; yq++) {
      for (var xq = 0; xq < 2; xq++) {
        ctx.fillStyle = (xq + yq) % 2 ? '#f5f2ea' : '#232323';
        ctx.fillRect(geo.xF + xq * sq, yq * sq, sq, Math.min(sq, H - yq * sq));
      }
    }

    /* horses (advance each gallop phase by real frame dt × its speed) */
    var frameNow = performance.now();
    var dt = lastFrameTs ? Math.min((frameNow - lastFrameTs) / 1000, 0.1) : 0.016;
    lastFrameTs = frameNow;

    ctx.font = labelFont();
    for (var j = 0; j < n; j++) {
      var h = horses[j];
      var running = stage === 'racing' && t < h.finish + OVERRUN_MS;
      var sf = stage === 'racing' ? speedAt(h, t) : 0;
      h.gallop += dt * (running ? (7 + 8 * sf) : 1.2);
      var p = stage === 'countdown' ? 0 : progressAt(h, t);
      var x = geo.x0 + p * (geo.xF - geo.x0);
      var yC = j * laneH + laneH * 0.60;

      if (running && t > 400) drawDust(ctx, x, yC, s, h.gallop);
      drawHorse(ctx, x, yC, s, h.pal, j + 1, running, h.gallop, sf);

      /* option label above the horse (clamped inside the canvas) */
      var lbl = geo.labels[j] || '';
      var lw = ctx.measureText(lbl).width;
      var lx = Math.max(6 + lw / 2, Math.min(W - 6 - lw / 2, x));
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(20,40,20,.65)'; ctx.lineJoin = 'round';
      ctx.strokeText(lbl, lx, j * laneH + laneH * 0.24);
      ctx.fillStyle = '#fff';
      ctx.fillText(lbl, lx, j * laneH + laneH * 0.24);

      /* rank badge once across the line */
      if (stage !== 'countdown' && t >= h.finish) {
        var medal = h.rank === 0 ? '🥇' : h.rank === 1 ? '🥈' : h.rank === 2 ? '🥉' : null;
        var bx = Math.min(x + s * 1.15, W - 14), by = yC - s * 0.55;
        if (medal) {
          ctx.font = (laneH * 0.34) + 'px system-ui,sans-serif';
          ctx.fillText(medal, bx, by + laneH * 0.12);
          ctx.font = labelFont();
        } else {
          ctx.fillStyle = 'rgba(0,0,0,.45)';
          ctx.beginPath(); ctx.arc(bx, by, laneH * 0.15, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(h.rank + 1), bx, by);
          ctx.textBaseline = 'alphabetic';
        }
      }
    }
  }

  /* ── live view chrome (banner / countdown / results) ───────── */
  function setBanner(a, b) { el.hrBanner1.textContent = a || ''; el.hrBanner2.textContent = b || ''; }

  function updateLive() {
    var stage = stageNow();
    if (stage === 'none') { showView('setup'); return; }
    var now = serverNow(), t = now - race.startAt;

    if (stage === 'countdown') {
      el.hrCount.style.display = '';
      el.hrCount.classList.remove('go');
      el.hrCountNum.textContent = Math.max(1, Math.ceil(-t / 1000));
      el.hrCountLbl.textContent = '「' + (race.byName || '有人') + '」发起了比赛 — 马上开跑！';
      setBanner('⏱ 即将开跑：' + raceOpts().length + ' 位选手已就位');
      el.hrResults.style.display = 'none'; el.hrAgain.style.display = 'none';
    } else if (stage === 'racing') {
      if (t < 900) {
        el.hrCount.style.display = '';
        el.hrCount.classList.add('go');
        el.hrCountNum.textContent = 'GO!';
        el.hrCountLbl.textContent = '';
      } else el.hrCount.style.display = 'none';
      var lead = null, best = -1;
      for (var i = 0; i < horses.length; i++) {
        var p = progressAt(horses[i], t);
        if (p > best) { best = p; lead = horses[i]; }
      }
      setBanner('🏁 比赛中 — 领先：', lead ? raceOpts()[lead.i] : '');
      el.hrResults.style.display = 'none'; el.hrAgain.style.display = 'none';
    } else { /* done */
      el.hrCount.style.display = 'none';
      var winner = null;
      for (var w = 0; w < horses.length; w++) if (horses[w].rank === 0) winner = horses[w];
      setBanner('🏆 冠军：', winner ? raceOpts()[winner.i] : '');
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
    order.forEach(function (h) {
      var row = document.createElement('div');
      row.className = 'hr-res-row' + (h.rank === 0 ? ' win' : '');
      var rank = document.createElement('span');
      rank.className = 'hr-res-rank';
      rank.textContent = h.rank === 0 ? '🥇' : h.rank === 1 ? '🥈' : h.rank === 2 ? '🥉' : String(h.rank + 1);
      var dot = document.createElement('span');
      dot.className = 'hr-res-dot';
      dot.style.background = h.pal.c;
      var name = document.createElement('span');
      name.className = 'hr-res-name';
      name.textContent = opts[h.i];
      var time = document.createElement('span');
      time.className = 'hr-res-time';
      time.textContent = (h.finish / 1000).toFixed(2) + 's';
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

    /* last-race strip */
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
        function () { /* permission denied (e.g. rules not pasted yet) — feature stays quiet */ });
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
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
