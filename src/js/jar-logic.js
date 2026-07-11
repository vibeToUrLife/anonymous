/**
 * jar-logic.js — Pure logic for the 泡泡罐 (bubble jar): a device-local
 * collection of favorite messages saved before their 6-hour expiry.
 *
 * Entries are small TEXT snapshots (images become a note, not data) so the
 * whole jar stays a few KB inside localStorage next to the board cache.
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

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Jar;
  }
  global.JarLogic = Jar;
})(typeof window !== 'undefined' ? window : globalThis);
