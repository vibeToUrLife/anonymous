/**
 * holiday-list.js — 假期列表 (holiday countdown) for the board.
 *
 * A retro pixel popup, opened by the 🏖️ 假期列表 tile in 更多玩法, that counts
 * down to upcoming public holidays — the essential 摸鱼 companion. Users can
 * also add / remove their own holidays.
 *
 * Behaviour:
 *   - A holiday drops off the list the day it arrives (once the countdown hits
 *     0). Past user-added holidays are best-effort pruned by their owner.
 *   - On each of the 3 days before a holiday, a full-page 8-bit pixel reminder
 *     pops ONCE — only on the user's first page load that day (guarded per
 *     holiday per day in localStorage). It never fires silently on a timer.
 *   - Add / remove holidays. User-added holidays are SHARED across everyone via
 *     the Firestore `holidays` collection, synced live — so all users see the
 *     same list. Only the person who added a holiday (or a developer) may remove
 *     it. Statutory holidays are hard-coded and identical for everyone.
 *
 * Built-in data (法定节假日):
 *   - 2026 = the official State Council arrangement (放假 spans + 调休 workdays):
 *     国务院办公厅关于2026年部分节假日安排的通知 (国办发明电〔2025〕7号).
 *   - 2027 = festival dates only; the official arrangement is published near the
 *     end of the prior year, so those are flagged "待公布" (not an invented span).
 *
 * Injects its own CSS. Shared holidays use the global `db` / `auth` (Firebase,
 * set up in firebase-config.js + app.js). Uses global showToast() when
 * available. The 'Press Start 2P' pixel font is loaded site-wide in index.html.
 *
 * NOTE: requires the Firestore security rule for the `holidays` collection
 * (see firestore.rules) to be deployed, or reads/writes are denied.
 */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;

  var LS_SEEN = 'hol_seen_';           // + id + '_' + YYYY-MM-DD (personal reminder guard)
  var COL = 'holidays';                // shared Firestore collection — everyone sees the same
  var DEV_UIDS = ['HClZmAeuEaUVjHqUaFLFFMTMQnd2', 'eUs3isAgsaRT9VLKEFI4HEFbCnk1'];
  var MAX_NAME = 16;
  var _shared = [];                    // shared user-added holidays (live from Firestore)
  var _loaded = false;                 // first Firestore snapshot arrived
  var _remindChecked = false;          // reminder fires at most once per load
  var _unsub = null;
  var MS_DAY = 86400000;
  var REMIND_WITHIN = 3;               // pixel reminder on the last 3 days
  var WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  /* ── Built-in statutory holidays ────────────────────────────────
     id / name / emoji / start (放假第一天) / end (放假最后一天) /
     days (放假总天数) / makeups (调休上班日) / official (是否已公布) */
  var BUILTIN = [
    // 2026（国务院官方安排）
    { id: 'b26-yd', name: '元旦',   emoji: '🎉', start: '2026-01-01', end: '2026-01-03', days: 3, makeups: ['2026-01-04'], official: true },
    { id: 'b26-cj', name: '春节',   emoji: '🧧', start: '2026-02-15', end: '2026-02-23', days: 9, makeups: ['2026-02-14', '2026-02-28'], official: true },
    { id: 'b26-qm', name: '清明节', emoji: '🌿', start: '2026-04-04', end: '2026-04-06', days: 3, makeups: [], official: true },
    { id: 'b26-ld', name: '劳动节', emoji: '💪', start: '2026-05-01', end: '2026-05-05', days: 5, makeups: ['2026-05-09'], official: true },
    { id: 'b26-dw', name: '端午节', emoji: '🐉', start: '2026-06-19', end: '2026-06-21', days: 3, makeups: [], official: true },
    { id: 'b26-zq', name: '中秋节', emoji: '🥮', start: '2026-09-25', end: '2026-09-27', days: 3, makeups: [], official: true },
    { id: 'b26-gq', name: '国庆节', emoji: '🎆', start: '2026-10-01', end: '2026-10-07', days: 7, makeups: ['2026-09-20', '2026-10-10'], official: true },
    // 2027（节日当天；正式放假安排待国务院公布）
    { id: 'b27-yd', name: '元旦',   emoji: '🎉', start: '2027-01-01', end: '2027-01-01', official: false },
    { id: 'b27-cj', name: '春节',   emoji: '🧧', start: '2027-02-06', end: '2027-02-06', official: false },
    { id: 'b27-qm', name: '清明节', emoji: '🌿', start: '2027-04-05', end: '2027-04-05', official: false },
    { id: 'b27-ld', name: '劳动节', emoji: '💪', start: '2027-05-01', end: '2027-05-01', official: false },
    { id: 'b27-dw', name: '端午节', emoji: '🐉', start: '2027-06-09', end: '2027-06-09', official: false },
    { id: 'b27-zq', name: '中秋节', emoji: '🥮', start: '2027-09-15', end: '2027-09-15', official: false },
    { id: 'b27-gq', name: '国庆节', emoji: '🎆', start: '2027-10-01', end: '2027-10-01', official: false }
  ];

  /* ── Small utils ────────────────────────────────────────────── */
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }
  function toast(msg) { if (typeof window.showToast === 'function') window.showToast(msg); }

  function hasDB() { return typeof db !== 'undefined' && !!db; }
  function myUid() { return (typeof auth !== 'undefined' && auth.currentUser) ? auth.currentUser.uid : null; }
  function isDev() { var u = myUid(); return !!u && DEV_UIDS.indexOf(u) !== -1; }
  function canRemove(h) { return !h.builtin && (h.uid === myUid() || isDev()); }
  function myName() {
    var u = (typeof auth !== 'undefined') ? auth.currentUser : null;
    if (!u) return 'Someone';
    return localStorage.getItem('flappy_custom_name_' + u.uid) ||
      localStorage.getItem('flappy_name') || u.displayName || 'Someone';
  }

  /* Parse 'YYYY-MM-DD' as LOCAL midnight (new Date('YYYY-MM-DD') would be UTC). */
  function parseDate(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function todayMidnight() { var d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function ymd(d) { var p = function (n) { return n < 10 ? '0' + n : '' + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
  function daysBetween(a, b) { return Math.round((b - a) / MS_DAY); }
  function fmtMD(d) { return (d.getMonth() + 1) + '月' + d.getDate() + '日'; }

  function fmtRange(h) {
    var s = parseDate(h.start), e = parseDate(h.end);
    var sTxt = fmtMD(s) + '（' + WEEK[s.getDay()] + '）';
    if (h.start === h.end) return sTxt;
    return sTxt + '–' + fmtMD(e) + '（' + WEEK[e.getDay()] + '）';
  }
  function detailLine(h) {
    var line = fmtRange(h);
    if (h.official && h.days) line += ' · 放假 ' + h.days + ' 天';
    else if (!h.builtin) line += ' · 大家添加的假期';
    return line;
  }
  function makeupText(h) {
    if (!h.official || !h.makeups || !h.makeups.length) return '';
    return '调休上班：' + h.makeups.map(function (m) { return fmtMD(parseDate(m)); }).join('、');
  }

  /** Normalise a shared Firestore holiday doc to the holiday shape. */
  function sharedToHoliday(c) {
    return {
      id: c.id, name: c.name || '', emoji: '📌', start: c.date, end: c.date,
      builtin: false, official: true, uid: c.uid || '', by: c.displayName || ''
    };
  }

  /**
   * All holidays still ahead (countdown ≥ 1 day): the hard-coded statutory ones
   * (identical for everyone) + the shared user-added ones from Firestore, merged
   * and sorted chronologically. A holiday is dropped the day it arrives.
   */
  function activeHolidays() {
    var t = todayMidnight();
    var all = [];
    BUILTIN.forEach(function (h) { var c = {}; for (var k in h) c[k] = h[k]; c.builtin = true; all.push(c); });
    _shared.forEach(function (c) { if (c && c.date) all.push(sharedToHoliday(c)); });
    return all
      .filter(function (h) { return daysBetween(t, parseDate(h.start)) >= 1; })   // gone the day it arrives
      .sort(function (a, b) { return parseDate(a.start) - parseDate(b.start); });
  }

  /* ── Styles (retro pixel "vacation board") ──────────────────── */
  var styled = false;
  function injectStyle() {
    if (styled) return; styled = true;
    var css =
'.hol-ov{position:fixed;inset:0;z-index:9600;display:none;align-items:center;justify-content:center;padding:16px;background:rgba(28,18,10,.72);}' +
'.hol-ov.show{display:flex;}' +
/* light (default) palette — every themeable colour is a var so dark just re-defines them */
'.hol-modal{--ink:#3b2413;--text:#3b2413;--panel:#fdf3dc;--panel2:#f7e8c6;--bevel:#ecd6a4;--edge:rgba(59,36,19,.16);--drop:rgba(0,0,0,.32);' +
  '--mute:#9a7d52;--orange:#ef6c3b;--titletx:#fff3dd;--btnface:#fff3dd;--hero:#ffce4a;--herosub:#7a5a1e;--heronum:#e8542a;--heropill:rgba(255,255,255,.55);--herox:rgba(255,255,255,.85);' +
  '--chip:#fff5db;--minetx:#08463d;--mine:#2bb8a6;--waittx:#7a3a12;--wait:#ffd98a;--mk:#b06a2a;--mkbg:rgba(255,255,255,.5);--mkbd:rgba(59,36,19,.4);--num:#e8542a;' +
  '--delface:#fff;--coral:#ff6b8a;--addbg:#fff7e4;--inpbg:#fff;--ph:#c3ac7d;--teal:#2bb8a6;--tealtx:#08463d;--tealsh:#147a6b;--dash:#e2cc98;' +
  'position:relative;width:100%;max-width:392px;max-height:88vh;display:flex;flex-direction:column;background:var(--panel);color:var(--text);' +
  "font-family:'Noto Sans SC','PingFang SC','Hiragino Sans GB','Microsoft YaHei',system-ui,sans-serif;" +
  'border:4px solid var(--ink);border-radius:8px;overflow:hidden;' +
  'box-shadow:inset 0 0 0 3px var(--panel),inset 0 0 0 6px var(--bevel),8px 8px 0 var(--drop);animation:holIn .18s steps(3) both;}' +
/* dark / terminal palette — follows the site theme (data-theme on <html>) */
':root[data-theme="dark"] .hol-modal,:root[data-theme="terminal"] .hol-modal{' +
  '--ink:#0c0a12;--text:#f3e8d4;--panel:#241d30;--panel2:#2f2742;--bevel:#463a5e;--edge:rgba(0,0,0,.4);--drop:rgba(0,0,0,.6);' +
  '--mute:#a99bc2;--orange:#e8613a;--titletx:#fff1dc;--btnface:#eaddc6;--hero:#3b2c1d;--herosub:#e9c98c;--heronum:#ffb43d;--heropill:rgba(0,0,0,.3);--herox:rgba(255,255,255,.9);' +
  '--chip:#382f4d;--minetx:#04302b;--mine:#38cdba;--waittx:#3a2410;--wait:#e6b063;--mk:#e2a862;--mkbg:rgba(0,0,0,.28);--mkbd:rgba(255,255,255,.22);--num:#ffb646;' +
  '--delface:#eaddc6;--coral:#ff8098;--addbg:#2a2338;--inpbg:#191324;--ph:#7f7294;--teal:#2bb8a6;--tealtx:#04302b;--tealsh:#12806f;--dash:#493d5f;}' +
'@keyframes holIn{0%{transform:translateY(10px) scale(.96);opacity:.4}100%{transform:none;opacity:1}}' +
".hol-pix{font-family:'Press Start 2P','Courier New',monospace;letter-spacing:0;}" +
'.hol-bar{display:flex;align-items:center;gap:9px;padding:12px 12px 12px 15px;background:var(--orange);border-bottom:4px solid var(--ink);}' +
'.hol-bar-ic{font-size:20px;line-height:1;}' +
'.hol-bar-tt{flex:1;font-size:16px;font-weight:800;color:var(--titletx);letter-spacing:.02em;text-shadow:2px 2px 0 rgba(0,0,0,.22);}' +
'.hol-x{width:28px;height:28px;flex-shrink:0;border:3px solid var(--ink);background:var(--btnface);color:var(--ink);border-radius:5px;cursor:pointer;font-size:13px;font-weight:800;line-height:1;box-shadow:0 3px 0 var(--ink);}' +
'.hol-x:active{transform:translateY(3px);box-shadow:none;}' +
'.hol-scroll{flex:1;overflow-y:auto;padding:14px;}' +
'.hol-tip{font-size:11.5px;font-weight:600;color:var(--mute);margin:0 2px 12px;line-height:1.5;}' +
'.hol-hero{position:relative;background:var(--hero);border:3px solid var(--ink);border-radius:6px;padding:14px 14px 16px;text-align:center;box-shadow:4px 4px 0 var(--edge);overflow:hidden;}' +
'.hol-hero-x{position:absolute;top:8px;right:8px;width:24px;height:24px;border:2px solid var(--ink);background:var(--herox);color:var(--ink);border-radius:5px;cursor:pointer;font-size:11px;font-weight:800;line-height:1;box-shadow:0 2px 0 var(--ink);z-index:1;}' +
'.hol-hero-x:active{transform:translateY(2px);box-shadow:none;}' +
'.hol-hero-lb{display:inline-block;font-size:10px;font-weight:800;letter-spacing:.12em;color:var(--herosub);background:var(--heropill);border:2px solid var(--ink);border-radius:4px;padding:2px 9px;}' +
'.hol-hero-nm{font-size:26px;font-weight:900;color:var(--text);margin:10px 0 3px;line-height:1.12;}' +
'.hol-hero-nm .em{margin-right:7px;}' +
'.hol-hero-dt{font-size:12px;font-weight:700;color:var(--herosub);}' +
'.hol-hero-cd{margin-top:12px;display:flex;align-items:baseline;justify-content:center;gap:9px;}' +
'.hol-hero-cd .lead{font-size:11px;font-weight:800;color:var(--herosub);letter-spacing:.06em;}' +
'.hol-hero-cd .num{font-size:40px;color:var(--heronum);line-height:.9;}' +
'.hol-hero-cd .unit{font-size:14px;font-weight:900;color:var(--text);}' +
'.hol-badge{margin-top:10px;display:inline-block;font-size:10.5px;font-weight:700;border-radius:4px;padding:3px 8px;}' +
'.hol-badge.mk{color:var(--mk);background:var(--mkbg);border:2px dashed var(--mkbd);}' +
'.hol-badge.wait{color:#fff;background:var(--coral);border:2px solid var(--ink);margin-left:6px;}' +
'.hol-sec{display:flex;align-items:center;gap:9px;margin:18px 2px 10px;font-size:11px;font-weight:800;letter-spacing:.1em;color:var(--mute);}' +
'.hol-sec::after{content:"";flex:1;height:3px;background:repeating-linear-gradient(90deg,var(--dash) 0 6px,transparent 6px 11px);}' +
'.hol-row{display:flex;align-items:center;gap:10px;padding:9px 10px;background:var(--panel2);border:3px solid var(--ink);border-radius:6px;margin-bottom:9px;box-shadow:3px 3px 0 var(--edge);}' +
'.hol-chip{width:34px;height:34px;flex-shrink:0;display:grid;place-items:center;font-size:19px;background:var(--chip);border:2px solid var(--ink);border-radius:5px;}' +
'.hol-main{flex:1;min-width:0;text-align:left;}' +
'.hol-nm{font-size:14px;font-weight:800;color:var(--text);display:flex;align-items:center;gap:6px;flex-wrap:wrap;line-height:1.2;}' +
'.hol-tag{font-size:9px;font-weight:800;border:2px solid var(--ink);border-radius:3px;padding:1px 5px;line-height:1.4;}' +
'.hol-tag.mine{color:var(--minetx);background:var(--mine);}' +
'.hol-tag.wait{color:var(--waittx);background:var(--wait);}' +
'.hol-dt{font-size:11px;font-weight:600;color:var(--mute);margin-top:3px;}' +
'.hol-mk{font-size:10px;font-weight:600;color:var(--mk);margin-top:2px;}' +
'.hol-num{flex-shrink:0;text-align:center;min-width:38px;}' +
'.hol-num .n{font-size:16px;color:var(--num);}' +
'.hol-num .u{display:block;font-size:9px;font-weight:800;color:var(--mute);margin-top:4px;letter-spacing:.04em;}' +
'.hol-del{width:24px;height:24px;flex-shrink:0;border:2px solid var(--ink);background:var(--delface);color:var(--coral);border-radius:5px;cursor:pointer;font-size:11px;font-weight:800;line-height:1;box-shadow:0 2px 0 var(--ink);}' +
'.hol-del:active{transform:translateY(2px);box-shadow:none;}' +
'.hol-add{margin-top:4px;padding:12px;background:var(--addbg);border:3px dashed var(--ink);border-radius:6px;}' +
'.hol-add-hd{font-size:12px;font-weight:800;color:var(--text);margin-bottom:10px;letter-spacing:.03em;}' +
'.hol-inp{display:block;width:100%;font-family:inherit;font-size:13px;font-weight:700;color:var(--text);background:var(--inpbg);border:3px solid var(--ink);border-radius:5px;padding:9px 10px;margin-bottom:9px;}' +
'.hol-inp::placeholder{color:var(--ph);font-weight:600;}' +
':root[data-theme="dark"] .hol-inp::-webkit-calendar-picker-indicator,:root[data-theme="terminal"] .hol-inp::-webkit-calendar-picker-indicator{filter:invert(1) brightness(1.7);}' +
'.hol-add-btn{width:100%;font-family:inherit;font-size:13px;font-weight:900;color:var(--tealtx);background:var(--teal);border:3px solid var(--ink);border-radius:5px;padding:10px;cursor:pointer;box-shadow:0 4px 0 var(--tealsh);letter-spacing:.06em;}' +
'.hol-add-btn:active{transform:translateY(4px);box-shadow:none;}' +
'.hol-foot{margin-top:13px;font-size:10px;line-height:1.6;color:var(--mute);text-align:center;font-weight:600;}' +
'.hol-restore{margin-top:8px;text-align:center;}' +
'.hol-restore button{font-family:inherit;font-size:11px;font-weight:800;color:var(--text);background:none;border:none;border-bottom:2px dotted var(--text);cursor:pointer;padding:0 0 1px;}' +
'.hol-empty{text-align:center;padding:22px 10px;font-size:13px;font-weight:700;color:var(--mute);line-height:1.6;}' +
/* full-page 8-bit reminder */
'.holr-ov{position:fixed;inset:0;z-index:9720;display:none;align-items:center;justify-content:center;padding:20px;cursor:pointer;' +
  'background:rgba(24,14,8,.82);image-rendering:pixelated;-webkit-font-smoothing:none;opacity:0;transition:opacity .45s ease;' +
  "font-family:'Press Start 2P','Courier New',monospace;}" +
'.holr-ov.show{display:flex;opacity:1;}' +
'.holr-box{text-align:center;max-width:96vw;animation:holrPop .4s steps(4) both;}' +
'@keyframes holrPop{0%{transform:scale(.4)}100%{transform:scale(1)}}' +
'.holr-flag{font-size:clamp(14px,4vw,34px);line-height:1.6;color:#ff6b8a;' +
  'text-shadow:-3px -3px 0 #2b1408,3px -3px 0 #2b1408,-3px 3px 0 #2b1408,3px 3px 0 #2b1408,0 -3px 0 #2b1408,0 3px 0 #2b1408,-3px 0 0 #2b1408,3px 0 0 #2b1408,0 6px 0 #7a1a3a,0 9px 7px rgba(0,0,0,.5);animation:holrBlink .9s steps(1) infinite;}' +
'.holr-days{margin-top:5vh;font-size:clamp(16px,5vw,42px);line-height:1.5;color:#6cf0c2;' +
  'text-shadow:-2px -2px 0 #06321f,2px -2px 0 #06321f,-2px 2px 0 #06321f,2px 2px 0 #06321f,0 5px 0 #14583a,0 8px 6px rgba(0,0,0,.5);}' +
'.holr-days b{color:#fff;font-size:1.5em;margin:0 .12em;}' +
'.holr-nm{margin:4vh 0;font-size:clamp(30px,10vw,88px);line-height:1.4;color:#ffd83d;word-break:break-word;' +
  'text-shadow:-4px -4px 0 #2b1408,4px -4px 0 #2b1408,-4px 4px 0 #2b1408,4px 4px 0 #2b1408,0 -4px 0 #2b1408,0 4px 0 #2b1408,-4px 0 0 #2b1408,4px 0 0 #2b1408,0 9px 0 #8a5a1a,0 13px 10px rgba(0,0,0,.55);}' +
'.holr-dt{font-size:clamp(12px,3.2vw,28px);line-height:1.5;color:#e6e9ff;' +
  'text-shadow:-2px -2px 0 #1a2150,2px -2px 0 #1a2150,-2px 2px 0 #1a2150,2px 2px 0 #1a2150,0 5px 0 #2a346f,0 8px 6px rgba(0,0,0,.5);}' +
'.holr-press{margin-top:6vh;font-size:clamp(11px,2.6vw,24px);line-height:1.5;color:#fff;' +
  'text-shadow:-2px -2px 0 #000,2px -2px 0 #000,-2px 2px 0 #000,2px 2px 0 #000,0 4px 6px rgba(0,0,0,.5);animation:holrBlink 1.1s steps(1) infinite;}' +
'@keyframes holrBlink{50%{opacity:.2}}' +
'@media (prefers-reduced-motion:reduce){.hol-modal,.holr-box,.holr-flag,.holr-press{animation:none;}}';
    var el = document.createElement('style');
    el.id = 'holStyle';
    el.textContent = css;
    document.head.appendChild(el);
  }

  /* ── Popup ──────────────────────────────────────────────────── */
  var overlay = null, scrollEl = null, built = false;

  function build() {
    if (built) return; built = true;
    injectStyle();
    overlay = document.createElement('div');
    overlay.className = 'hol-ov';
    overlay.innerHTML =
      '<div class="hol-modal" role="dialog" aria-label="假期列表">' +
        '<div class="hol-bar"><span class="hol-bar-ic">🏖️</span>' +
          '<span class="hol-bar-tt">假期列表</span>' +
          '<button class="hol-x" data-act="close" title="关闭" aria-label="关闭">✕</button></div>' +
        '<div class="hol-scroll" id="holScroll"></div>' +
      '</div>';
    document.body.appendChild(overlay);
    scrollEl = overlay.querySelector('#holScroll');

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) { hide(); return; }
      var act = e.target.closest && e.target.closest('[data-act]');
      if (!act) return;
      var a = act.getAttribute('data-act');
      if (a === 'close') hide();
      else if (a === 'add') onAdd();
      else if (a === 'del') onDelete(act.getAttribute('data-id'));
    });
  }

  function heroHTML(h, d) {
    var mk = makeupText(h);
    var by = (!h.builtin && h.by) ? '<div class="hol-hero-mk">🙋 ' + esc(h.by) + ' 添加</div>' : '';
    return '<div class="hol-hero">' +
      (canRemove(h) ? '<button class="hol-hero-x" data-act="del" data-id="' + esc(h.id) + '" title="移除" aria-label="移除">✕</button>' : '') +
      '<span class="hol-hero-lb">下一个假期</span>' +
      '<div class="hol-hero-nm"><span class="em">' + h.emoji + '</span>' + esc(h.name) + '</div>' +
      '<div class="hol-hero-dt">' + detailLine(h) + '</div>' +
      '<div class="hol-hero-cd"><span class="lead">距离放假</span>' +
        '<span class="num hol-pix">' + d + '</span><span class="unit">天</span></div>' +
      (mk ? '<div class="hol-badge mk">↩️ ' + mk + '</div>' : '') +
      by +
      (h.official === false ? '<div class="hol-badge wait">放假安排待公布</div>' : '') +
      '</div>';
  }

  function rowHTML(h, d) {
    var mk = makeupText(h);
    var tag = !h.builtin ? '<span class="hol-tag mine">自定义</span>'
      : (h.official === false ? '<span class="hol-tag wait">待公布</span>' : '');
    var by = (!h.builtin && h.by) ? '<span class="hol-mk">🙋 ' + esc(h.by) + '</span>' : '';
    return '<div class="hol-row">' +
      '<span class="hol-chip">' + h.emoji + '</span>' +
      '<span class="hol-main">' +
        '<span class="hol-nm">' + esc(h.name) + tag + '</span>' +
        '<span class="hol-dt">' + detailLine(h) + '</span>' +
        (mk ? '<span class="hol-mk">↩️ ' + mk + '</span>' : '') + by +
      '</span>' +
      '<span class="hol-num"><span class="n hol-pix">' + d + '</span><span class="u">天后</span></span>' +
      (canRemove(h) ? '<button class="hol-del" data-act="del" data-id="' + esc(h.id) + '" title="移除" aria-label="移除">✕</button>' : '') +
      '</div>';
  }

  function addFormHTML() {
    var min = ymd(new Date(todayMidnight().getTime() + MS_DAY));   // earliest = tomorrow
    return '<div class="hol-add">' +
      '<div class="hol-add-hd">➕ 添加假期（大家都看得到）</div>' +
      '<input class="hol-inp" id="holName" type="text" maxlength="16" placeholder="假期名字（如：公司团建）" autocomplete="off">' +
      '<input class="hol-inp" id="holDate" type="date" min="' + min + '">' +
      '<button class="hol-add-btn" data-act="add">加进倒数表</button>' +
      '</div>';
  }

  function render() {
    if (!scrollEl) return;
    var t = todayMidnight();
    var list = activeHolidays();
    var html = '<div class="hol-tip">🏝️ 数着日子等放假 · 大家添加的假期所有人都看得到</div>';

    if (!list.length) {
      html += '<div class="hol-empty">暂时没有假期在倒数了 🏖️<br>加一个假期，大家一起等放假吧！</div>';
    } else {
      var next = list[0];
      html += heroHTML(next, daysBetween(t, parseDate(next.start)));
      var rest = list.slice(1);
      if (rest.length) {
        html += '<div class="hol-sec">📅 后续假期</div>';
        html += rest.map(function (h) { return rowHTML(h, daysBetween(t, parseDate(h.start))); }).join('');
      }
    }

    html += addFormHTML();
    html += '<div class="hol-foot">法定节假日依据国务院公布安排；2027 年具体放假/调休以官方通知为准。<br>大家添加的假期实时同步、所有人共享。</div>';
    scrollEl.innerHTML = html;
  }

  function onAdd() {
    var nameEl = document.getElementById('holName');
    var dateEl = document.getElementById('holDate');
    if (!nameEl || !dateEl) return;
    var name = (nameEl.value || '').trim();
    var date = dateEl.value;
    if (!name) { toast('给假期起个名字吧'); nameEl.focus(); return; }
    if (!date) { toast('选一个日期'); dateEl.focus(); return; }
    if (daysBetween(todayMidnight(), parseDate(date)) < 1) { toast('请选择明天或以后的日期'); dateEl.focus(); return; }
    if (!hasDB() || !myUid()) { toast('请先登录再添加假期'); return; }

    var btn = document.querySelector('.hol-add-btn');
    if (btn) btn.disabled = true;
    db.collection(COL).add({
      uid: myUid(),
      displayName: myName(),
      name: name.slice(0, MAX_NAME),
      date: date,
      createdAt: Date.now()
    }).then(function () {
      toast('📌 已加入假期倒数，大家都看得到啦');
      // The onSnapshot listener re-renders (the local write reflects instantly),
      // which also rebuilds the form with empty inputs.
    }).catch(function (e) {
      console.error('add holiday failed:', e);
      toast('添加失败，稍后再试');
      if (btn) btn.disabled = false;
    });
  }

  function onDelete(id) {
    if (!hasDB() || !id) return;
    db.collection(COL).doc(id).delete().catch(function (e) {
      console.error('delete holiday failed:', e);
      toast('移除失败（只能移除自己添加的假期）');
    });
    // onSnapshot re-renders once the delete lands.
  }

  function hide() { if (overlay) overlay.classList.remove('show'); }
  function open() { build(); _subscribe(); render(); overlay.classList.add('show'); }
  window.openHolidayList = open;

  /* ── Shared holidays: live Firestore sync ───────────────────── */
  function _applySnapshot(snap) {
    var arr = [];
    snap.forEach(function (doc) {
      var x = doc.data() || {};
      arr.push({ id: doc.id, uid: x.uid, displayName: x.displayName, name: x.name, date: x.date, createdAt: x.createdAt });
    });
    _shared = arr;
    _loaded = true;
    _prunePast();
    if (overlay && overlay.classList.contains('show')) render();
    maybeRemindOnce();
  }
  function _subscribe() {
    if (_unsub || !hasDB() || !myUid()) return;   // reads require auth — wait for sign-in
    try {
      _unsub = db.collection(COL).onSnapshot(_applySnapshot, function (e) {
        console.error('holidays snapshot error:', e);
        maybeRemindOnce();   // still fire built-in reminders if the read is denied/offline
      });
    } catch (e) { console.error('holidays subscribe failed:', e); }
  }
  // Best-effort tidy: delete the current user's OWN holidays once they're past.
  function _prunePast() {
    if (!hasDB()) return;
    var t = todayMidnight(), me = myUid();
    if (!me) return;
    _shared.forEach(function (c) {
      if (c.uid === me && c.date && parseDate(c.date) < t) {
        db.collection(COL).doc(c.id).delete().catch(function () {});
      }
    });
  }

  /* ── Full-page 8-bit reminder (last 3 days, first load of the day) ── */
  var remOv = null, remTimer = null;

  function seenKey(id) { return LS_SEEN + id + '_' + ymd(todayMidnight()); }
  function alreadyRemindedToday(id) { try { return !!localStorage.getItem(seenKey(id)); } catch (e) { return false; } }
  function markReminded(id) { try { localStorage.setItem(seenKey(id), '1'); } catch (e) {} }

  function buildReminder() {
    if (remOv) return;
    injectStyle();
    remOv = document.createElement('div');
    remOv.className = 'holr-ov';
    remOv.setAttribute('role', 'alertdialog');
    remOv.innerHTML =
      '<div class="holr-box">' +
        '<div class="holr-flag">★ 假 期 预 告 ★</div>' +
        '<div class="holr-days" id="holrDays"></div>' +
        '<div class="holr-nm" id="holrName"></div>' +
        '<div class="holr-dt" id="holrDate"></div>' +
        '<div class="holr-press">▶ 点一下关闭 ◀</div>' +
      '</div>';
    document.body.appendChild(remOv);
    remOv.addEventListener('click', hideReminder);
  }

  function showReminder(h, d) {
    buildReminder();
    remOv.querySelector('#holrDays').innerHTML = '还有 <b>' + d + '</b> 天';
    remOv.querySelector('#holrName').textContent = h.name;
    var dt = detailLine(h).replace(/（.*?）/g, '');           // drop weekday for the big pixel line
    remOv.querySelector('#holrDate').textContent = dt;
    remOv.classList.remove('hidden');
    void remOv.offsetWidth;
    remOv.classList.add('show');
    clearTimeout(remTimer);
    remTimer = setTimeout(hideReminder, 7000);
  }
  function hideReminder() {
    if (!remOv) return;
    clearTimeout(remTimer);
    remOv.classList.remove('show');
  }

  function maybeRemindOnce() { if (_remindChecked) return; _remindChecked = true; maybeRemind(); }

  /** Fire once, on first entry: nearest holiday within 3 days, not seen today. */
  function maybeRemind() {
    var t = todayMidnight();
    var list = activeHolidays();
    for (var i = 0; i < list.length; i++) {
      var d = daysBetween(t, parseDate(list[i].start));
      if (d > REMIND_WITHIN) return;                          // sorted → nothing nearer
      if (d >= 1 && !alreadyRemindedToday(list[i].id)) {
        showReminder(list[i], d);
        markReminded(list[i].id);
        return;
      }
    }
  }

  /* ── Wire up ─────────────────────────────────────────────────── */
  var btn = document.getElementById('holidayListBtn');
  if (btn) btn.addEventListener('click', open);
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (remOv && remOv.classList.contains('show')) hideReminder();
    else hide();
  });

  // Subscribe to the shared holidays once signed in (reads require auth). The
  // pixel reminder fires after the first snapshot; a fallback timer covers the
  // built-in reminders if Firebase/auth never becomes available (guarded once).
  if (typeof auth !== 'undefined' && auth.onAuthStateChanged) {
    auth.onAuthStateChanged(function (u) { if (u) _subscribe(); });
  }
  setTimeout(maybeRemindOnce, 4000);
})();
