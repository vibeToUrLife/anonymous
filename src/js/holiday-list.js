/**
 * holiday-list.js — 假期列表 (public-holiday countdown) for the board.
 *
 * A read-only popup, opened by the 🏖️ 假期列表 tile in 更多玩法, listing China's
 * statutory public holidays (法定节假日) with a live countdown to each — the
 * essential 摸鱼 companion: how many days until your next day off.
 *
 * Data is a curated, hard-coded table (see HOLIDAYS below):
 *   - 2026 uses the OFFICIAL State Council arrangement — real 放假 spans + 调休
 *     (makeup) workdays. Source: 国务院办公厅关于2026年部分节假日安排的通知
 *     (国办发明电〔2025〕7号, 2025-11-04).
 *   - 2027 lists the festival DATES only. The official day-off arrangement is
 *     published near the end of the prior year, so those entries are flagged
 *     `official:false` and shown as "放假安排待公布" instead of an invented span.
 *
 * To maintain: when the State Council publishes the next year's notice, fill in
 * that year's spans/调休 (set official:true) and append the following year's
 * festival dates. Past holidays drop off the list automatically.
 *
 * Reuses the shared .cc-* popup shell (interactive.css). No backend, no auth.
 */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;

  /* ── Holiday table ──────────────────────────────────────────────
     name    节日名
     emoji   图标（避免使用国旗/ZWJ 组合，兼容 Windows）
     start   放假第一天 'YYYY-MM-DD'（非官方年份为节日当天）
     end     放假最后一天（非官方年份 === start）
     days    放假总天数（仅官方年份）
     makeups 调休上班日数组（仅官方年份）
     official 是否已公布正式放假安排 */
  var HOLIDAYS = [
    // ── 2026（国务院官方安排）──
    { name: '元旦',   emoji: '🎉', start: '2026-01-01', end: '2026-01-03', days: 3, makeups: ['2026-01-04'], official: true },
    { name: '春节',   emoji: '🧧', start: '2026-02-15', end: '2026-02-23', days: 9, makeups: ['2026-02-14', '2026-02-28'], official: true },
    { name: '清明节', emoji: '🌿', start: '2026-04-04', end: '2026-04-06', days: 3, makeups: [], official: true },
    { name: '劳动节', emoji: '💪', start: '2026-05-01', end: '2026-05-05', days: 5, makeups: ['2026-05-09'], official: true },
    { name: '端午节', emoji: '🐉', start: '2026-06-19', end: '2026-06-21', days: 3, makeups: [], official: true },
    { name: '中秋节', emoji: '🥮', start: '2026-09-25', end: '2026-09-27', days: 3, makeups: [], official: true },
    { name: '国庆节', emoji: '🎆', start: '2026-10-01', end: '2026-10-07', days: 7, makeups: ['2026-09-20', '2026-10-10'], official: true },
    // ── 2027（节日当天；正式放假安排待国务院公布）──
    { name: '元旦',   emoji: '🎉', start: '2027-01-01', end: '2027-01-01', official: false },
    { name: '春节',   emoji: '🧧', start: '2027-02-06', end: '2027-02-06', official: false },
    { name: '清明节', emoji: '🌿', start: '2027-04-05', end: '2027-04-05', official: false },
    { name: '劳动节', emoji: '💪', start: '2027-05-01', end: '2027-05-01', official: false },
    { name: '端午节', emoji: '🐉', start: '2027-06-09', end: '2027-06-09', official: false },
    { name: '中秋节', emoji: '🥮', start: '2027-09-15', end: '2027-09-15', official: false },
    { name: '国庆节', emoji: '🎆', start: '2027-10-01', end: '2027-10-01', official: false }
  ];

  var MS_DAY = 86400000;
  var WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }

  /* Parse 'YYYY-MM-DD' as a LOCAL midnight Date (new Date('YYYY-MM-DD') parses
     as UTC, which would drift the day for non-UTC viewers). */
  function parseDate(s) {
    var p = s.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  function todayMidnight() {
    var d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  function daysBetween(a, b) { return Math.round((b - a) / MS_DAY); }

  function fmtMD(d) { return (d.getMonth() + 1) + '月' + d.getDate() + '日'; }

  /** "10月1日（周四）–10月7日（周三）" or single-day "1月1日（周五）" */
  function fmtRange(h) {
    var s = parseDate(h.start), e = parseDate(h.end);
    var sTxt = fmtMD(s) + '（' + WEEK[s.getDay()] + '）';
    if (h.start === h.end) return sTxt;
    return sTxt + '–' + fmtMD(e) + '（' + WEEK[e.getDay()] + '）';
  }

  /** 放假说明行：日期范围 + 放假天数（官方）/ 待公布提示 */
  function detailLine(h) {
    var line = fmtRange(h);
    if (h.official && h.days) line += ' · 放假 ' + h.days + ' 天';
    return line;
  }

  /** 调休上班文案，例如 "调休上班：9月20日、10月10日"（无则空字符串） */
  function makeupText(h) {
    if (!h.official || !h.makeups || !h.makeups.length) return '';
    var days = h.makeups.map(function (m) { return fmtMD(parseDate(m)); }).join('、');
    return '↩️ 调休上班：' + days;
  }

  /** 相对今天的状态：past（已过）/ now（假期中）/ soon（未到） */
  function statusOf(h, t) {
    var s = parseDate(h.start), e = parseDate(h.end);
    if (t > e) return { kind: 'past' };
    if (t >= s && t <= e) return { kind: 'now', dLeft: daysBetween(t, e) };
    return { kind: 'soon', dTo: daysBetween(t, s) };
  }

  /* ── Popup shell ────────────────────────────────────────────── */
  var overlay = null, bodyEl = null, built = false, styled = false;

  function injectStyle() {
    if (styled) return;
    styled = true;
    var css =
      '.hol-scroll{flex:1;overflow-y:auto;padding:2px 16px 16px;}' +
      '.hol-hero{margin:6px 0 14px;padding:16px 16px 15px;border-radius:16px;text-align:center;' +
        'background:linear-gradient(135deg,rgba(96,165,250,.24),rgba(52,211,153,.18));' +
        'border:1px solid rgba(255,255,255,.14);}' +
      '.hol-hero.now{background:linear-gradient(135deg,rgba(52,211,153,.28),rgba(250,204,21,.18));}' +
      '.hol-hero-lb{font-size:12px;letter-spacing:.06em;color:rgba(255,255,255,.6);}' +
      '.hol-hero-name{font-size:23px;font-weight:800;color:#fff;margin:5px 0 3px;}' +
      '.hol-hero-name .em{margin-right:7px;}' +
      '.hol-hero-date{font-size:12.5px;color:rgba(255,255,255,.78);}' +
      '.hol-hero-cd{font-size:14px;font-weight:700;color:#fde68a;margin-top:9px;}' +
      '.hol-hero-cd b{font-size:30px;margin:0 3px;color:#fff;vertical-align:-2px;}' +
      '.hol-hero-mk{font-size:11px;color:rgba(255,255,255,.62);margin-top:7px;}' +
      '.hol-hero-tag{display:inline-block;margin-top:9px;font-size:11px;padding:2px 9px;' +
        'border-radius:999px;background:rgba(255,255,255,.15);color:rgba(255,255,255,.82);}' +
      '.hol-sub{font-size:12px;color:rgba(255,255,255,.45);margin:2px 3px 8px;}' +
      '.hol-row{display:flex;align-items:center;gap:11px;padding:10px 12px;border-radius:12px;' +
        'background:rgba(255,255,255,.05);margin-bottom:7px;}' +
      '.hol-row.now{background:rgba(52,211,153,.16);border:1px solid rgba(52,211,153,.45);}' +
      '.hol-em{font-size:22px;flex-shrink:0;width:26px;text-align:center;}' +
      '.hol-main{flex:1;min-width:0;text-align:left;}' +
      '.hol-name{font-size:14px;font-weight:700;color:#fff;}' +
      '.hol-name .tag{font-size:10px;font-weight:600;color:#a5b4fc;margin-left:6px;}' +
      '.hol-date{font-size:11.5px;color:rgba(255,255,255,.6);margin-top:2px;}' +
      '.hol-mk{font-size:11px;color:rgba(255,255,255,.42);margin-top:1px;}' +
      '.hol-cd{flex-shrink:0;text-align:right;min-width:44px;}' +
      '.hol-cd-num{font-size:16px;font-weight:800;color:#fde68a;line-height:1.1;}' +
      '.hol-cd-num.now{color:#34d399;}' +
      '.hol-cd-unit{font-size:11px;color:rgba(255,255,255,.55);}' +
      '.hol-note{font-size:11px;color:rgba(255,255,255,.4);line-height:1.55;margin-top:8px;text-align:center;}' +
      '.hol-empty{font-size:13px;color:rgba(255,255,255,.6);text-align:center;padding:26px 10px;}' +
      /* light theme */
      'body.light-theme .hol-hero-name,body.light-theme .hol-name{color:#2a2150;}' +
      'body.light-theme .hol-hero-cd b{color:#2a2150;}' +
      'body.light-theme .hol-hero-cd,body.light-theme .hol-cd-num{color:#b45309;}' +
      'body.light-theme .hol-hero-date,body.light-theme .hol-date{color:rgba(0,0,0,.55);}' +
      'body.light-theme .hol-hero-lb,body.light-theme .hol-hero-mk,body.light-theme .hol-sub,' +
        'body.light-theme .hol-mk,body.light-theme .hol-note,body.light-theme .hol-empty,' +
        'body.light-theme .hol-cd-unit{color:rgba(0,0,0,.5);}' +
      'body.light-theme .hol-row{background:rgba(0,0,0,.04);}' +
      'body.light-theme .hol-cd-num.now{color:#059669;}';
    var el = document.createElement('style');
    el.id = 'holStyle';
    el.textContent = css;
    document.head.appendChild(el);
  }

  function build() {
    if (built) return;
    built = true;
    injectStyle();
    overlay = document.createElement('div');
    overlay.className = 'cc-overlay';
    overlay.innerHTML =
      '<div class="cc-card" style="max-width:400px;height:auto;max-height:86vh;">' +
        '<button class="cc-close" title="关闭">✕</button>' +
        '<div style="padding:18px 20px 2px;">' +
          '<div class="cc-title">🏖️ 假期列表</div>' +
          '<div class="cc-hint" style="text-align:left;margin:6px 0 0;">摸鱼人必备 · 数着日子等放假 🎉</div>' +
        '</div>' +
        '<div class="hol-scroll" id="holBody"></div>' +
      '</div>';
    document.body.appendChild(overlay);
    bodyEl = overlay.querySelector('#holBody');
    overlay.addEventListener('click', function (e) { if (e.target === overlay) hide(); });
    overlay.querySelector('.cc-close').addEventListener('click', hide);
  }

  function heroHTML(h, st) {
    var cd;
    if (st.kind === 'now') {
      cd = (st.dLeft > 0)
        ? '🎉 假期进行中 · 还有 <b>' + st.dLeft + '</b> 天结束'
        : '🎉 假期最后一天，且过且珍惜';
    } else if (st.dTo === 1) {
      cd = '🔥 明天就放假啦！';
    } else {
      cd = '距离放假还有 <b>' + st.dTo + '</b> 天';
    }
    var mk = makeupText(h);
    return '<div class="hol-hero' + (st.kind === 'now' ? ' now' : '') + '">' +
      '<div class="hol-hero-lb">' + (st.kind === 'now' ? '正在放假' : '下一个假期') + '</div>' +
      '<div class="hol-hero-name"><span class="em">' + h.emoji + '</span>' + esc(h.name) + '</div>' +
      '<div class="hol-hero-date">' + detailLine(h) + '</div>' +
      '<div class="hol-hero-cd">' + cd + '</div>' +
      (mk ? '<div class="hol-hero-mk">' + mk + '</div>' : '') +
      (h.official ? '' : '<div class="hol-hero-tag">正式放假安排待公布</div>') +
      '</div>';
  }

  function rowHTML(h, st) {
    var num, unit, now = st.kind === 'now';
    if (now) { num = '🎉'; unit = '进行中'; }
    else { num = st.dTo; unit = '天后'; }
    var mk = makeupText(h);
    return '<div class="hol-row' + (now ? ' now' : '') + '">' +
      '<span class="hol-em">' + h.emoji + '</span>' +
      '<span class="hol-main">' +
        '<span class="hol-name">' + esc(h.name) +
          (h.official ? '' : '<span class="tag">待公布</span>') + '</span>' +
        '<span class="hol-date">' + detailLine(h) + '</span>' +
        (mk ? '<span class="hol-mk">' + mk + '</span>' : '') +
      '</span>' +
      '<span class="hol-cd">' +
        '<span class="hol-cd-num' + (now ? ' now' : '') + '">' + num + '</span>' +
        '<span class="hol-cd-unit">' + unit + '</span>' +
      '</span>' +
      '</div>';
  }

  function render() {
    var t = todayMidnight();
    // Upcoming + ongoing, chronological.
    var live = HOLIDAYS
      .map(function (h) { return { h: h, st: statusOf(h, t) }; })
      .filter(function (x) { return x.st.kind !== 'past'; })
      .sort(function (a, b) { return parseDate(a.h.start) - parseDate(b.h.start); });

    if (!live.length) {
      bodyEl.innerHTML = '<div class="hol-empty">假期安排更新中，敬请期待～ 🏖️</div>';
      return;
    }

    var next = live[0];
    var rest = live.slice(1);
    var html = heroHTML(next.h, next.st);
    if (rest.length) {
      html += '<div class="hol-sub">📅 后续假期</div>';
      html += rest.map(function (x) { return rowHTML(x.h, x.st); }).join('');
    }
    html += '<div class="hol-note">数据依据国务院公布的节假日安排，2027 年具体放假/调休安排以官方通知为准。</div>';
    bodyEl.innerHTML = html;
  }

  function hide() { if (overlay) overlay.classList.remove('show'); }
  function open() { build(); render(); overlay.classList.add('show'); }
  window.openHolidayList = open;

  var btn = document.getElementById('holidayListBtn');
  if (btn) btn.addEventListener('click', open);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hide(); });
})();
