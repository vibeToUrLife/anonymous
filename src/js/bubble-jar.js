/**
 * bubble-jar.js — 🫙 泡泡罐: catch a bubble before it expires, re-read it later.
 *
 * Saves a small TEXT snapshot into localStorage — device-local, zero Firestore
 * cost (images become a "🖼️ 图片留言" note, their data is never copied). The
 * pure rules (dedupe / newest-first / cap) live in jar-logic.js.
 *
 * Entry points:
 *  · the 🫙 收藏 button in every bubble footer (app.js calls window.jarCatch
 *    with the bubble's data — same decoupling as openBoost/openAward);
 *  · the 🫙 泡泡罐 toggle in the live bar opens the jar overlay.
 *
 * Feature flag: jar — feature-flags.js hides #jarToggle; this file also hides
 * the per-bubble buttons with an injected rule and no-ops jarCatch.
 */
(function () {
  'use strict';

  const Jar = window.JarLogic;
  if (!Jar) return;

  const KEY = 'bubble_jar';
  const toggle = document.getElementById('jarToggle');

  function disabled() { return window.FEATURES && window.FEATURES.jar === false; }
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } }
  function save(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); return true; }
    catch (e) { return false; }                    // quota full / storage blocked
  }

  // The flags doc loads async; once it lands, a disabled jar also hides the
  // per-bubble 收藏 buttons (feature-flags.js itself only hides element ids).
  let cssInjected = false;
  function applyFlagCss() {
    if (!disabled() || cssInjected) return;
    cssInjected = true;
    const st = document.createElement('style');
    st.textContent = '.jar-btn { display: none !important; }';
    document.head.appendChild(st);
  }
  applyFlagCss();
  let tries = 0;
  const iv = setInterval(() => {
    if (window.FEATURES) { applyFlagCss(); clearInterval(iv); }
    else if (++tries > 100) clearInterval(iv);
  }, 100);

  /* ── Catch (called from the bubble footer in app.js) ─────── */
  window.jarCatch = function (a, bubbleEl) {
    if (disabled()) return;
    const entry = Jar.snapshot(a, Date.now());
    const res = Jar.add(load(), entry);
    if (!res.added) {
      if (typeof showToast === 'function') {
        showToast(res.reason === 'dup' ? '已经在泡泡罐里啦 🫙' : '无法收藏这条留言');
      }
      return;
    }
    if (!save(res.list)) {                         // never celebrate a lost catch
      if (typeof showToast === 'function') showToast('保存失败 —— 本机存储空间不够了', 'error');
      return;
    }
    flyToJar(bubbleEl);
    if (typeof showToast === 'function') showToast('🫙 收进泡泡罐了！');
    if (listEl) renderList();                      // live update if overlay open
  };

  // A ghost of the bubble shrinks and flies toward the jar button.
  function flyToJar(bubbleEl) {
    if (!bubbleEl || !bubbleEl.animate || document.body.classList.contains('no-animations')) return;
    const from = bubbleEl.getBoundingClientRect();
    const to = toggle ? toggle.getBoundingClientRect()
                      : { left: window.innerWidth - 40, top: 20, width: 0, height: 0 };
    const ghost = bubbleEl.cloneNode(true);
    ghost.className = bubbleEl.className + ' jar-ghost';
    // opacity must be inline: .jar-ghost kills the floatIn animation whose
    // forwards-fill is what normally lifts bubbles from their opacity:0 start.
    ghost.style.cssText = 'position:fixed;margin:0;left:' + from.left + 'px;top:' + from.top +
      'px;width:' + from.width + 'px;pointer-events:none;z-index:600;opacity:.9;';
    document.body.appendChild(ghost);
    const dx = (to.left + to.width / 2) - (from.left + from.width / 2);
    const dy = (to.top + to.height / 2) - (from.top + from.height / 2);
    try {
      ghost.animate([
        { transform: 'translate(0,0) scale(1)', opacity: 0.9 },
        { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(0.05)', opacity: 0.2 }
      ], { duration: 550, easing: 'cubic-bezier(0.5, -0.2, 0.8, 0.6)' })
        .addEventListener('finish', () => ghost.remove());
      if (toggle && toggle.animate) {
        setTimeout(() => toggle.animate(
          [{ scale: '1' }, { scale: '1.25' }, { scale: '1' }], { duration: 300 }), 480);
      }
    } catch (_) { ghost.remove(); }
    setTimeout(() => ghost.remove(), 900);         // safety net
  }

  /* ── Overlay ─────────────────────────────────────────────── */
  let overlay = null, listEl = null;

  function fmtWhen(ms) {
    if (!ms) return '';
    const d = new Date(ms);
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' +
      String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function renderList() {
    if (!listEl) return;
    const list = load();
    const countEl = overlay.querySelector('.jar-count');
    if (countEl) countEl.textContent = list.length + '/' + Jar.CAP;
    if (!list.length) {
      listEl.innerHTML = '<div class="jar-empty">罐子还是空的 —— 在留言下点 🫙 收藏，' +
        '留言过期消失后也能在这里回味。<br><small>只保存在这台设备上</small></div>';
      return;
    }
    listEl.innerHTML = '';
    list.forEach((e) => {
      if (!e || !e.id) return;
      const item = document.createElement('div');
      item.className = 'jar-item';
      const txt = document.createElement('div');
      txt.className = 'jar-item-text';
      txt.textContent = e.t || '💬';
      const meta = document.createElement('div');
      meta.className = 'jar-item-meta';
      meta.textContent = (e.n ? e.n + ' · ' : '') + '发于 ' + fmtWhen(e.ts) + ' · 收于 ' + fmtWhen(e.at);
      const del = document.createElement('button');
      del.className = 'jar-item-del';
      del.type = 'button';
      del.title = '从罐子里拿出来';
      del.textContent = '✕';
      del.addEventListener('click', () => {
        save(Jar.remove(load(), e.id));
        renderList();
      });
      item.appendChild(del);
      item.appendChild(txt);
      item.appendChild(meta);
      listEl.appendChild(item);
    });
  }

  function open() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.className = 'jar-overlay';
    overlay.innerHTML =
      '<div class="jar-panel">' +
        '<div class="jar-head">🫙 泡泡罐 <span class="jar-count"></span>' +
          '<button class="jar-close" type="button" title="Close (Esc)">✕</button></div>' +
        '<div class="jar-list"></div>' +
      '</div>';
    document.body.appendChild(overlay);
    listEl = overlay.querySelector('.jar-list');
    overlay.querySelector('.jar-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    renderList();
    if (toggle) toggle.classList.add('active');
  }

  function close() {
    if (!overlay) return;
    overlay.remove();
    overlay = null; listEl = null;
    if (toggle) toggle.classList.remove('active');
  }

  if (toggle) toggle.addEventListener('click', () => { overlay ? close() : open(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && overlay) close(); });
})();
