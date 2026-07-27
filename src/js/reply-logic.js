/**
 * reply-logic.js — Pure guard against overflowing a bubble's reply thread.
 *
 * Every reply to a board bubble is appended to the parent answer document's
 * `replies` array, and persistReply() rewrites that WHOLE array on each reply
 * (see app.js). Uploaded photos/GIFs ride along inline as base64 data URLs
 * (~40KB per photo, up to ~670KB per uploaded GIF), and the bubble's own image
 * lives in the same document — so a busy, image-heavy thread creeps toward
 * Firestore's hard 1,048,576-byte (1 MiB) per-document limit. Past that point
 * the update throws, the reply is silently lost, and — because the whole array
 * is rewritten every time — even a tiny text reply then fails too.
 *
 * This module lets persistReply project the document's size with the new reply
 * included and refuse the write BEFORE Firestore rejects it, so the UI can show
 * an actionable message instead of a mystery "Reply failed". GIFs chosen from
 * the GIF picker are stored as short remote URLs (not base64), so steering
 * users there is the cheap way to keep replying.
 *
 * Browser global: ReplyLogic. CommonJS export for the Node unit tests.
 */
(function (global) {
  'use strict';

  const Reply = {};

  // Firestore caps a single document at 1,048,576 bytes. We stop well short of
  // that so there is headroom for the document-name, per-field overhead and the
  // slack between our JSON estimate and Firestore's own size accounting.
  Reply.ANSWER_DOC_BYTE_BUDGET = 900 * 1024; // ~921.6 KB

  /** UTF-8 byte length of a string (a multibyte char is >1 byte). */
  Reply.byteLength = function (str) {
    str = String(str == null ? '' : str);
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str).length;
    // Fallback for engines without TextEncoder.
    return unescape(encodeURIComponent(str)).length;
  };

  /**
   * Serialized UTF-8 byte size of a Firestore-shaped object. A safe, slightly
   * conservative proxy for the document size Firestore actually measures — the
   * dominant term for image threads is the base64 strings, which weigh the same
   * either way.
   */
  Reply.docByteSize = function (obj) {
    let json;
    try { json = JSON.stringify(obj); } catch (e) { return Infinity; }
    return Reply.byteLength(json == null ? '' : json);
  };

  /**
   * Would writing `replies` back onto this answer document push it past the
   * budget? `docData` is the current answer-doc data (its `replies` field is
   * ignored — `replies` is the candidate array that replaces it — but every
   * OTHER field, including the bubble's own inline image, still counts).
   * @param {object} docData      current answer-doc data
   * @param {Array}  replies      the reply tree AFTER appending the new reply
   * @param {number} [budget]     override byte budget (defaults to ANSWER_DOC_BYTE_BUDGET)
   * @returns {boolean}
   */
  Reply.wouldExceedBudget = function (docData, replies, budget) {
    const cap = typeof budget === 'number' ? budget : Reply.ANSWER_DOC_BYTE_BUDGET;
    const projected = Object.assign({}, docData || {}, { replies: replies || [] });
    return Reply.docByteSize(projected) > cap;
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Reply;
  }
  global.ReplyLogic = Reply;
})(typeof window !== 'undefined' ? window : globalThis);
