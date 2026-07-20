/**
 * holiday-list.js — 假期列表 (holiday countdown) for the board.
 *
 * A retro pixel popup, opened by the 🏖️ 假期列表 tile in 更多玩法, that counts
 * down to upcoming holidays — the essential 摸鱼 companion. The list is fully
 * community-managed: EVERY signed-in user can add holidays and remove ANY
 * public holiday (there is no hard-coded data and no owner restriction).
 *
 * Behaviour:
 *   - PUBLIC holidays live in the shared Firestore `holidays` collection,
 *     synced live via onSnapshot — everyone sees the same list.
 *   - PRIVATE holidays (add form 🔒 option) live under
 *     user_holidays/{uid}/items and are readable ONLY by their owner
 *     (enforced by security rules) — they merge into your own view and
 *     reminders but nobody else ever sees them.
 *   - A holiday drops off the list the day it arrives (once the countdown hits
 *     0); past docs are best-effort deleted by whichever client sees them.
 *   - On each of the 3 days before a holiday, a full-page 8-bit pixel reminder
 *     pops ONCE — only on the user's first page load that day (guarded per
 *     holiday per day in localStorage). It never fires silently on a timer.
 *
 * Injects its own CSS. Uses the global `db` / `auth` (Firebase, set up in
 * firebase-config.js + app.js) and showToast() when available. The
 * 'Press Start 2P' pixel font is loaded site-wide in index.html.
 *
 * NOTE: requires the Firestore security rule for the `holidays` collection
 * (see firestore.rules) to be deployed, or reads/writes are denied.
 */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;

  var LS_SEEN = 'hol_seen_';           // + id + '_' + YYYY-MM-DD (personal reminder guard)
  var COL = 'holidays';                // shared Firestore collection — everyone sees the same
  var COL_MINE = 'user_holidays';      // private holidays: user_holidays/{uid}/items — owner-only (rules)
  var MAX_NAME = 16;
  var _shared = [];                    // public shared holidays (live from Firestore)
  var _mine = [];                      // my private holidays (live from Firestore)
  var _loaded = false;                 // first public snapshot arrived
  var _remindChecked = false;          // reminder fires at most once per load
  var _unsub = null, _unsubMine = null;
  var _visPrivate = false;             // add-form visibility choice (default: public)
  var MS_DAY = 86400000;
  var REMIND_WITHIN = 3;               // pixel reminder on the last 3 days
  var WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  /* ── Small utils ────────────────────────────────────────────── */
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }
  function toast(msg) { if (typeof window.showToast === 'function') window.showToast(msg); }

  function hasDB() { return typeof db !== 'undefined' && !!db; }
  function myUid() { return (typeof auth !== 'undefined' && auth.currentUser) ? auth.currentUser.uid : null; }
  function canRemove() { return !!myUid(); }   // anyone signed in may remove any holiday
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

  /** "8月15日（周六）" */
  function detailLine(h) {
    var s = parseDate(h.start);
    return fmtMD(s) + '（' + WEEK[s.getDay()] + '）';
  }

  /** Normalise a public shared holiday doc to the holiday shape. */
  function sharedToHoliday(c) {
    return { id: c.id, name: c.name || '', emoji: '📌', start: c.date, uid: c.uid || '', by: c.displayName || '', priv: false };
  }
  /** Normalise one of MY private holiday docs (only I can see these). */
  function mineToHoliday(c) {
    return { id: c.id, name: c.name || '', emoji: '🔒', start: c.date, uid: myUid() || '', by: '', priv: true };
  }

  /**
   * All holidays still ahead (countdown ≥ 1 day): the public shared list plus
   * MY private ones, merged and sorted chronologically. A holiday is dropped
   * the day it arrives.
   */
  function activeHolidays() {
    var t = todayMidnight();
    var all = _shared.filter(function (c) { return c && c.date; }).map(sharedToHoliday)
      .concat(_mine.filter(function (c) { return c && c.date; }).map(mineToHoliday));
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
'.hol-sec{display:flex;align-items:center;gap:9px;margin:18px 2px 10px;font-size:11px;font-weight:800;letter-spacing:.1em;color:var(--mute);}' +
'.hol-sec::after{content:"";flex:1;height:3px;background:repeating-linear-gradient(90deg,var(--dash) 0 6px,transparent 6px 11px);}' +
'.hol-row{display:flex;align-items:center;gap:10px;padding:9px 10px;background:var(--panel2);border:3px solid var(--ink);border-radius:6px;margin-bottom:9px;box-shadow:3px 3px 0 var(--edge);}' +
'.hol-chip{width:34px;height:34px;flex-shrink:0;display:grid;place-items:center;font-size:19px;background:var(--chip);border:2px solid var(--ink);border-radius:5px;}' +
'.hol-main{flex:1;min-width:0;text-align:left;}' +
'.hol-nm{font-size:14px;font-weight:800;color:var(--text);display:flex;align-items:center;gap:6px;flex-wrap:wrap;line-height:1.2;}' +
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
/* public / private toggle */
'.hol-vis{display:flex;gap:8px;margin-bottom:9px;}' +
'.hol-vis-btn{flex:1;font-family:inherit;font-size:12.5px;font-weight:800;color:var(--mute);background:var(--inpbg);border:3px solid var(--ink);border-radius:5px;padding:8px 6px;cursor:pointer;opacity:.5;}' +
'.hol-vis-btn .sub{display:block;font-size:9.5px;font-weight:600;margin-top:3px;}' +
'.hol-vis-btn.on{color:var(--text);background:var(--chip);opacity:1;box-shadow:0 3px 0 var(--ink);}' +
/* retro pixel date picker (replaces the native <input type=date>) */
'.hol-dp{margin-bottom:9px;}' +
'.hol-dp-field{display:flex;align-items:center;gap:8px;width:100%;font-family:inherit;font-size:13px;font-weight:700;color:var(--text);background:var(--inpbg);border:3px solid var(--ink);border-radius:5px;padding:9px 10px;cursor:pointer;text-align:left;}' +
'.hol-dp-field .ph{color:var(--ph);font-weight:600;}' +
'.hol-dp-field .arw{margin-left:auto;font-size:10px;color:var(--mute);}' +
'.hol-dp-panel{margin-top:8px;background:var(--inpbg);border:3px solid var(--ink);border-radius:5px;padding:10px;}' +
'.hol-dp-nav{display:flex;align-items:center;justify-content:space-between;margin-bottom:9px;}' +
'.hol-dp-nav b{font-size:13px;font-weight:900;color:var(--text);letter-spacing:.05em;}' +
'.hol-dp-btn{width:28px;height:28px;border:2px solid var(--ink);background:var(--chip);color:var(--text);border-radius:4px;cursor:pointer;font-size:10px;line-height:1;box-shadow:0 2px 0 var(--ink);}' +
'.hol-dp-btn:disabled{opacity:.3;cursor:default;box-shadow:none;}' +
'.hol-dp-btn:not(:disabled):active{transform:translateY(2px);box-shadow:none;}' +
'.hol-dp-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;}' +
'.hol-dp-wd{font-size:10px;font-weight:800;color:var(--mute);text-align:center;padding:2px 0 4px;}' +
'.hol-dp-wd.we{color:var(--coral);}' +
".hol-dp-day{aspect-ratio:1;min-height:30px;border:2px solid transparent;background:var(--panel2);color:var(--text);border-radius:4px;cursor:pointer;font-family:'Press Start 2P','Courier New',monospace;font-size:9px;display:grid;place-items:center;padding:0;}" +
'.hol-dp-day:disabled{opacity:.22;cursor:default;}' +
'.hol-dp-day:not(:disabled):not(.sel):hover{border-color:var(--mute);}' +
'.hol-dp-day.today{border-color:var(--coral);}' +
'.hol-dp-day.sel{background:var(--teal);color:var(--tealtx);border-color:var(--ink);box-shadow:0 2px 0 var(--ink);}' +
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
      else if (a === 'del') onDelete(act.getAttribute('data-id'), act.getAttribute('data-priv') === '1');
      else if (a === 'vis-pub') { _visPrivate = false; refreshVis(); }
      else if (a === 'vis-priv') { _visPrivate = true; refreshVis(); }
      else if (a === 'dp-toggle') { _dpOpen = !_dpOpen; refreshDP(); }
      else if (a === 'dp-prev') { if (--_dpM < 0) { _dpM = 11; _dpY--; } refreshDP(); }
      else if (a === 'dp-next') { if (++_dpM > 11) { _dpM = 0; _dpY++; } refreshDP(); }
      else if (a === 'dp-day') { _selDate = act.getAttribute('data-date'); _dpOpen = false; refreshDP(); }
    });
  }

  function delBtnHTML(h, cls) {
    return '<button class="' + cls + '" data-act="del" data-id="' + esc(h.id) +
      '" data-priv="' + (h.priv ? '1' : '0') + '" title="移除" aria-label="移除">✕</button>';
  }

  function heroHTML(h, d) {
    var by = h.priv
      ? '<div class="hol-hero-mk">🔒 私密假期 · 只有你看得到</div>'
      : (h.by ? '<div class="hol-hero-mk">🙋 ' + esc(h.by) + ' 添加</div>' : '');
    return '<div class="hol-hero">' +
      (canRemove() ? delBtnHTML(h, 'hol-hero-x') : '') +
      '<span class="hol-hero-lb">下一个假期</span>' +
      '<div class="hol-hero-nm"><span class="em">' + h.emoji + '</span>' + esc(h.name) + '</div>' +
      '<div class="hol-hero-dt">' + detailLine(h) + '</div>' +
      '<div class="hol-hero-cd"><span class="lead">距离放假</span>' +
        '<span class="num hol-pix">' + d + '</span><span class="unit">天</span></div>' +
      by +
      '</div>';
  }

  function rowHTML(h, d) {
    var by = h.priv
      ? '<span class="hol-mk">🔒 只有你看得到</span>'
      : (h.by ? '<span class="hol-mk">🙋 ' + esc(h.by) + '</span>' : '');
    return '<div class="hol-row">' +
      '<span class="hol-chip">' + h.emoji + '</span>' +
      '<span class="hol-main">' +
        '<span class="hol-nm">' + esc(h.name) + '</span>' +
        '<span class="hol-dt">' + detailLine(h) + '</span>' + by +
      '</span>' +
      '<span class="hol-num"><span class="n hol-pix">' + d + '</span><span class="u">天后</span></span>' +
      (canRemove() ? delBtnHTML(h, 'hol-del') : '') +
      '</div>';
  }

  /* ── Retro pixel date picker (Monday-first; selectable from tomorrow) ── */
  var _dpOpen = false, _dpY = null, _dpM = null, _selDate = null;

  function _dpInit() {
    if (_dpY !== null) return;
    var base = _selDate ? parseDate(_selDate) : new Date(todayMidnight().getTime() + MS_DAY);
    _dpY = base.getFullYear(); _dpM = base.getMonth();
  }

  function dpInnerHTML() {
    _dpInit();
    var t = todayMidnight();
    var tm = new Date(t.getTime() + MS_DAY);                    // earliest pickable = tomorrow
    var label = _selDate
      ? fmtMD(parseDate(_selDate)) + '（' + WEEK[parseDate(_selDate).getDay()] + '）'
      : '';
    var html = '<button type="button" class="hol-dp-field" data-act="dp-toggle">📅 ' +
      (label ? '<span>' + label + '</span>' : '<span class="ph">选一个日期</span>') +
      '<span class="arw">' + (_dpOpen ? '▲' : '▼') + '</span></button>';
    if (_dpOpen) {
      var days = new Date(_dpY, _dpM + 1, 0).getDate();
      var lead = (new Date(_dpY, _dpM, 1).getDay() + 6) % 7;    // Monday-first grid
      var canPrev = (_dpY > tm.getFullYear()) || (_dpY === tm.getFullYear() && _dpM > tm.getMonth());
      var maxY = tm.getFullYear() + 2;                          // browse up to 2 years ahead
      var canNext = (_dpY < maxY) || (_dpY === maxY && _dpM < tm.getMonth());
      html += '<div class="hol-dp-panel"><div class="hol-dp-nav">' +
        '<button type="button" class="hol-dp-btn" data-act="dp-prev"' + (canPrev ? '' : ' disabled') + '>◀</button>' +
        '<b>' + _dpY + '年' + (_dpM + 1) + '月</b>' +
        '<button type="button" class="hol-dp-btn" data-act="dp-next"' + (canNext ? '' : ' disabled') + '>▶</button>' +
        '</div><div class="hol-dp-grid">';
      var wd = ['一', '二', '三', '四', '五', '六', '日'];
      for (var i = 0; i < 7; i++) html += '<span class="hol-dp-wd' + (i >= 5 ? ' we' : '') + '">' + wd[i] + '</span>';
      for (i = 0; i < lead; i++) html += '<span></span>';
      for (var d = 1; d <= days; d++) {
        var dt = new Date(_dpY, _dpM, d);
        var ds = ymd(dt);
        var cls = 'hol-dp-day' + (ds === _selDate ? ' sel' : '') + (dt.getTime() === t.getTime() ? ' today' : '');
        html += '<button type="button" class="' + cls + '" data-act="dp-day" data-date="' + ds + '"' +
          (dt < tm ? ' disabled' : '') + '>' + d + '</button>';
      }
      html += '</div></div>';
    }
    return html;
  }

  function refreshDP() {
    var el = document.getElementById('holDatePick');
    if (el) el.innerHTML = dpInnerHTML();
  }

  /** Public / private choice — two pixel toggle buttons. */
  function visInnerHTML() {
    return '<button type="button" class="hol-vis-btn' + (_visPrivate ? '' : ' on') + '" data-act="vis-pub">' +
        '🌍 公开<span class="sub">大家都看得到</span></button>' +
      '<button type="button" class="hol-vis-btn' + (_visPrivate ? ' on' : '') + '" data-act="vis-priv">' +
        '🔒 私密<span class="sub">只有你看得到</span></button>';
  }
  function refreshVis() {
    var el = document.getElementById('holVis');
    if (el) el.innerHTML = visInnerHTML();
  }

  function addFormHTML() {
    return '<div class="hol-add">' +
      '<div class="hol-add-hd">➕ 添加假期</div>' +
      '<input class="hol-inp" id="holName" type="text" maxlength="16" placeholder="假期名字（如：请年假去玩）" autocomplete="off">' +
      '<div class="hol-dp" id="holDatePick">' + dpInnerHTML() + '</div>' +
      '<div class="hol-vis" id="holVis">' + visInnerHTML() + '</div>' +
      '<button class="hol-add-btn" data-act="add">加进倒数表</button>' +
      '</div>';
  }

  function render() {
    if (!scrollEl) return;
    // A live snapshot (someone else adding a holiday) can re-render while the
    // user is mid-typing — keep whatever they had in the name field.
    var keepEl = document.getElementById('holName');
    var keepName = keepEl ? keepEl.value : '';
    var t = todayMidnight();
    var list = activeHolidays();
    var html = '<div class="hol-tip">🏝️ 数着日子等放假 · 假期由大家一起添加和管理</div>';

    if (!list.length) {
      html += '<div class="hol-empty">' + (_loaded
        ? '还没有假期在倒数 🏖️<br>加一个假期，大家一起等放假吧！'
        : '假期加载中…') + '</div>';
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
    html += '<div class="hol-foot">公开假期实时同步、所有人共享，任何人都可以添加或移除；<br>🔒 私密假期只有你自己看得到。</div>';
    scrollEl.innerHTML = html;
    if (keepName) { var el = document.getElementById('holName'); if (el) el.value = keepName; }
  }

  function onAdd() {
    var nameEl = document.getElementById('holName');
    if (!nameEl) return;
    var name = (nameEl.value || '').trim();
    var date = _selDate;
    if (!name) { toast('给假期起个名字吧'); nameEl.focus(); return; }
    if (!date) { toast('选一个日期'); if (!_dpOpen) { _dpOpen = true; refreshDP(); } return; }
    if (daysBetween(todayMidnight(), parseDate(date)) < 1) { toast('请选择明天或以后的日期'); return; }
    if (!hasDB() || !myUid()) { toast('请先登录再添加假期'); return; }

    var btn = document.querySelector('.hol-add-btn');
    if (btn) btn.disabled = true;
    var priv = _visPrivate;
    var write = priv
      ? _mineRef().add({ name: name.slice(0, MAX_NAME), date: date, createdAt: Date.now() })
      : db.collection(COL).add({
          uid: myUid(),
          displayName: myName(),
          name: name.slice(0, MAX_NAME),
          date: date,
          createdAt: Date.now()
        });
    write.then(function () {
      toast(priv ? '🔒 已加入你的私密假期倒数' : '📌 已加入假期倒数，大家都看得到啦');
      // Reset the form state; the onSnapshot re-render rebuilds it fresh
      // (the local write reflects instantly).
      _selDate = null; _dpOpen = false; _dpY = null; _dpM = null; _visPrivate = false;
    }).catch(function (e) {
      console.error('add holiday failed:', e);
      toast('添加失败，稍后再试');
      if (btn) btn.disabled = false;
    });
  }

  function onDelete(id, priv) {
    if (!hasDB() || !id) return;
    var ref = priv ? _mineRef() : db.collection(COL);
    if (!ref) return;
    ref.doc(id).delete().catch(function (e) {
      console.error('delete holiday failed:', e);
      toast('移除失败，稍后再试');
    });
    // onSnapshot re-renders once the delete lands.
  }

  function hide() { if (overlay) overlay.classList.remove('show'); }
  function open() { build(); _subscribe(); render(); overlay.classList.add('show'); }
  window.openHolidayList = open;

  /* ── Live Firestore sync: public `holidays` + my `user_holidays` ── */
  function _mineRef() {
    var u = myUid();
    return (hasDB() && u) ? db.collection(COL_MINE).doc(u).collection('items') : null;
  }
  function _docsOf(snap) {
    var arr = [];
    snap.forEach(function (doc) {
      var x = doc.data() || {};
      arr.push({ id: doc.id, uid: x.uid, displayName: x.displayName, name: x.name, date: x.date, createdAt: x.createdAt });
    });
    return arr;
  }
  function _afterSnapshot() {
    _prunePast();
    if (overlay && overlay.classList.contains('show')) render();
    maybeRemindOnce();
  }
  function _subscribe() {
    if (!hasDB() || !myUid()) return;   // reads require auth — wait for sign-in
    if (!_unsub) {
      try {
        _unsub = db.collection(COL).onSnapshot(function (snap) {
          _shared = _docsOf(snap);
          _loaded = true;
          _afterSnapshot();
        }, function (e) { console.error('holidays snapshot error:', e); });
      } catch (e) { console.error('holidays subscribe failed:', e); }
    }
    if (!_unsubMine) {
      try {
        _unsubMine = _mineRef().onSnapshot(function (snap) {
          _mine = _docsOf(snap);
          _afterSnapshot();
        }, function (e) { console.error('my holidays snapshot error:', e); });
      } catch (e) { console.error('my holidays subscribe failed:', e); }
    }
  }
  // Best-effort tidy: public past docs may be deleted by anyone; private past
  // docs only by me (I'm the only one who can see them). Deletes are
  // idempotent — racing clients are harmless.
  function _prunePast() {
    if (!hasDB() || !myUid()) return;
    var t = todayMidnight();
    _shared.forEach(function (c) {
      if (c.date && parseDate(c.date) < t) {
        db.collection(COL).doc(c.id).delete().catch(function () {});
      }
    });
    var mine = _mineRef();
    if (mine) _mine.forEach(function (c) {
      if (c.date && parseDate(c.date) < t) mine.doc(c.id).delete().catch(function () {});
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

  // Subscribe to the shared holidays once signed in (reads require auth); the
  // pixel reminder fires right after the first snapshot arrives.
  if (typeof auth !== 'undefined' && auth.onAuthStateChanged) {
    auth.onAuthStateChanged(function (u) { if (u) _subscribe(); });
  }
})();
