/**
 * jar-logic.js — Pure logic for the 泡泡罐 (bubble jar): a collection of
 * favorite messages saved before their 6-hour expiry.
 *
 * Entries are small TEXT snapshots (images become a note, not data) so the
 * whole jar stays a few KB — small enough to live in localStorage as the
 * instant cache AND sync to the user's rooms/{uid} doc so it follows them
 * across devices (server ∪ local wins on load; see merge()).
 * Browser global: JarLogic. CommonJS export for the Node unit tests.
 */
(function (global) {
  'use strict';

  const Jar = {};

  /** Most entries kept; the oldest fall out when the jar overflows. */
  Jar.CAP = 60;

  /**
   * Build a jar entry from a rendered message's data object.
   * @param {{id, text?, type?, image?, name?, ts?}} a  answers-doc data
   * @param {number} now  save timestamp (ms)
   * @returns {{id:string,t:string,n:string,ts:number,at:number}|null}
   */
  Jar.snapshot = function (a, now) {
    if (!a || a.id == null) return null;
    let t = String(a.text || '').trim().replace(/\s+/g, ' ');
    if (a.type === 'poll' && t) t = '📊 ' + t;
    if (!t) t = a.image ? '🖼️ 图片留言' : '💬';
    return {
      id: String(a.id),
      t: t.slice(0, 200),
      n: String(a.name || '').slice(0, 40),
      ts: (typeof a.ts === 'number') ? a.ts : 0,
      at: now || 0
    };
  };

  /**
   * Add an entry: newest first, no duplicates, capped.
   * @returns {{list:Array, added:boolean, reason?:'dup'|'invalid'}}
   */
  Jar.add = function (list, entry, cap) {
    cap = cap || Jar.CAP;
    if (!Array.isArray(list)) list = [];
    if (!entry || !entry.id) return { list: list, added: false, reason: 'invalid' };
    if (list.some(e => e && e.id === entry.id)) return { list: list, added: false, reason: 'dup' };
    const out = [entry].concat(list);
    if (out.length > cap) out.length = cap;
    return { list: out, added: true };
  };

  /** Remove an entry by id (unknown ids are a no-op). */
  Jar.remove = function (list, id) {
    if (!Array.isArray(list)) return [];
    return list.filter(e => e && e.id !== id);
  };

  /**
   * Union two jars by id (for cross-device sync): keep the copy saved most
   * recently, newest-first, capped. Used to reconcile the cloud copy with the
   * local one on load so neither device loses a save.
   * @returns {Array}
   */
  Jar.merge = function (a, b, cap) {
    cap = cap || Jar.CAP;
    const byId = new Map();
    const consider = (list) => {
      if (!Array.isArray(list)) return;
      for (const e of list) {
        if (!e || !e.id) continue;
        const prev = byId.get(e.id);
        if (!prev || (e.at || 0) > (prev.at || 0)) byId.set(e.id, e);
      }
    };
    consider(a); consider(b);
    const merged = Array.from(byId.values()).sort((x, y) => (y.at || 0) - (x.at || 0));
    if (merged.length > cap) merged.length = cap;
    return merged;
  };

  /** Compact bilingual-friendly "time since" for a saved-at stamp. */
  Jar.relTime = function (fromMs, nowMs) {
    fromMs = +fromMs || 0; nowMs = +nowMs || 0;
    let d = nowMs - fromMs;
    if (d < 0) d = 0;
    const MIN = 60000, HR = 3600000, DAY = 86400000;
    if (d < MIN) return '刚刚';
    if (d < HR) return Math.floor(d / MIN) + '分钟前';
    if (d < DAY) return Math.floor(d / HR) + '小时前';
    if (d < 2 * DAY) return '昨天';
    if (d < 7 * DAY) return Math.floor(d / DAY) + '天前';
    const dt = new Date(fromMs);
    return (dt.getMonth() + 1) + '/' + dt.getDate();
  };

  /** Stable non-negative hash of an id — picks a per-card accent so a bubble
   *  keeps the same colour every time the jar opens. */
  Jar.hashId = function (id) {
    id = String(id == null ? '' : id);
    let h = 5381;
    for (let i = 0; i < id.length; i++) h = (((h << 5) + h) + id.charCodeAt(i)) >>> 0;
    return h >>> 0;
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Jar;
  }
  global.JarLogic = Jar;
})(typeof window !== 'undefined' ? window : globalThis);
