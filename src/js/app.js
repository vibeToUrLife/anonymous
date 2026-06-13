/* ═══════════════════════════════════════════
    Firebase config loaded from firebase-config.js
    ═══════════════════════════════════════════ */

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

/* ═══════════════════════════════════════════
    Google Auth Gate
    ═══════════════════════════════════════════ */
const loginOverlay = document.getElementById('loginOverlay');
const appContent   = document.getElementById('appContent');
const googleLoginBtn = document.getElementById('googleLoginBtn');
const loginError   = document.getElementById('loginError');

// Handle redirect result (fallback — fires on page load after redirect sign-in)
auth.getRedirectResult().catch((err) => {
    if (err.code) {
    loginError.textContent = 'Login failed: ' + (err.message || 'Unknown error');
    }
});

const provider = new firebase.auth.GoogleAuthProvider();

googleLoginBtn.addEventListener('click', async () => {
    googleLoginBtn.disabled = true;
    loginError.textContent = '';
    try {
    // Always try popup first — works on both desktop and mobile (opens new tab).
    // signInWithRedirect is broken on most mobile browsers due to
    // third-party cookie blocking in Safari/Chrome.
    await auth.signInWithPopup(provider);
    } catch (err) {
    if (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment') {
        // Popup blocked or unsupported — fall back to redirect
        try { await auth.signInWithRedirect(provider); } catch (e) {
        loginError.textContent = 'Login failed: ' + (e.message || 'Unknown error');
        }
    } else if (err.code !== 'auth/popup-closed-by-user') {
        loginError.textContent = 'Login failed: ' + (err.message || 'Unknown error');
    }
    } finally {
    googleLoginBtn.disabled = false;
    }
});

let _lastSeenInterval = null;
auth.onAuthStateChanged(async (user) => {
    loginOverlay.classList.remove('loading');
    if (user) {
    loginOverlay.classList.add('hidden');
    appContent.classList.add('visible');
    // Display name: Firestore rooms/{uid}.displayName is the source of truth so a
    // name changed on one device shows on all of them. localStorage is only a cache —
    // always reconcile it with the server value, never let a stale cache win.
    const cachedName = localStorage.getItem('flappy_custom_name_' + user.uid);
    let serverName = null, fetchOk = false;
    try {
        const roomDoc = await db.collection('rooms').doc(user.uid).get();
        fetchOk = true;
        if (roomDoc.exists && roomDoc.data().displayName) serverName = roomDoc.data().displayName;
    } catch (e) {}
    // Server value wins over the local cache; fall back to cache/auth/email only when unset.
    const displayName = serverName || cachedName || user.displayName || user.email?.split('@')[0] || 'Anonymous';
    localStorage.setItem('flappy_name', displayName);
    localStorage.setItem('flappy_custom_name_' + user.uid, displayName);
    // Only seed Firestore when we confirmed it has no name yet — never overwrite a
    // name set on another device, and never clobber on a failed/offline read.
    const roomUpdate = (fetchOk && !serverName)
        ? { displayName: displayName, lastSeen: Date.now() }
        : { lastSeen: Date.now() };
    db.collection('rooms').doc(user.uid).set(roomUpdate, { merge: true }).catch(() => {});
    // Heartbeat: update lastSeen every 2 min so others see you online
    if (_lastSeenInterval) clearInterval(_lastSeenInterval);
    _lastSeenInterval = setInterval(() => {
        if (document.hidden) return; // Skip when tab is hidden to reduce Firestore reads
        if (auth.currentUser) db.collection('rooms').doc(auth.currentUser.uid).update({ lastSeen: Date.now() }).catch(() => {});
    }, 120000);
    } else {
    loginOverlay.classList.remove('hidden');
    appContent.classList.remove('visible');
    if (_lastSeenInterval) { clearInterval(_lastSeenInterval); _lastSeenInterval = null; }
    }
});
window.addEventListener('beforeunload', () => {
    if (auth.currentUser) db.collection('rooms').doc(auth.currentUser.uid).update({ lastSeen: 0 }).catch(() => {});
});
// Enable Firestore offline persistence (IndexedDB cache)
db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
    if (err.code === 'failed-precondition') {
    console.warn('Firestore persistence unavailable: multiple tabs open');
    } else if (err.code === 'unimplemented') {
    console.warn('Firestore persistence not supported in this browser');
    }
});
const answersRef = db.collection('answers');
const foodRef    = db.collection('food_suggestions');
const spinResultRef = db.doc('app_state/spin_result');
const lbRef      = db.collection('leaderboard_flappy');
const roomsRef   = db.collection('rooms');

const SIX_HOURS = 6 * 60 * 60 * 1000;
const COLORS = 16;

// Simple hash for consistent pseudo-random assignment per bubble id
function hashId(id) {
    let h = 0;
    for (let i = 0; i < id.length; i++) {
        h = ((h << 5) - h + id.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
}

const wrap = document.getElementById('bubbleWrap');
const input = document.getElementById('answerInput');
const sendBtn = document.getElementById('sendBtn');
const toastEl = document.getElementById('toast');
const attachBtn = document.getElementById('attachBtn');
const imageInput = document.getElementById('imageInput');
const imgPreviewStrip = document.getElementById('imgPreviewStrip');
const imgPreviewThumb = document.getElementById('imgPreviewThumb');
const removePreview = document.getElementById('removePreview');
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightboxImg');
const ansAnonCheckbox = document.getElementById("ansCommentAnon");
let toastTimer = null;
let pendingImage = null;  // base64 string of compressed image
let suppressNextNotif = false; // suppress notification for self-sent messages
let suppressNextReplyNotif = false; // suppress notification for self-sent replies
let shouldScrollToBottom = true; // scroll to bottom on first load
let firstSnapshotFired = false; // track if real Firestore data arrived
let knownReplyCounts = {}; // track reply counts per bubble ID

/* ── Local cache helpers ── */
function cacheSet(key, data) {
    try { localStorage.setItem(key, JSON.stringify(data)); } catch {}
}
function cacheGet(key) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; }
}

/* ── Helpers ── */
function showToast(msg, type) {
    toastEl.textContent = msg;
    toastEl.className = 'toast ' + type + ' show';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2400);
}

function fmtRemaining(ms) {
    if (ms <= 0) return 'expiring…';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? h + 'h ' + m + 'm left' : m + 'm left';
}

/* ── Emoji reactions ── */
const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

function getStoredReaction(storageKey, itemId) {
    try {
    const all = JSON.parse(localStorage.getItem(storageKey) || '{}');
    const stored = all[itemId];
    if (Array.isArray(stored)) return stored[0] || null;
    return typeof stored === 'string' ? stored : null;
    } catch { return null; }
}
function saveStoredReaction(storageKey, itemId, emoji) {
    try {
    const all = JSON.parse(localStorage.getItem(storageKey) || '{}');
    if (emoji) all[itemId] = emoji;
    else delete all[itemId];
    localStorage.setItem(storageKey, JSON.stringify(all));
    } catch {}
}

// Track which reactions this browser has toggled: { docId: Set(['👍', ...]) }
function getMyReactions(docId) {
    return getStoredReaction('my_reactions', docId);
}
function saveMyReaction(docId, emoji) {
    saveStoredReaction('my_reactions', docId, emoji);
}
function getMyReplyReactions(replyKey) {
    return getStoredReaction('my_reply_reactions', replyKey);
}
function saveMyReplyReaction(replyKey, emoji) {
    saveStoredReaction('my_reply_reactions', replyKey, emoji);
}
function createReplyId() {
    return 'reply_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function getReplyKey(reply, replyIndex) {
    return reply.id || ('legacy:' + replyIndex + ':' + (reply.ts || 0));
}
function buildReplyPath(parentPath, reply, replyIndex) {
    return [...parentPath, getReplyKey(reply, replyIndex)];
}
function getReplyReactionStorageKey(docId, replyPath) {
    return docId + '::' + replyPath.join('>');
}
// Tracks which nested reply threads are currently expanded (by stable thread key)
// so they stay open across snapshot re-renders (after reacting or replying).
const _openReplyThreads = new Set();
function cloneRepliesTree(replies) {
    return (replies || []).map((reply) => {
    const nextReply = { ...reply };
    if (Array.isArray(reply.replies) && reply.replies.length) {
        nextReply.replies = cloneRepliesTree(reply.replies);
    } else {
        delete nextReply.replies;
    }
    return nextReply;
    });
}
function getReplyAtPath(replies, replyPath) {
    let currentReplies = replies;
    let currentReply = null;
    for (const segment of replyPath) {
    const replyIndex = currentReplies.findIndex((reply, index) => getReplyKey(reply, index) === segment);
    if (replyIndex === -1) return null;
    currentReply = currentReplies[replyIndex];
    currentReplies = Array.isArray(currentReply.replies) ? currentReply.replies : [];
    }
    return currentReply;
}
function countAllReplies(replies) {
    return (replies || []).reduce((total, reply) => total + 1 + countAllReplies(reply.replies || []), 0);
}
function getLatestReply(replies) {
    let latestReply = null;
    (replies || []).forEach((reply) => {
    if (!latestReply || (reply.ts || 0) > (latestReply.ts || 0)) latestReply = reply;
    const nestedLatest = getLatestReply(reply.replies || []);
    if (nestedLatest && (!latestReply || (nestedLatest.ts || 0) > (latestReply.ts || 0))) {
        latestReply = nestedLatest;
    }
    });
    return latestReply;
}
function toLiteReplies(replies) {
    return (replies || []).map((reply) => ({
    id: reply.id ?? null,
    name: reply.name ?? '',
    text: reply.text,
    ts: reply.ts,
    reactions: reply.reactions ?? {},
    replies: toLiteReplies(reply.replies || [])
    }));
}

async function toggleReaction(docId, emoji) {
    const mine = getMyReactions(docId);
    const nextEmoji = mine === emoji ? null : emoji;
    // Optimistic local update
    saveMyReaction(docId, nextEmoji);
    try {
    const updates = {};
    if (mine) updates['reactions.' + mine] = firebase.firestore.FieldValue.increment(-1);
    if (nextEmoji) updates['reactions.' + nextEmoji] = firebase.firestore.FieldValue.increment(1);
    await answersRef.doc(docId).update(updates);
    } catch {
    // Revert on failure
    saveMyReaction(docId, mine);
    showToast('Reaction failed', 'error');
    }
}

async function persistReply(docId, parentReplyPath, reply) {
    await db.runTransaction(async (tx) => {
    const ref = answersRef.doc(docId);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error('Reply target not found');

    const data = snap.data() || {};
    const replies = cloneRepliesTree(Array.isArray(data.replies) ? data.replies : []);

    if (parentReplyPath && parentReplyPath.length) {
        const parentReply = getReplyAtPath(replies, parentReplyPath);
        if (!parentReply) throw new Error('Reply target not found');
        if (!Array.isArray(parentReply.replies)) parentReply.replies = [];
        parentReply.replies.push(reply);
    } else {
        replies.push(reply);
    }

    tx.update(ref, { replies });
    });
}

async function toggleReplyReaction(docId, replyPath, emoji) {
    const storageKey = getReplyReactionStorageKey(docId, replyPath);
    const mine = getMyReplyReactions(storageKey);
    const nextEmoji = mine === emoji ? null : emoji;

    saveMyReplyReaction(storageKey, nextEmoji);
    try {
    await db.runTransaction(async (tx) => {
        const ref = answersRef.doc(docId);
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error('Reply not found');

        const data = snap.data() || {};
        const replies = cloneRepliesTree(Array.isArray(data.replies) ? data.replies : []);
        const reply = getReplyAtPath(replies, replyPath);
        if (!reply) throw new Error('Reply not found');
        const reactions = { ...(reply.reactions || {}) };
        if (mine) {
        const prevCount = Math.max(0, (reactions[mine] || 0) - 1);
        if (prevCount > 0) reactions[mine] = prevCount;
        else delete reactions[mine];
        }
        if (nextEmoji) {
        reactions[nextEmoji] = Math.max(0, (reactions[nextEmoji] || 0) + 1);
        }

        if (Object.keys(reactions).length) reply.reactions = reactions;
        else delete reply.reactions;

        tx.update(ref, { replies });
    });
    } catch {
    saveMyReplyReaction(storageKey, mine);
    showToast('Reaction failed', 'error');
    }
}

function buildReactionsRow(a) {
    const row = document.createElement('div');
    row.className = 'bubble-reactions';
    const mine = getMyReactions(a.id);

    // Show emojis that have counts > 0
    REACTION_EMOJIS.forEach(emoji => {
    const count = Math.max(0, (a.reactions && a.reactions[emoji]) || 0);
    if (count > 0 || mine === emoji) {
        const btn = document.createElement('button');
        btn.className = 'reaction-btn' + (mine === emoji ? ' reacted' : '');
        btn.innerHTML = '<span class="r-emoji">' + emoji + '</span><span class="r-count">' + (count || '') + '</span>';
        btn.addEventListener('click', (e) => { e.stopPropagation(); toggleReaction(a.id, emoji); });
        row.appendChild(btn);
    }
    });

    // "+" button to pick a new emoji
    const pickerWrap = document.createElement('div');
    pickerWrap.className = 'reaction-picker';
    const addBtn = document.createElement('button');
    addBtn.className = 'reaction-add';
    addBtn.textContent = '+';
    addBtn.title = 'React';

    const popup = document.createElement('div');
    popup.className = 'reaction-picker-popup';
    REACTION_EMOJIS.forEach(emoji => {
    const btn = document.createElement('button');
    btn.textContent = emoji;
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        popup.classList.remove('show');
        toggleReaction(a.id, emoji);
    });
    popup.appendChild(btn);
    });

    addBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    popup.classList.toggle('show');
    });

    // Close picker when clicking elsewhere
    document.addEventListener('click', () => popup.classList.remove('show'));

    pickerWrap.appendChild(addBtn);
    pickerWrap.appendChild(popup);
    row.appendChild(pickerWrap);

    return row;
}

function updateReactions(bubble, a) {
    const oldRow = bubble.querySelector('.bubble-reactions');
    if (!oldRow) return;
    const newRow = buildReactionsRow(a);
    oldRow.replaceWith(newRow);
}

function buildReplyReactionsRow(docId, reply, replyPath) {
    const row = document.createElement('div');
    row.className = 'bubble-reactions reply-reactions';
    const storageKey = getReplyReactionStorageKey(docId, replyPath);
    const mine = getMyReplyReactions(storageKey);

    REACTION_EMOJIS.forEach(emoji => {
    const count = Math.max(0, (reply.reactions && reply.reactions[emoji]) || 0);
    if (count > 0 || mine === emoji) {
        const btn = document.createElement('button');
        btn.className = 'reaction-btn reply-reaction-btn' + (mine === emoji ? ' reacted' : '');
        btn.innerHTML = '<span class="r-emoji">' + emoji + '</span><span class="r-count">' + (count || '') + '</span>';
        btn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleReplyReaction(docId, replyPath, emoji);
        });
        row.appendChild(btn);
    }
    });

    const pickerWrap = document.createElement('div');
    pickerWrap.className = 'reaction-picker reply-reaction-picker';
    const addBtn = document.createElement('button');
    addBtn.className = 'reaction-add reply-reaction-add';
    addBtn.textContent = '+';
    addBtn.title = 'React';

    const popup = document.createElement('div');
    popup.className = 'reaction-picker-popup reply-reaction-popup';
    REACTION_EMOJIS.forEach(emoji => {
    const btn = document.createElement('button');
    btn.textContent = emoji;
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        popup.classList.remove('show');
        toggleReplyReaction(docId, replyPath, emoji);
    });
    popup.appendChild(btn);
    });

    addBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    popup.classList.toggle('show');
    });

    document.addEventListener('click', () => popup.classList.remove('show'));

    pickerWrap.appendChild(addBtn);
    pickerWrap.appendChild(popup);
    row.appendChild(pickerWrap);

    return row;
}

/* ── Image compression (GIFs pass through as-is) ── */
const MAX_GIF_SIZE = 500 * 1024; // ~500KB (base64 → ~670KB, safe for Firestore 1MB limit)
function compressImage(file, maxW, maxH, quality) {
    // GIFs: skip canvas compression to preserve animation
    if (file.type === 'image/gif') {
    return new Promise((resolve, reject) => {
        if (file.size > MAX_GIF_SIZE) {
        reject(new Error('GIF too large (max 500KB). Try a smaller GIF'));
        return;
        }
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
    }
    maxW = maxW || 400;
    maxH = maxH || 400;
    quality = quality || 0.5;
    return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxW || h > maxH) {
            const ratio = Math.min(maxW / w, maxH / h);
            w = Math.round(w * ratio);
            h = Math.round(h * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = reject;
        img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
    });
}

/* ── Attach image handlers ── */
attachBtn.addEventListener('click', () => imageInput.click());
imageInput.addEventListener('change', async () => {
    const file = imageInput.files[0];
    if (!file) return;
    try {
    pendingImage = await compressImage(file);
    imgPreviewThumb.src = pendingImage;
    imgPreviewStrip.classList.add('show');
    } catch (err) {
    showToast(err.message || 'Failed to load image', 'error');
    }
    imageInput.value = '';
});
removePreview.addEventListener('click', () => {
    pendingImage = null;
    imgPreviewStrip.classList.remove('show');
});

/* ── Paste image from clipboard ── */
input.addEventListener('paste', async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
    if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) return;
        try {
        pendingImage = await compressImage(file);
        imgPreviewThumb.src = pendingImage;
        imgPreviewStrip.classList.add('show');
        } catch (err) {
        showToast(err.message || 'Failed to load pasted image', 'error');
        }
        return;
    }
    }
});

/* ── GIF Picker (Tenor API v2) ── */
const TENOR_KEY = 'AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ'; // Free Tenor/Google API key
const gifPickerEl = document.getElementById('gifPicker');
const gifGridEl = document.getElementById('gifGrid');
const gifSearchInput = document.getElementById('gifSearchInput');
const gifBtnEl = document.getElementById('gifBtn');
const gifCloseBtn = document.getElementById('gifPickerClose');

gifBtnEl.addEventListener('click', () => {
    gifPickerEl.classList.toggle('show');
    if (gifPickerEl.classList.contains('show')) {
    gifSearchInput.focus();
    if (!gifGridEl.querySelector('img')) loadTrendingGifs();
    }
});
gifCloseBtn.addEventListener('click', () => {
    gifPickerEl.classList.remove('show');
    _gifSelectCallback = null; // Clear reply context when picker is closed
});

let gifSearchTimer = null;
gifSearchInput.addEventListener('input', () => {
    clearTimeout(gifSearchTimer);
    gifSearchTimer = setTimeout(() => {
    const q = gifSearchInput.value.trim();
    if (q) searchGifs(q);
    else loadTrendingGifs();
    }, 400);
});

async function loadTrendingGifs() {
    gifGridEl.innerHTML = '<div class="gif-loading">Loading…</div>';
    try {
    const res = await fetch('https://tenor.googleapis.com/v2/featured?key=' + TENOR_KEY + '&limit=20&media_filter=tinygif');
    const data = await res.json();
    renderGifs(data.results || []);
    } catch {
    gifGridEl.innerHTML = '<div class="gif-loading">Failed to load GIFs</div>';
    }
}

async function searchGifs(query) {
    gifGridEl.innerHTML = '<div class="gif-loading">Searching…</div>';
    try {
    const res = await fetch('https://tenor.googleapis.com/v2/search?key=' + TENOR_KEY + '&q=' + encodeURIComponent(query) + '&limit=20&media_filter=tinygif');
    const data = await res.json();
    renderGifs(data.results || []);
    } catch {
    gifGridEl.innerHTML = '<div class="gif-loading">Search failed</div>';
    }
}

function renderGifs(results) {
    gifGridEl.innerHTML = '';
    if (!results.length) {
    gifGridEl.innerHTML = '<div class="gif-loading">No GIFs found</div>';
    return;
    }
    results.forEach(r => {
    const url = r.media_formats?.tinygif?.url;
    if (!url) return;
    const img = document.createElement('img');
    img.src = url;
    img.alt = r.content_description || 'GIF';
    img.loading = 'lazy';
    img.addEventListener('click', () => selectGif(url));
    gifGridEl.appendChild(img);
    });
}

// Callback for context-aware GIF selection (reply vs main input)
let _gifSelectCallback = null;

function selectGif(url) {
    if (_gifSelectCallback) {
        // GIF selected from a reply context
        _gifSelectCallback(url);
        _gifSelectCallback = null;
    } else {
        // Default: main input
        pendingImage = url;
        imgPreviewThumb.src = url;
        imgPreviewStrip.classList.add('show');
    }
    gifPickerEl.classList.remove('show');
    gifSearchInput.value = '';
}

/* ── Lightbox with pan & zoom ── */
let lbZoomed = false, lbScale = 1, lbX = 0, lbY = 0;
let lbDragging = false, lbStartX = 0, lbStartY = 0, lbStartTX = 0, lbStartTY = 0;

function lbUpdateTransform(animate) {
    lightboxImg.style.transition = animate ? 'transform 0.25s ease' : 'none';
    lightboxImg.style.transform = 'scale(' + lbScale + ') translate(' + lbX + 'px, ' + lbY + 'px)';
}

function lbClampPan() {
    if (lbScale <= 1) { lbX = 0; lbY = 0; return; }
    const rect = lightboxImg.getBoundingClientRect();
    const imgW = lightboxImg.naturalWidth ? Math.min(lightboxImg.clientWidth * lbScale, rect.width) : rect.width;
    const imgH = lightboxImg.naturalHeight ? Math.min(lightboxImg.clientHeight * lbScale, rect.height) : rect.height;
    const maxX = Math.max(0, (imgW - window.innerWidth) / (2 * lbScale));
    const maxY = Math.max(0, (imgH - window.innerHeight) / (2 * lbScale));
    lbX = Math.max(-maxX, Math.min(maxX, lbX));
    lbY = Math.max(-maxY, Math.min(maxY, lbY));
}

function lbReset() {
    lbZoomed = false; lbScale = 1; lbX = 0; lbY = 0;
    lightboxImg.classList.remove('zoomed', 'dragging');
    lbUpdateTransform(true);
}

function lbClose() {
    lbReset();
    lightbox.classList.remove('show');
}

lightbox.addEventListener('click', (e) => {
    if (e.target === lightboxImg) return;
    lbClose();
});
document.getElementById('lightboxClose').addEventListener('click', (e) => {
    e.stopPropagation();
    lbClose();
});

lightboxImg.addEventListener('click', (e) => {
    e.stopPropagation();
    if (lbDragging) return;
    if (lbZoomed) {
    lbReset();
    } else {
    lbZoomed = true; lbScale = 2; lbX = 0; lbY = 0;
    lightboxImg.classList.add('zoomed');
    lbUpdateTransform(true);
    }
});

// Drag (mouse)
lightboxImg.addEventListener('mousedown', (e) => {
    if (!lbZoomed) return;
    e.preventDefault();
    lbDragging = true;
    lbStartX = e.clientX; lbStartY = e.clientY;
    lbStartTX = lbX; lbStartTY = lbY;
    lightboxImg.classList.add('dragging');
});
window.addEventListener('mousemove', (e) => {
    if (!lbDragging) return;
    lbX = lbStartTX + (e.clientX - lbStartX) / lbScale;
    lbY = lbStartTY + (e.clientY - lbStartY) / lbScale;
    lbClampPan();
    lbUpdateTransform(false);
});
window.addEventListener('mouseup', () => {
    if (!lbDragging) return;
    lightboxImg.classList.remove('dragging');
    setTimeout(() => { lbDragging = false; }, 10);
});

// Drag (touch)
lightboxImg.addEventListener('touchstart', (e) => {
    if (!lbZoomed || e.touches.length !== 1) return;
    lbDragging = true;
    lbStartX = e.touches[0].clientX; lbStartY = e.touches[0].clientY;
    lbStartTX = lbX; lbStartTY = lbY;
    lightboxImg.classList.add('dragging');
}, { passive: true });
window.addEventListener('touchmove', (e) => {
    if (!lbDragging || e.touches.length !== 1) return;
    lbX = lbStartTX + (e.touches[0].clientX - lbStartX) / lbScale;
    lbY = lbStartTY + (e.touches[0].clientY - lbStartY) / lbScale;
    lbClampPan();
    lbUpdateTransform(false);
}, { passive: true });
window.addEventListener('touchend', () => {
    if (!lbDragging) return;
    lightboxImg.classList.remove('dragging');
    setTimeout(() => { lbDragging = false; }, 10);
});

// Scroll wheel zoom
lightbox.addEventListener('wheel', (e) => {
    if (!lightbox.classList.contains('show')) return;
    e.preventDefault();
    const zoomStep = 0.25;
    const prev = lbScale;
    lbScale += e.deltaY < 0 ? zoomStep : -zoomStep;
    lbScale = Math.max(1, Math.min(5, lbScale));
    if (lbScale <= 1) {
    lbZoomed = false; lbX = 0; lbY = 0;
    lightboxImg.classList.remove('zoomed');
    } else {
    lbZoomed = true;
    lightboxImg.classList.add('zoomed');
    // Adjust pan to keep zoom centered
    lbX = lbX * (lbScale / prev);
    lbY = lbY * (lbScale / prev);
    }
    lbClampPan();
    lbUpdateTransform(false);
}, { passive: false });

/* ── Poll creator ── */
const pollBtnEl = document.getElementById('pollBtn');
const pollCreator = document.getElementById('pollCreator');
const pollCreatorClose = document.getElementById('pollCreatorClose');
const pollQuestionInput = document.getElementById('pollQuestionInput');
const pollOptionsList = document.getElementById('pollOptionsList');
const pollAddOptionBtn = document.getElementById('pollAddOptionBtn');
const pollSubmitBtn = document.getElementById('pollSubmitBtn');

pollBtnEl.addEventListener('click', () => {
    pollCreator.classList.toggle('show');
    pollBtnEl.classList.toggle('active', pollCreator.classList.contains('show'));
    if (pollCreator.classList.contains('show')) pollQuestionInput.focus();
});
pollCreatorClose.addEventListener('click', () => {
    pollCreator.classList.remove('show');
    pollBtnEl.classList.remove('active');
});

pollAddOptionBtn.addEventListener('click', () => {
    const count = pollOptionsList.querySelectorAll('.poll-option-input').length;
    if (count >= 10) return showToast('Max 10 options', 'error');
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'poll-option-input';
    inp.placeholder = 'Option ' + (count + 1);
    inp.maxLength = 100;
    pollOptionsList.appendChild(inp);
    inp.focus();
});

pollSubmitBtn.addEventListener('click', async () => {
    const question = pollQuestionInput.value.trim();
    if (!question) return showToast('Enter a question', 'error');
    const inputs = pollOptionsList.querySelectorAll('.poll-option-input');
    const options = [];
    inputs.forEach(inp => {
        const v = inp.value.trim();
        if (v) options.push(v);
    });
    if (options.length < 2) return showToast('Add at least 2 options', 'error');
    pollSubmitBtn.disabled = true;
    try {
        suppressNextNotif = true;
        shouldScrollToBottom = true;
        await answersRef.add({
            ts: Date.now(),
            text: question,
            type: 'poll',
            pollOptions: options,
            pollVotes: {}
        });
        pollQuestionInput.value = '';
        inputs.forEach(inp => inp.value = '');
        // Reset to 2 inputs
        while (pollOptionsList.children.length > 2) pollOptionsList.lastChild.remove();
        pollCreator.classList.remove('show');
        pollBtnEl.classList.remove('active');
        showToast('Poll posted!', 'success');
    } catch {
        showToast('Failed to post poll', 'error');
    } finally {
        pollSubmitBtn.disabled = false;
    }
});

async function pollVote(docId, optionIndex) {
    const uid = auth.currentUser?.uid;
    if (!uid) return showToast('Sign in to vote', 'error');
    try {
        const doc = await answersRef.doc(docId).get();
        const votes = doc.data()?.pollVotes || {};
        if (votes[uid] === optionIndex) {
            // Cancel vote
            await answersRef.doc(docId).update({
                ['pollVotes.' + uid]: firebase.firestore.FieldValue.delete()
            });
        } else {
            await answersRef.doc(docId).update({
                ['pollVotes.' + uid]: optionIndex
            });
        }
    } catch {
        showToast('Vote failed', 'error');
    }
}

async function pollAddOption(docId, text) {
    if (!text || text.length > 100) return;
    try {
        await answersRef.doc(docId).update({
            pollOptions: firebase.firestore.FieldValue.arrayUnion(text)
        });
        showToast('Option added!', 'success');
    } catch {
        showToast('Failed to add option', 'error');
    }
}

function buildPollContent(a) {
    const container = document.createElement('div');
    container.className = 'poll-content';

    const q = document.createElement('div');
    q.className = 'poll-question';
    q.textContent = '📊 ' + (a.text || 'Poll');
    container.appendChild(q);

    const uid = auth.currentUser?.uid;
    const votes = a.pollVotes || {};
    const myVote = uid && votes[uid] !== undefined ? votes[uid] : -1;

    // Count votes per option
    const counts = {};
    let totalVotes = 0;
    Object.values(votes).forEach(idx => {
        counts[idx] = (counts[idx] || 0) + 1;
        totalVotes++;
    });

    const optionsWrap = document.createElement('div');
    optionsWrap.className = 'poll-options';

    (a.pollOptions || []).forEach((opt, i) => {
        const row = document.createElement('div');
        row.className = 'poll-option-row' + (myVote === i ? ' voted' : '');
        row.addEventListener('click', (e) => {
            e.stopPropagation();
            pollVote(a.id, i);
        });

        const count = counts[i] || 0;
        const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;

        const bar = document.createElement('div');
        bar.className = 'poll-option-bar';
        bar.style.width = pct + '%';
        row.appendChild(bar);

        if (myVote === i) {
            const check = document.createElement('span');
            check.className = 'poll-check';
            check.textContent = '✓';
            row.appendChild(check);
        }

        const text = document.createElement('span');
        text.className = 'poll-option-text';
        text.textContent = opt;
        row.appendChild(text);

        const countEl = document.createElement('span');
        countEl.className = 'poll-vote-count';
        countEl.textContent = count + (totalVotes > 0 ? ' (' + pct + '%)' : '');
        row.appendChild(countEl);

        optionsWrap.appendChild(row);
    });

    container.appendChild(optionsWrap);

    // Total votes
    const total = document.createElement('div');
    total.className = 'poll-total';
    total.textContent = totalVotes + ' vote' + (totalVotes !== 1 ? 's' : '');
    container.appendChild(total);

    // Add option row
    const addRow = document.createElement('div');
    addRow.className = 'poll-add-row';
    const addInput = document.createElement('input');
    addInput.type = 'text';
    addInput.placeholder = 'Add an option…';
    addInput.maxLength = 100;
    addInput.addEventListener('click', (e) => e.stopPropagation());
    const addBtn = document.createElement('button');
    addBtn.textContent = '+ Add';
    addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const val = addInput.value.trim();
        if (!val) return;
        if ((a.pollOptions || []).includes(val)) return showToast('Option already exists', 'error');
        pollAddOption(a.id, val);
        addInput.value = '';
    });
    addInput.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); addBtn.click(); }
    });
    addRow.appendChild(addInput);
    addRow.appendChild(addBtn);
    container.appendChild(addRow);

    return container;
}

/* ── Render bubbles ── */
let knownIds = new Set();

/* ── Bubble HP / pin status ── */
function hpInfo(a, now) {
    // A pinned (boosted) bubble survives until its pin expires — show the pin
    // time remaining instead of the normal 6-hour HP decay.
    if (a.boostUntil && a.boostUntil > now) {
    const mins = Math.ceil((a.boostUntil - now) / 60000);
    const label = mins >= 60 ? ('置顶 ' + Math.round(mins / 60) + 'h') : ('置顶 ' + mins + 'm');
    return { pct: 100, label: '📌 ' + label, color: '#f5b301' };
    }
    const pct = Math.max(0, Math.min(100, ((SIX_HOURS - (now - a.ts)) / SIX_HOURS) * 100));
    return { pct: pct, label: 'HP ' + Math.round(pct) + '%', color: pct > 50 ? '#58c5b5' : pct > 20 ? '#f2a154' : '#e06377' };
}

function render(items) {
    if (!items.length) {
    wrap.innerHTML =
        '<div class="empty-state"><span class="icon">💬</span>No answers yet — be the first!</div>';
    knownIds.clear();
    return;
    }

    const newIds = new Set(items.map(a => a.id));
    // Remove bubbles that no longer exist
    wrap.querySelectorAll('.bubble').forEach(el => {
    if (!newIds.has(el.dataset.id)) el.remove();
    });

    const now = Date.now();
    items.forEach((a, i) => {
    const existing = wrap.querySelector('[data-id="' + a.id + '"]');
    if (existing) {
        // Update HP bar, replies, and reactions
        const hpFill = existing.querySelector('.bubble-hp-fill');
        if (hpFill) {
        const hp = hpInfo(a, now);
        hpFill.style.width = hp.pct + '%';
        hpFill.style.background = hp.color;
        const hpLabel = existing.querySelector('.bubble-hp-label');
        if (hpLabel) hpLabel.textContent = hp.label;
        }
        // Keep awards (and who gave them) in sync as people stamp them.
        const awEl = existing.querySelector('.bubble-awards-row');
        if (awEl) {
        const next = awardsHtml(a);
        if (next && next !== awEl.textContent) {   // a new award just landed → pop
            awEl.classList.remove('award-pop'); void awEl.offsetWidth; awEl.classList.add('award-pop');
        }
        awEl.textContent = next;
        }
        const agEl = existing.querySelector('.bubble-award-givers');
        if (agEl) agEl.textContent = awardGiversHtml(a);
        // Update poll content live
        if (a.type === 'poll') {
        const oldPoll = existing.querySelector('.poll-content');
        if (oldPoll) oldPoll.replaceWith(buildPollContent(a));
        }
        updateReplies(existing, a);
        updateReactions(existing, a);
        return;
    }
    // New bubble — animate in
    const bubble = document.createElement('div');
    const h = hashId(a.id);
    const colorIdx = h % COLORS;
    const shapeIdx = (h >> 4) % 4;
    const sizeIdx = (h >> 6) % 3;
    const bobIdx = (h >> 8) % 4;
    const bobNames = ['bobbing','bobbing2','bobbing3','bobbing4'];
    const bobSpeeds = [5, 4.5, 6, 5.5];
    bubble.className = 'bubble c' + colorIdx + ' shape' + shapeIdx + ' sz' + sizeIdx;
    bubble.dataset.id = a.id;
    bubble.style.animationDelay = '0s, 0s';
    bubble.style.animationName = 'floatIn, ' + bobNames[bobIdx];
    bubble.style.animationDuration = '0.5s, ' + bobSpeeds[bobIdx] + 's';

    // Decorative emojis — 16 sets for variety
    const DECO_SETS = [
        ['✨','💫'],['🌸','💗'],['⭐','🌟'],['💜','🔮'],
        ['💎','🎀'],['🌈','☁️'],['🍬','🧁'],['🦋','🌺'],
        ['🍀','🌿'],['🎵','🎶'],['🌙','⭐'],['🧿','💠'],
        ['🔥','💥'],['🐚','🌊'],['🍂','🍁'],['❄️','💎']
    ];
    const decos = DECO_SETS[h % DECO_SETS.length];
    const decoCount = 2 + ((h >> 3) % 2);  // 2 or 3 decos
    const positions = [];
    for (let di = 0; di < decoCount; di++) {
        positions.push({
            side: ((h >> (di + 10)) & 1) ? 'left' : 'right',
            vert: ((h >> (di + 12)) & 1) ? 'top' : 'bottom'
        });
    }
    for (let di = 0; di < decoCount; di++) {
        const d = document.createElement('span');
        d.className = 'bubble-deco';
        d.textContent = decos[di % decos.length];
        const p = positions[di];
        d.style[p.vert] = (-6 + Math.random() * -6) + 'px';
        d.style[p.side] = (Math.random() * 60 + 5) + '%';
        d.style.animationDelay = (Math.random() * 3).toFixed(1) + 's';
        d.style.fontSize = (11 + Math.random() * 8) + 'px';
        bubble.appendChild(d);
    }

    // Name display
    if (a.name && a.name != '') {
        bubble.insertAdjacentHTML('beforeend', `
            <div><span class="answer-sender">${a.name || ''}</span></div>
        `);
    }
    // Apply the poster's equipped cosmetics (colour / frame / badge / title)
    applyBubbleCos(bubble, a);

    // Awards stamped on this bubble (🏆 etc.) — hidden via CSS when empty.
    const awardsRowEl = document.createElement('div');
    awardsRowEl.className = 'bubble-awards-row';
    awardsRowEl.textContent = awardsHtml(a);
    bubble.appendChild(awardsRowEl);

    const awardGiversEl = document.createElement('div');
    awardGiversEl.className = 'bubble-award-givers';
    awardGiversEl.textContent = awardGiversHtml(a);
    bubble.appendChild(awardGiversEl);

    // HP bar (game-style)
    const hpWrapper = document.createElement('div');
    hpWrapper.className = 'bubble-hp-wrapper';
    const hpLabel = document.createElement('span');
    hpLabel.className = 'bubble-hp-label';
    const hp = hpInfo(a, now);
    hpLabel.textContent = hp.label;
    const hpBar = document.createElement('div');
    hpBar.className = 'bubble-hp';
    const hpFill = document.createElement('div');
    hpFill.className = 'bubble-hp-fill';
    hpFill.style.width = hp.pct + '%';
    hpFill.style.background = hp.color;
    hpBar.appendChild(hpFill);
    hpWrapper.appendChild(hpLabel);
    hpWrapper.appendChild(hpBar);
    bubble.appendChild(hpWrapper);

    if (a.type === 'poll') {
        // Poll bubble — render poll UI instead of text/image
        bubble.appendChild(buildPollContent(a));
    } else {
        if (a.image) {
            const img = document.createElement('img');
            img.className = 'bubble-img';
            img.src = a.image;
            img.alt = 'image';
            img.addEventListener('click', (e) => {
            e.stopPropagation();
            lightboxImg.src = a.image;
            lightbox.classList.add('show');
            });
            bubble.appendChild(img);
        }

        const txt = document.createElement('span');
        safeTextWithBreaks(txt, a.text);
        bubble.appendChild(txt);
    }

    // Reactions row
    const reactionsRow = buildReactionsRow(a);
    bubble.appendChild(reactionsRow);

    const footer = document.createElement('div');
    footer.className = 'bubble-footer';

    const replyBtn = document.createElement('button');
    const replyCount = countAllReplies(a.replies);
    replyBtn.className = 'reply-toggle';
    replyBtn.textContent = '💬 Reply' + (replyCount ? ' (' + replyCount + ')' : '');
    // Store latest data on bubble for reply toggling
    bubble._replyData = a;
    replyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const container = bubble.querySelector('.replies-container');
        const latest = bubble._replyData || a;
        const latestReplyCount = countAllReplies(latest.replies);
        if (container) {
        container.remove();
        replyBtn.textContent = '💬 Reply' + (latestReplyCount ? ' (' + latestReplyCount + ')' : '');
        } else {
        openReplies(bubble, latest);
        }
    });
    footer.appendChild(replyBtn);

    // Pay-to-pin: anyone can spend coins to boost any bubble to the top.
    const boostBtn = document.createElement('button');
    boostBtn.className = 'boost-toggle';
    boostBtn.textContent = '⭐ 置顶';
    boostBtn.title = '花金币把这条留言置顶';
    boostBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof window.openBoost === 'function') window.openBoost(a.id);
    });
    footer.appendChild(boostBtn);

    // Pay-to-award: stamp an award (🏆/🌟/…) on any bubble.
    const awardBtn = document.createElement('button');
    awardBtn.className = 'boost-toggle award-toggle';
    awardBtn.textContent = '🏆 打赏';
    awardBtn.title = '花金币给这条留言一个奖章';
    awardBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof window.openAward === 'function') window.openAward(a.id);
    });
    footer.appendChild(awardBtn);

    bubble.appendChild(footer);

    wrap.appendChild(bubble);
    });
    knownIds = newIds;

    // Boosted (pinned) bubbles float to the top + get a highlight ribbon.
    items.forEach(a => {
    const el = wrap.querySelector('[data-id="' + a.id + '"]');
    if (!el) return;
    const boosted = a.boostUntil && a.boostUntil > now;
    el.classList.toggle('boosted', !!boosted);
    el.style.order = boosted ? '-1' : '';
    });

    // Auto-scroll to bottom on first load or after user sends a message
    if (shouldScrollToBottom) {
    // On cache render, scroll instantly but keep the flag for the Firestore render
    if (!firstSnapshotFired) {
        requestAnimationFrame(() => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' });
        });
    } else {
        // Firestore data arrived — final scroll, then clear flag
        shouldScrollToBottom = false;
        requestAnimationFrame(() => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        });
        // Safety: re-scroll after layout settles (images, etc.)
        setTimeout(() => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' });
        }, 600);
    }
    }
}

/* ── Apply a poster's equipped cosmetics to their bubble ── */
function applyBubbleCos(bubble, a) {
    const cos = a.cos;
    if (!cos) return;
    if (cos.f) bubble.classList.add('cos-frame-' + cos.f);   // bubble frame
    const senderEl = bubble.querySelector('.answer-sender');
    if (!senderEl) return;
    // Name colour — rainbow is an animated CSS class; others a plain colour.
    if (cos.c === 'rainbow') senderEl.classList.add('cos-name-rainbow');
    else if (cos.c) senderEl.style.color = cos.c;
    // Badge before the name.
    if (cos.b) {
    const badge = document.createElement('span');
    badge.className = 'cos-badge';
    badge.textContent = cos.b;
    senderEl.parentNode.insertBefore(badge, senderEl);
    }
    // Title after the name.
    if (cos.t) {
    const title = document.createElement('span');
    title.className = 'cos-title';
    title.textContent = cos.t;
    senderEl.parentNode.appendChild(title);
    }
}

/* ── Awards stamped on a bubble (🏆 etc.) ── */
function awardsHtml(a) {
    if (!a.awards || typeof CoinSpend === 'undefined') return '';
    const parts = [];
    Object.keys(a.awards).forEach(function (id) {
    const n = a.awards[id];
    if (!n) return;
    const aw = CoinSpend.getAward(id);
    if (aw) parts.push(aw.emoji + (n > 1 ? '×' + n : ''));
    });
    return parts.join(' ');
}

/* ── "who awarded this" line ── */
function awardGiversHtml(a) {
    if (!a.awardGivers || !a.awardGivers.length) return '';
    const names = [];
    a.awardGivers.forEach(function (g) {
    if (g && g.n && names.indexOf(g.n) === -1) names.push(g.n);
    });
    if (!names.length) return '';
    const shown = names.slice(0, 5).join('、');
    const extra = names.length > 5 ? ' 等' + names.length + '人' : '';
    return '🎉 ' + shown + extra + ' 打赏了';
}

/* ── Safe text with line-break rendering ── */
function safeTextWithBreaks(el, text) {
    if (!text) return;
    const escaped = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    el.innerHTML = escaped.replace(/\n/g, '<br>');
}

/* ── Reply helpers ── */
function fmtReplyTime(ts) {
    const d = new Date(ts);
    return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
}

function updateReplies(bubble, a) {
    // Always keep latest data on bubble so reopen works
    bubble._replyData = a;
    const container = bubble.querySelector('.replies-container');
    const replyCount = countAllReplies(a.replies);
    if (!container) {
    // Update reply count on the toggle button
    const btn = bubble.querySelector('.reply-toggle');
    if (btn) btn.textContent = '💬 Reply' + (replyCount ? ' (' + replyCount + ')' : '');
    return;
    }
    // Preserve user's in-progress text and pending image before re-rendering
    const oldInput = container.querySelector('.reply-input-root .reply-input-row input[type="text"]');
    const savedText = oldInput ? oldInput.value : '';
    const oldPreview = container.querySelector('.reply-input-root .reply-preview');
    const savedImage = oldPreview && oldPreview.style.display !== 'none'
    ? oldPreview.querySelector('img')?.src : null;

    // Re-render reply items only, keep input row
    const replyItems = container.querySelectorAll('.reply-item');
    replyItems.forEach(el => el.remove());
    const inputWrapper = container.querySelector('.reply-input-root');
    a.replies.forEach((r, replyIndex) => {
    container.insertBefore(buildReplyItem(a.id, r, buildReplyPath([], r, replyIndex), 0), inputWrapper);
    });

    // Restore user's in-progress text and pending image
    const newInput = container.querySelector('.reply-input-root .reply-input-row input[type="text"]');
    if (newInput && savedText) newInput.value = savedText;
    if (savedImage) {
    const newPreview = container.querySelector('.reply-input-root .reply-preview');
    const newPreviewImg = newPreview?.querySelector('img');
    if (newPreview && newPreviewImg) {
        newPreviewImg.src = savedImage;
        newPreview.style.display = 'flex';
    }
    }
    // Update button count
    const btn = bubble.querySelector('.reply-toggle');
    if (btn) btn.textContent = '💬 Reply' + (replyCount ? ' (' + replyCount + ')' : '');
}

function openReplies(bubble, a) {
    let container = bubble.querySelector('.replies-container');
    if (container) container.remove();
    container = document.createElement('div');
    container.className = 'replies-container';
    a.replies.forEach((r, replyIndex) => {
    container.appendChild(buildReplyItem(a.id, r, buildReplyPath([], r, replyIndex), 0));
    });
    container.appendChild(buildReplyInput(a.id));
    bubble.appendChild(container);
}

function buildReplyItem(docId, r, replyPath, depth) {
    const div = document.createElement('div');
    div.className = 'reply-item' + (depth > 0 ? ' is-nested' : '');
    if (r.image) {
    const img = document.createElement('img');
    img.className = 'reply-img';
    img.src = r.image;
    img.alt = 'reply image';
    img.addEventListener('click', (e) => {
        e.stopPropagation();
        lightboxImg.src = r.image;
        lightbox.classList.add('show');
    });
    div.appendChild(img);
    }
    // Show sender name if reply was posted non-anonymously
    if (r.name) {
    const name = document.createElement('span');
    name.className = 'reply-sender';
    name.textContent = r.name + ':';
    div.appendChild(name);
    }
    if (r.text) {
    const txt = document.createElement('span');
    safeTextWithBreaks(txt, r.text);
    div.appendChild(txt);
    }
    const time = document.createElement('span');
    time.className = 'reply-time';
    time.textContent = fmtReplyTime(r.ts);
    div.appendChild(time);

    div.appendChild(buildReplyReactionsRow(docId, r, replyPath));

    const childReplies = Array.isArray(r.replies) ? r.replies : [];
    if (depth < 1) {
    const actions = document.createElement('div');
    const childCount = countAllReplies(childReplies);
    actions.className = 'reply-actions';

    const childrenWrap = document.createElement('div');
    childrenWrap.className = 'reply-children';
    childReplies.forEach((childReply, childIndex) => {
        childrenWrap.appendChild(buildReplyItem(docId, childReply, buildReplyPath(replyPath, childReply, childIndex), depth + 1));
    });

    // Stable key for this thread so its open/closed state survives re-renders
    // (e.g. after reacting or posting a nested reply). Without this the thread
    // would collapse every time the snapshot re-renders the reply list.
    const threadKey = getReplyReactionStorageKey(docId, replyPath);
    let threadBtn = null;
    function setChildrenOpen(open) {
        childrenWrap.classList.toggle('open', open);
        if (open) _openReplyThreads.add(threadKey);
        else _openReplyThreads.delete(threadKey);
        if (threadBtn) {
        threadBtn.textContent = (open ? 'Hide thread' : 'Show thread') + ' (' + childCount + ')';
        }
    }

    if (childCount) {
        threadBtn = document.createElement('button');
        threadBtn.className = 'reply-to-reply-toggle';
        setChildrenOpen(_openReplyThreads.has(threadKey));
        threadBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const willOpen = !childrenWrap.classList.contains('open');
        if (!willOpen) {
            const existingInput = childrenWrap.querySelector('.nested-reply-input');
            if (existingInput) existingInput.remove();
            replyBtn.textContent = '↪ Reply';
        }
        setChildrenOpen(willOpen);
        });
        actions.appendChild(threadBtn);
    }

    const replyBtn = document.createElement('button');
    replyBtn.className = 'reply-to-reply-toggle';
    replyBtn.textContent = '↪ Reply';
    actions.appendChild(replyBtn);
    div.appendChild(actions);
    replyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const existingInput = childrenWrap.querySelector('.nested-reply-input');
        if (existingInput) {
        existingInput.remove();
        replyBtn.textContent = '↪ Reply';
        if (!childCount) setChildrenOpen(false);
        } else {
        setChildrenOpen(true);
        childrenWrap.appendChild(buildReplyInput(docId, replyPath, depth + 1));
        replyBtn.textContent = '↪ Cancel';
        }
    });

    div.appendChild(childrenWrap);
    }

    return div;
}

function buildReplyInput(docId, parentReplyPath, depth) {
    const wrapper = document.createElement('div');
    wrapper.className = parentReplyPath && parentReplyPath.length ? 'nested-reply-input' : 'reply-input-root';
    const row = document.createElement('div');
    row.className = 'reply-input-row';
    let replyPendingImage = null;

    // Attach button
    const attachBtn = document.createElement('button');
    attachBtn.className = 'reply-attach';
    attachBtn.textContent = '📷';
    attachBtn.title = 'Attach image';
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    attachBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });

    // Preview area
    const preview = document.createElement('div');
    preview.className = 'reply-preview';
    preview.style.display = 'none';
    const previewImg = document.createElement('img');
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-reply-img';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    replyPendingImage = null;
    preview.style.display = 'none';
    });
    preview.appendChild(previewImg);
    preview.appendChild(removeBtn);

    fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
        replyPendingImage = await compressImage(file);
        previewImg.src = replyPendingImage;
        preview.style.display = 'flex';
    } catch {
        showToast('Failed to load image', 'error');
    }
    fileInput.value = '';
    });

    // GIF button for reply
    const gifReplyBtn = document.createElement('button');
    gifReplyBtn.className = 'reply-attach';
    gifReplyBtn.textContent = 'GIF';
    gifReplyBtn.title = 'Search GIFs';
    gifReplyBtn.style.fontSize = '10px';
    gifReplyBtn.style.fontWeight = '800';
    gifReplyBtn.style.letterSpacing = '-0.5px';
    gifReplyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Set callback so the global GIF picker sends the result to this reply
        _gifSelectCallback = (url) => {
            replyPendingImage = url;
            previewImg.src = url;
            preview.style.display = 'flex';
        };
        gifPickerEl.classList.add('show');
        gifSearchInput.focus();
        if (!gifGridEl.querySelector('img')) loadTrendingGifs();
    });

    const inp = document.createElement('input');
    inp.type = 'text';
    inp.placeholder = 'Write a reply…';
    inp.maxLength = 300;

    // Paste image into reply
    inp.addEventListener('paste', async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
        if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) return;
        try {
            replyPendingImage = await compressImage(file);
            previewImg.src = replyPendingImage;
            preview.style.display = 'flex';
        } catch (err) {
            showToast(err.message || 'Failed to load pasted image', 'error');
        }
        return;
        }
    }
    });

    const btn = document.createElement('button');
    btn.className = 'reply-send-btn';
    btn.textContent = '➤';
    const doSend = async () => {
    const text = inp.value.trim();
    if (!text && !replyPendingImage) return;
    btn.disabled = true;
    try {
        const reply = { id: createReplyId(), ts: Date.now() };
        if (text) reply.text = text;
        if (replyPendingImage) reply.image = replyPendingImage;
        // Include sender name when user chooses non-anonymous
        if (!anonCheckbox.checked) {
            const senderName = localStorage.getItem('flappy_name') || auth.currentUser?.displayName || 'User';
            reply.name = senderName;
        }
        suppressNextReplyNotif = true;
        await persistReply(docId, parentReplyPath, reply);
        inp.value = '';
        replyPendingImage = null;
        preview.style.display = 'none';
    } catch {
        showToast('Reply failed', 'error');
    } finally {
        btn.disabled = false;
    }
    };
    btn.addEventListener('click', (e) => { e.stopPropagation(); doSend(); });
    inp.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); doSend(); }
    });
    inp.addEventListener('click', (e) => e.stopPropagation());
    // Anonymous checkbox tick (inline, beside input) — remember last choice
    const anonLabel = document.createElement('label');
    anonLabel.className = 'reply-anon-toggle';
    anonLabel.title = 'Reply anonymously';
    anonLabel.addEventListener('click', (e) => e.stopPropagation());
    const anonCheckbox = document.createElement('input');
    anonCheckbox.type = 'checkbox';
    // Restore last preference; default is anonymous (true)
    anonCheckbox.checked = localStorage.getItem('reply_anon_pref') !== 'false';
    const anonIcon = document.createElement('span');
    anonIcon.className = 'reply-anon-icon';
    anonIcon.textContent = '🕶️';
    anonLabel.appendChild(anonCheckbox);
    anonLabel.appendChild(anonIcon);
    // Persist preference when toggled
    anonCheckbox.addEventListener('change', (e) => {
        e.stopPropagation();
        localStorage.setItem('reply_anon_pref', anonCheckbox.checked ? 'true' : 'false');
    });

    ansAnonCheckbox.checked = localStorage.getItem('ans_anon_pref') !== 'false';
    // Persist preference when toggled
    ansAnonCheckbox.addEventListener('change', (e) => {
        e.stopPropagation();
        localStorage.setItem('ans_anon_pref', ansAnonCheckbox.checked ? 'true' : 'false');
    });

    if (depth > 0) {
    row.classList.add('reply-input-row-nested');
    inp.classList.add('reply-input-field-nested');
    btn.classList.add('reply-send-btn-nested');
    anonLabel.classList.add('reply-anon-toggle-nested');
    }
    row.appendChild(fileInput);
    row.appendChild(attachBtn);
    row.appendChild(gifReplyBtn);
    row.appendChild(inp);
    row.appendChild(anonLabel);
    row.appendChild(btn);
    wrapper.appendChild(row);
    wrapper.appendChild(preview);
    return wrapper;
}

/* ── (Bubble real-time listener is below, after sidebar setup) ── */

/* ── Submit answer to Firestore ── */
async function submit() {
    const text = input.value.trim();
    if (!text && !pendingImage) return;
    if (text.length > 500) {
    showToast('Max 500 characters', 'error');
    return;
    }

    sendBtn.disabled = true;
    try {
    const doc = { ts: Date.now() };
    if (text) doc.text = text;
    if (pendingImage) doc.image = pendingImage;
    if (!ansAnonCheckbox.checked) {
        doc.name = localStorage.getItem('flappy_name') || auth.currentUser?.displayName || 'User';
        // Stamp the poster's equipped bubble cosmetics so everyone can render them
        // (the board is anonymous, so we can't look them up from the viewer side).
        if (typeof getEquippedCos === 'function') {
            const cos = getEquippedCos();
            if (cos) doc.cos = cos;
        }
    }
    suppressNextNotif = true;
    shouldScrollToBottom = true;
    const docRef = await answersRef.add(doc);
    input.value = '';
    pendingImage = null;
    imgPreviewStrip.classList.remove('show');
    showToast('Answer sent!', 'success');
    input.focus();
    } catch {
    showToast('Failed to send — try again', 'error');
    } finally {
    sendBtn.disabled = false;
    }
}

sendBtn.addEventListener('click', submit);
input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    submit();
    }
});

/* ═══════════════════════════════════════════
    Sidebar toggle
    ═══════════════════════════════════════════ */
const sidebar      = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const sidebarToggle  = document.getElementById('sidebarToggle');

function toggleSidebar() {
    const open = sidebar.classList.toggle('open');
    sidebarOverlay.classList.toggle('show', open);
    document.body.classList.toggle('sidebar-open', open);
}
sidebarToggle.addEventListener('click', toggleSidebar);
sidebarOverlay.addEventListener('click', toggleSidebar);

/* ── Food & Vote collapse toggle ── */
const foodVoteToggle = document.getElementById('foodVoteToggle');
const foodVoteBody   = document.getElementById('foodVoteBody');
const foodVoteArrow  = document.getElementById('foodVoteArrow');
let foodVoteOpen = localStorage.getItem('foodVoteOpen') === '1'; // default closed
function applyFoodVoteCollapse(animate) {
    foodVoteArrow.style.transform = foodVoteOpen ? 'rotate(0deg)' : 'rotate(-90deg)';
    foodVoteToggle.style.background = foodVoteOpen ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.04)';
    if (!animate) {
    foodVoteBody.style.display = foodVoteOpen ? '' : 'none';
    return;
    }
    if (foodVoteOpen) {
    // Expand
    foodVoteBody.style.display = '';
    foodVoteBody.style.overflow = 'hidden';
    const h = foodVoteBody.scrollHeight;
    foodVoteBody.style.maxHeight = '0px';
    foodVoteBody.style.opacity = '0';
    requestAnimationFrame(() => {
        foodVoteBody.style.transition = 'max-height 0.3s ease, opacity 0.25s ease';
        foodVoteBody.style.maxHeight = h + 'px';
        foodVoteBody.style.opacity = '1';
        setTimeout(() => {
        foodVoteBody.style.maxHeight = '';
        foodVoteBody.style.overflow = '';
        foodVoteBody.style.transition = '';
        }, 320);
    });
    } else {
    // Collapse
    const h = foodVoteBody.scrollHeight;
    foodVoteBody.style.maxHeight = h + 'px';
    foodVoteBody.style.overflow = 'hidden';
    requestAnimationFrame(() => {
        foodVoteBody.style.transition = 'max-height 0.3s ease, opacity 0.2s ease';
        foodVoteBody.style.maxHeight = '0px';
        foodVoteBody.style.opacity = '0';
        setTimeout(() => {
        foodVoteBody.style.display = 'none';
        foodVoteBody.style.maxHeight = '';
        foodVoteBody.style.overflow = '';
        foodVoteBody.style.opacity = '';
        foodVoteBody.style.transition = '';
        }, 320);
    });
    }
}
applyFoodVoteCollapse(false);
foodVoteToggle.addEventListener('click', () => {
    foodVoteOpen = !foodVoteOpen;
    localStorage.setItem('foodVoteOpen', foodVoteOpen ? '1' : '0');
    applyFoodVoteCollapse(true);
});

/* ── Mini Games collapse toggle ── */
const miniGamesToggle = document.getElementById('miniGamesToggle');
const miniGamesBody   = document.getElementById('miniGamesBody');
const miniGamesArrow  = document.getElementById('miniGamesArrow');
let miniGamesOpen = localStorage.getItem('miniGamesOpen') !== '0'; // default open
function applyMiniGamesCollapse(animate) {
    miniGamesArrow.style.transform = miniGamesOpen ? 'rotate(0deg)' : 'rotate(-90deg)';
    miniGamesToggle.style.background = miniGamesOpen ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.04)';
    if (!animate) {
    miniGamesBody.style.display = miniGamesOpen ? '' : 'none';
    return;
    }
    if (miniGamesOpen) {
    miniGamesBody.style.display = '';
    miniGamesBody.style.overflow = 'hidden';
    const h = miniGamesBody.scrollHeight;
    miniGamesBody.style.maxHeight = '0px';
    miniGamesBody.style.opacity = '0';
    requestAnimationFrame(() => {
        miniGamesBody.style.transition = 'max-height 0.3s ease, opacity 0.25s ease';
        miniGamesBody.style.maxHeight = h + 'px';
        miniGamesBody.style.opacity = '1';
        setTimeout(() => { miniGamesBody.style.maxHeight = ''; miniGamesBody.style.overflow = ''; miniGamesBody.style.transition = ''; }, 320);
    });
    } else {
    const h = miniGamesBody.scrollHeight;
    miniGamesBody.style.maxHeight = h + 'px';
    miniGamesBody.style.overflow = 'hidden';
    requestAnimationFrame(() => {
        miniGamesBody.style.transition = 'max-height 0.3s ease, opacity 0.2s ease';
        miniGamesBody.style.maxHeight = '0px';
        miniGamesBody.style.opacity = '0';
        setTimeout(() => { miniGamesBody.style.display = 'none'; miniGamesBody.style.maxHeight = ''; miniGamesBody.style.overflow = ''; miniGamesBody.style.opacity = ''; miniGamesBody.style.transition = ''; }, 320);
    });
    }
}
applyMiniGamesCollapse(false);
miniGamesToggle.addEventListener('click', () => {
    miniGamesOpen = !miniGamesOpen;
    localStorage.setItem('miniGamesOpen', miniGamesOpen ? '1' : '0');
    applyMiniGamesCollapse(true);
});

/* ═══════════════════════════════════════════
    Food suggestion system (separate collection)
    ═══════════════════════════════════════════ */
const voteListEl   = document.getElementById('voteList');
const randomBtn    = document.getElementById('randomBtn');
const randomResult = document.getElementById('randomResult');
const foodInput    = document.getElementById('foodInput');
const addFoodBtn   = document.getElementById('addFoodBtn');
const resetInfoEl  = document.getElementById('resetInfo');

// Track which food docs this browser already voted on
function getVotedSet() {
    try {
    return new Set(JSON.parse(localStorage.getItem('food_voted') ?? '[]'));
    } catch { return new Set(); }
}
function saveVotedSet(set) {
    localStorage.setItem('food_voted', JSON.stringify([...set]));
}

let foodItems = [];   // kept in sync by the food onSnapshot listener

/* ── Add food suggestion ── */
async function addFood() {
    const text = foodInput.value.trim();
    if (!text) return;
    if (text.length > 100) {
    showToast('Max 100 characters', 'error');
    return;
    }
    addFoodBtn.disabled = true;
    try {
    await foodRef.add({ text, ts: Date.now(), votes: 0 });
    foodInput.value = '';
    showToast('Food added!', 'success');
    } catch {
    showToast('Failed to add — try again', 'error');
    } finally {
    addFoodBtn.disabled = false;
    }
}
addFoodBtn.addEventListener('click', addFood);
foodInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addFood(); }
});

/* ── Render vote list ── */
function renderVoteList() {
    const voted = getVotedSet();
    const activeFood = foodItems.filter(f => !f.removed);
    if (!activeFood.length) {
    voteListEl.innerHTML = '<li class="vote-empty">No suggestions yet</li>';
    return;
    }

    const sorted = [...activeFood].sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0));
    voteListEl.innerHTML = '';
    sorted.forEach((item) => {
    const li = document.createElement('li');
    li.className = 'vote-item';

    const txt = document.createElement('span');
    txt.className = 'vote-text';
    txt.textContent = item.text;

    const count = document.createElement('span');
    count.className = 'vote-count';
    count.textContent = Math.max(0, item.votes ?? 0);

    const btn = document.createElement('button');
    btn.className = 'vote-btn' + (voted.has(item.id) ? ' voted' : '');
    btn.innerHTML = voted.has(item.id) ? '&#9989;' : '&#128077;';
    btn.addEventListener('click', () => castVote(item.id));

    const actions = document.createElement('div');
    actions.className = 'vote-actions';

    const delBtn = document.createElement('button');
    delBtn.className = 'vote-action del';
    delBtn.innerHTML = '&#128465;';
    delBtn.title = 'Delete';
    delBtn.addEventListener('click', () => deleteFood(item.id, item.text));

    actions.append(delBtn);
    li.append(txt, count, btn, actions);
    voteListEl.appendChild(li);
    });
}

async function castVote(docId) {
    const voted = getVotedSet();
    const alreadyVoted = voted.has(docId);

    // If "undoing" but Firestore votes is already 0, just clear local state
    if (alreadyVoted) {
    const item = foodItems.find(f => f.id === docId);
    if (item && (item.votes ?? 0) <= 0) {
        voted.delete(docId);
        saveVotedSet(voted);
        renderVoteList();
        return;
    }
    }

    // Update localStorage FIRST so onSnapshot render picks up the new state
    if (alreadyVoted) {
    voted.delete(docId);
    } else {
    voted.add(docId);
    }
    saveVotedSet(voted);
    renderVoteList();

    try {
    await foodRef.doc(docId).update({
        votes: firebase.firestore.FieldValue.increment(alreadyVoted ? -1 : 1)
    });
    showToast(alreadyVoted ? 'Vote removed' : 'Vote counted!', 'success');
    } catch {
    // Revert localStorage on failure
    if (alreadyVoted) {
        voted.add(docId);
    } else {
        voted.delete(docId);
    }
    saveVotedSet(voted);
    renderVoteList();
    showToast('Vote failed — try again', 'error');
    }
}

/* ── Delete food ── */
async function deleteFood(docId, name) {
    if (!confirm('Delete "' + name + '" from the list?')) return;
    try {
    await foodRef.doc(docId).delete();
    showToast('Deleted!', 'success');
    } catch {
    showToast('Delete failed', 'error');
    }
}

/* ═══════════════════════════════════════════
    Random pick (slot-machine style)
    ═══════════════════════════════════════════ */
const spinActions   = document.getElementById('spinActions');
const spinRemoveBtn = document.getElementById('spinRemoveBtn');
const restoreBtn    = document.getElementById('restoreBtn');
let lastSpinDocId   = null;

randomBtn.addEventListener('click', () => {
    // Only spin on active (non-removed) items
    const active = foodItems.filter(f => !f.removed);
    if (!active.length) {
    randomResult.textContent = 'No food to spin!';
    return;
    }
    randomBtn.disabled = true;
    spinActions.classList.remove('show');
    randomResult.classList.add('spinning');
    randomResult.classList.remove('winner');
    lastSpinDocId = null;
    let ticks = 0;
    const totalTicks = 18 + Math.floor(Math.random() * 8);
    let picked;
    let currentDelay = 50;
    function tick() {
    picked = active[Math.floor(Math.random() * active.length)];
    randomResult.textContent = picked.text;
    ticks++;
    if (ticks >= totalTicks) {
        randomResult.classList.remove('spinning');
        randomResult.classList.add('winner');
        randomResult.textContent = '\uD83C\uDF7D\uFE0F ' + picked.text + ' \uD83C\uDF89';
        lastSpinDocId = picked.id;
        spinActions.classList.add('show');
        randomBtn.disabled = false;
        // Show result popup
        const overlay = document.getElementById('spinResultOverlay');
        document.getElementById('spinResultFood').textContent = picked.text;
        overlay.classList.remove('hidden');
        // Sync result to Firestore so all users see it
        spinResultRef.set({ text: picked.text, foodId: picked.id, ts: Date.now() }).catch(() => {});
    } else {
        // Slow down gradually near the end
        if (ticks > totalTicks - 6) {
        currentDelay += 40;
        }
        setTimeout(tick, currentDelay);
    }
    }
    setTimeout(tick, currentDelay);
});

// Remove the spun food
spinRemoveBtn.addEventListener('click', async () => {
    if (!lastSpinDocId) return;
    try {
    await foodRef.doc(lastSpinDocId).update({ removed: true });
    // Clear shared spin result so all users see the removal
    await spinResultRef.set({ text: null, foodId: null, ts: Date.now() }).catch(() => {});
    showToast('Removed from list!', 'success');
    } catch {
    showToast('Remove failed', 'error');
    }
    spinActions.classList.remove('show');
    randomResult.textContent = 'Spin again!';
    lastSpinDocId = null;
});

// Restore all removed food
restoreBtn.addEventListener('click', async () => {
    const removed = foodItems.filter(f => f.removed);
    if (!removed.length) return;
    try {
    const batch = db.batch();
    removed.forEach(f => batch.update(foodRef.doc(f.id), { removed: false }));
    await batch.commit();
    showToast('All removed food restored!', 'success');
    } catch {
    showToast('Restore failed', 'error');
    }
});

// Show/hide restore button based on whether removed items exist
function updateRestoreBtn() {
    const hasRemoved = foodItems.some(f => f.removed);
    restoreBtn.classList.toggle('show', hasRemoved);
}

// Spin result popup close
document.getElementById('spinResultClose').addEventListener('click', () => {
    document.getElementById('spinResultOverlay').classList.add('hidden');
});
document.getElementById('spinResultOverlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
});

// Listen for shared spin result so all users see it in real-time
spinResultRef.onSnapshot((snap) => {
    if (!snap.exists) return;
    const d = snap.data();
    if (d.text) {
    randomResult.textContent = '\uD83C\uDF7D\uFE0F ' + d.text + ' \uD83C\uDF89';
    } else {
    randomResult.textContent = 'Spin again!';
    spinActions.classList.remove('show');
    }
});

/* ═══════════════════════════════════════════
    Notifications — browser push + tab badge
    ═══════════════════════════════════════════ */
const settingsBtn = document.getElementById('settingsBtn');
const settingsOverlay = document.getElementById('settingsOverlay');
const notifToggle = document.getElementById('notifToggle');
const soundToggle = document.getElementById('soundToggle');
const themeToggle = document.getElementById('themeToggle');
const animToggle = document.getElementById('animToggle');
const notifBadge = document.getElementById('notifBadge');
const originalTitle = document.title;
let notifEnabled = localStorage.getItem('notif_enabled') === '1';
let soundEnabled = localStorage.getItem('sound_enabled') !== '0'; // on by default
let isFirstSnapshot = true;
let unseenCount = 0;
let titleFlashInterval = null;

// Restore saved preferences on load (default = light unless explicitly 'dark')
document.body.classList.toggle('light-theme', localStorage.getItem('theme') !== 'dark');
const savedFont = localStorage.getItem('font_size') || 'medium';
document.body.classList.add('font-' + savedFont);
if (localStorage.getItem('animations') === '0') document.body.classList.add('no-animations');

// Notification sound using Web Audio API (no external file needed)
let audioCtx = null;
function ensureAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
}
function playNotifSound() {
    try {
    const ctx = ensureAudioCtx();
    [0, 0.15].forEach((delay, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = i === 0 ? 660 : 880;
        gain.gain.setValueAtTime(0.18, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.25);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + 0.25);
    });
    } catch {}
}

function unlockAudio() {
    ensureAudioCtx();
    document.removeEventListener('touchstart', unlockAudio);
    document.removeEventListener('click', unlockAudio);
}
document.addEventListener('touchstart', unlockAudio, { once: true });
document.addEventListener('click', unlockAudio, { once: true });

// Settings modal open/close
const settingsNameInput = document.getElementById('settingsNameInput');
const settingsNameSaveBtn = document.getElementById('settingsNameSaveBtn');
const settingsNameStatus = document.getElementById('settingsNameStatus');

settingsBtn.addEventListener('click', () => {
    notifToggle.checked = notifEnabled;
    soundToggle.checked = soundEnabled;
    themeToggle.checked = (window.Theme ? Theme.getTheme() : (localStorage.getItem('theme') === 'dark' ? 'dark' : 'light')) === 'light';
    animToggle.checked = !document.body.classList.contains('no-animations');
    settingsNameInput.value = (auth.currentUser ? localStorage.getItem('flappy_custom_name_' + auth.currentUser.uid) : null) || auth.currentUser?.displayName || '';
    settingsNameStatus.textContent = '';
    updateFontSizeBtns();
    settingsOverlay.classList.remove('hidden');
});
document.getElementById('settingsCloseBtn').addEventListener('click', () => {
    settingsOverlay.classList.add('hidden');
});
settingsOverlay.addEventListener('click', (e) => {
    if (e.target === settingsOverlay) settingsOverlay.classList.add('hidden');
});

// Logout
document.getElementById('settingsLogoutBtn').addEventListener('click', async () => {
    settingsOverlay.classList.add('hidden');
    try { await auth.signOut(); } catch (e) { console.error('Logout error:', e); }
});

// Name change
settingsNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') settingsNameSaveBtn.click();
    if (e.key === 'Escape') settingsOverlay.classList.add('hidden');
});

settingsNameSaveBtn.addEventListener('click', async () => {
    const newName = settingsNameInput.value.trim();
    if (!newName || newName.length > 20) {
    settingsNameStatus.style.color = '#f87171';
    settingsNameStatus.textContent = 'Name must be 1-20 characters';
    return;
    }
    const uid = auth.currentUser?.uid;
    const oldName = (uid ? localStorage.getItem('flappy_custom_name_' + uid) : null) || localStorage.getItem('flappy_name') || '';
    if (newName === oldName) {
    settingsOverlay.classList.add('hidden');
    return;
    }
    settingsNameSaveBtn.disabled = true;
    settingsNameStatus.style.color = 'rgba(255,255,255,0.4)';
    settingsNameStatus.textContent = 'Saving\u2026';
    try {
    // Migrate flappy leaderboard entry
    if (oldName) {
        const oldDoc = await lbRef.doc(oldName).get();
        if (oldDoc.exists) {
        const oldData = oldDoc.data();
        const newDoc = await lbRef.doc(newName).get();
        const newScore = newDoc.exists ? (newDoc.data().score || 0) : 0;
        const best = Math.max(oldData.score || 0, newScore);
        await lbRef.doc(newName).set({ name: newName, score: best, ts: Date.now() });
        await lbRef.doc(oldName).delete();
        }
    }
    // Migrate tetris leaderboard entry
    if (oldName) {
        const tetrisLbRef = db.collection('leaderboard_tetris');
        const oldTDoc = await tetrisLbRef.doc(oldName).get();
        if (oldTDoc.exists) {
        const oldTData = oldTDoc.data();
        const newTDoc = await tetrisLbRef.doc(newName).get();
        const newTScore = newTDoc.exists ? (newTDoc.data().score || 0) : 0;
        const bestT = Math.max(oldTData.score || 0, newTScore);
        await tetrisLbRef.doc(newName).set({ name: newName, score: bestT, ts: Date.now() });
        await tetrisLbRef.doc(oldName).delete();
        }
    }
    // Update uid-keyed leaderboards (2048, snake, block-blast)
    const uid = auth.currentUser?.uid;
    if (uid) {
        const uidLbs = [
        db.collection('leaderboard_2048'),
        db.collection('leaderboard_snake'),
        db.collection('leaderboard_blockblast'),
        ];
        for (const ref of uidLbs) {
        const d = await ref.doc(uid).get();
        if (d.exists) await ref.doc(uid).update({ name: newName });
        }
    }
    // Update room displayName (merge: true creates doc if it doesn't exist)
    if (uid) {
        await roomsRef.doc(uid).set({ displayName: newName }, { merge: true });
    }
    // Save to localStorage (keyed by uid to prevent cross-account mix on same device)
    localStorage.setItem('flappy_name', newName);
    if (uid) localStorage.setItem('flappy_custom_name_' + uid, newName);
    // Migrate local best score
    if (oldName) {
        const oldBestKey = 'flappy_best_' + oldName;
        const oldBest = localStorage.getItem(oldBestKey);
        if (oldBest) {
        const newBestKey = 'flappy_best_' + newName;
        const existingBest = parseInt(localStorage.getItem(newBestKey) || '0', 10);
        localStorage.setItem(newBestKey, Math.max(parseInt(oldBest, 10), existingBest));
        localStorage.removeItem(oldBestKey);
        }
        // Migrate tetris local best score
        const oldTetrisKey = 'tetris_best_' + oldName;
        const oldTetrisBest = localStorage.getItem(oldTetrisKey);
        if (oldTetrisBest) {
        const newTetrisKey = 'tetris_best_' + newName;
        const existingTBest = parseInt(localStorage.getItem(newTetrisKey) || '0', 10);
        localStorage.setItem(newTetrisKey, Math.max(parseInt(oldTetrisBest, 10), existingTBest));
        localStorage.removeItem(oldTetrisKey);
        }
        // Migrate 2048, snake, block-blast local best scores
        const otherBests = [['2048_best_'], ['snake_best_'], ['bb_best_']];
        for (const [prefix] of otherBests) {
        const oKey = prefix + oldName;
        const oVal = localStorage.getItem(oKey);
        if (oVal) {
            const nKey = prefix + newName;
            const existing = parseInt(localStorage.getItem(nKey) || '0', 10);
            localStorage.setItem(nKey, Math.max(parseInt(oVal, 10), existing));
            localStorage.removeItem(oKey);
        }
        }
    }
    settingsNameStatus.style.color = '#34d399';
    settingsNameStatus.textContent = '\u2713 Name updated!';
    setTimeout(() => settingsOverlay.classList.add('hidden'), 800);
    } catch (e) {
    console.error('Name change error:', e);
    settingsNameStatus.style.color = '#f87171';
    settingsNameStatus.textContent = 'Failed to save \u2014 try again';
    } finally {
    settingsNameSaveBtn.disabled = false;
    }
});

// Notification toggle inside settings
notifToggle.addEventListener('change', () => {
    if (notifToggle.checked) {
    // Check if browser supports Notification API
    if (!('Notification' in window)) {
        // No native push support (e.g. iOS Safari) — still enable in-app alerts
        notifEnabled = true;
        localStorage.setItem('notif_enabled', '1');
        showToast('In-app notifications enabled! 🔔', 'success');
        return;
    }
    if (Notification.permission === 'denied') {
        notifToggle.checked = false;
        showToast('Notifications blocked — enable in browser settings', 'error');
        return;
    }
    if (Notification.permission === 'default') {
        // Request permission — handle both promise and callback styles
        try {
        const result = Notification.requestPermission((perm) => {
            if (perm !== 'granted') {
            notifToggle.checked = false;
            showToast('Notifications blocked by browser', 'error');
            return;
            }
            notifEnabled = true;
            localStorage.setItem('notif_enabled', '1');
            showToast('Notifications enabled! 🔔', 'success');
        });
        // Modern browsers return a promise
        if (result && result.then) {
            result.then((perm) => {
            if (perm !== 'granted') {
                notifToggle.checked = false;
                showToast('Notifications blocked by browser', 'error');
            } else {
                notifEnabled = true;
                localStorage.setItem('notif_enabled', '1');
                showToast('Notifications enabled! 🔔', 'success');
            }
            });
        }
        } catch {
        notifEnabled = true;
        localStorage.setItem('notif_enabled', '1');
        showToast('Notifications enabled! 🔔', 'success');
        }
        return;
    }
    // permission === 'granted'
    notifEnabled = true;
    localStorage.setItem('notif_enabled', '1');
    showToast('Notifications enabled! 🔔', 'success');
    } else {
    notifEnabled = false;
    localStorage.setItem('notif_enabled', '0');
    showToast('Notifications disabled', 'success');
    }
});

// Sound toggle
soundToggle.addEventListener('change', () => {
    soundEnabled = soundToggle.checked;
    localStorage.setItem('sound_enabled', soundEnabled ? '1' : '0');
    showToast(soundEnabled ? 'Sound on 🔊' : 'Sound muted 🔇', 'success');
});

// Theme toggle (light / dark) — routed through the Theme controller so it sets
// data-theme on <html> (token system) and keeps the legacy class in sync.
themeToggle.addEventListener('change', () => {
    const t = themeToggle.checked ? 'light' : 'dark';
    if (window.Theme) Theme.setTheme(t);
    else { document.body.classList.toggle('light-theme', themeToggle.checked); localStorage.setItem('theme', t); }
});

// Font size selector
function updateFontSizeBtns() {
    const cur = localStorage.getItem('font_size') || 'medium';
    document.querySelectorAll('#fontSizeSelect button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.size === cur);
    });
}
document.getElementById('fontSizeSelect').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const size = btn.dataset.size;
    document.body.classList.remove('font-small', 'font-medium', 'font-large');
    document.body.classList.add('font-' + size);
    localStorage.setItem('font_size', size);
    updateFontSizeBtns();
});

// Bubble animation toggle
animToggle.addEventListener('change', () => {
    document.body.classList.toggle('no-animations', !animToggle.checked);
    localStorage.setItem('animations', animToggle.checked ? '1' : '0');
});

// Clear cache button
document.getElementById('clearCacheBtn').addEventListener('click', () => {
    ['cache_answers', 'cache_food'].forEach(k => localStorage.removeItem(k));
    showToast('Cache cleared!', 'success');
});

// Clear badge when user focuses the tab
window.addEventListener('focus', () => {
    unseenCount = 0;
    notifBadge.classList.remove('show');
    document.title = originalTitle;
    clearInterval(titleFlashInterval);
    titleFlashInterval = null;
});

function ringBell() {
    // Subtle shake on the settings gear when new messages arrive
    settingsBtn.style.animation = 'none';
    void settingsBtn.offsetWidth;
    settingsBtn.style.animation = 'gearPulse 0.4s ease';
}

function flashTitle() {
    if (titleFlashInterval) return;
    let on = true;
    titleFlashInterval = setInterval(() => {
    document.title = on ? '(' + unseenCount + ') New message!' : originalTitle;
    on = !on;
    }, 1000);
}

function notifyNewMessages(items) {
    if (isFirstSnapshot) {
    // On first load, just record the known IDs & reply counts — don't notify
    isFirstSnapshot = false;
    knownIds = new Set(items.map(a => a.id));
    items.forEach(a => { knownReplyCounts[a.id] = countAllReplies(a.replies || []); });
    return;
    }

    const newItems = items.filter(a => !knownIds.has(a.id));

    // Check for new replies on existing bubbles
    let newReplyCount = 0;
    let newestReplyText = '';
    items.forEach(a => {
    const currentCount = countAllReplies(a.replies || []);
    const oldCount = knownReplyCounts[a.id] || 0;
    if (knownIds.has(a.id) && currentCount > oldCount) {
        const diff = currentCount - oldCount;
        newReplyCount += diff;
        // Get the newest reply text for the notification
        const lastReply = getLatestReply(a.replies || []);
        if (lastReply) {
        newestReplyText = lastReply.text || '📷 Image reply';
        }
    }
    knownReplyCounts[a.id] = currentCount;
    });

    // Handle new bubble notifications
    if (newItems.length) {
    if (suppressNextNotif) {
        suppressNextNotif = false;
    } else {
        fireNotification(
        newItems.length,
        newItems[newItems.length - 1].text
            ? (newItems[newItems.length - 1].text.length > 80 ? newItems[newItems.length - 1].text.slice(0, 80) + '…' : newItems[newItems.length - 1].text)
            : '📷 Image message',
        'New Anonymous Message',
        'anon-bubble'
        );
    }
    }

    // Handle new reply notifications
    if (newReplyCount > 0) {
    if (suppressNextReplyNotif) {
        suppressNextReplyNotif = false;
    } else {
        const replyBody = newestReplyText.length > 80 ? newestReplyText.slice(0, 80) + '…' : newestReplyText;
        fireNotification(
        newReplyCount,
        replyBody,
        'New Reply',
        'anon-reply'
        );
    }
    }

    // Update known IDs
    items.forEach(a => knownIds.add(a.id));
}

function fireNotification(count, bodyText, title, tag) {
    // Ring the bell animation + play sound
    ringBell();
    if (notifEnabled && soundEnabled) playNotifSound();

    // If tab not focused → badge + title flash
    if (document.hidden) {
    unseenCount += count;
    notifBadge.textContent = unseenCount > 99 ? '99+' : unseenCount;
    notifBadge.classList.add('show');
    flashTitle();
    }

    // Browser push notification (if enabled + tab hidden)
    if (notifEnabled && document.hidden && 'Notification' in window && Notification.permission === 'granted') {
    const n = new Notification(title, {
        body: count > 1
        ? count + ' new — ' + bodyText
        : bodyText,
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">💬</text></svg>',
        tag: tag
    });
    n.addEventListener('click', () => {
        window.focus();
        n.close();
    });
    }
}

/* ═══════════════════════════════════════════
    Load cached data instantly (before Firestore)
    ═══════════════════════════════════════════ */
(function loadCache() {
    const cachedAnswers = cacheGet('cache_answers');
    if (cachedAnswers && cachedAnswers.length) {
    // Filter out expired items (keep pinned ones alive while the pin lasts)
    const now = Date.now();
    const valid = cachedAnswers.filter(a => now - a.ts < SIX_HOURS || (a.boostUntil && a.boostUntil > now));
    if (valid.length) {
        knownIds = new Set(valid.map(a => a.id));
        valid.forEach(a => { knownReplyCounts[a.id] = countAllReplies(a.replies || []); });
        render(valid);
    }
    }
    const cachedFood = cacheGet('cache_food');
    if (cachedFood && cachedFood.length) {
    foodItems = cachedFood;
    renderVoteList();
    updateRestoreBtn();
    }
})();

/* ═══════════════════════════════════════════
    Real-time listeners (detach when tab hidden to reduce Firestore reads)
    ═══════════════════════════════════════════ */
let _unsubAnswers = null;
let _unsubFood = null;

function _subscribeAnswers() {
    if (_unsubAnswers) return; // already subscribed
    _unsubAnswers = answersRef.orderBy('ts', 'desc').limit(50).onSnapshot((snapshot) => {
    const now = Date.now();
    const items = [];
    snapshot.forEach((doc) => {
    const d = doc.data();
    // Normally messages live 6 hours; a paid pin keeps it alive until the pin expires.
    if (now - d.ts < SIX_HOURS || (d.boostUntil && d.boostUntil > now)) {
        temp = { id: doc.id, text: d.text ?? '', ts: d.ts, image: d.image ?? null, replies: d.replies ?? [], reactions: d.reactions ?? {}, type: d.type ?? null, pollOptions: d.pollOptions ?? null, pollVotes: d.pollVotes ?? {}, cos: d.cos ?? null, boostUntil: d.boostUntil ?? 0, awards: d.awards ?? null, awardGivers: d.awardGivers ?? null };
        if (d.name) temp.name = d.name ?? '';
        items.push(temp);
    }
    });
    // Reverse to chronological order (query fetched desc for limit efficiency)
    items.reverse();
    // Cache to localStorage (strip large images from replies to save space)
    try {
    const lite = items.map(a => ({
        ...a,
        replies: toLiteReplies(a.replies || []),
    }));
    cacheSet('cache_answers', lite);
    } catch {}
    // Detect new messages for notifications
    notifyNewMessages(items);
    firstSnapshotFired = true;
    render(items);
    }, (err) => {
    console.error('Firestore error:', err);
    showToast('Connection error — check console (F12)', 'error');
    });
}

function _subscribeFood() {
    if (_unsubFood) return; // already subscribed
    _unsubFood = foodRef.orderBy('ts', 'asc').limit(50).onSnapshot((snapshot) => {
    foodItems = [];
    snapshot.forEach((doc) => {
    const d = doc.data();
    foodItems.push({ id: doc.id, text: d.text, ts: d.ts, votes: d.votes ?? 0, removed: !!d.removed });
    });
    cacheSet('cache_food', foodItems);
    renderVoteList();
    updateRestoreBtn();
    }, (err) => {
    console.error('Food Firestore error:', err);
    });
}

function _unsubAllListeners() {
    // Keep answers listener active for browser push notifications
    if (_unsubFood) { _unsubFood(); _unsubFood = null; }
}

// Initial subscribe
_subscribeAnswers();
_subscribeFood();

// Detach non-essential listeners when tab is hidden, reattach when visible
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
    _unsubAllListeners();
    // Also pause heartbeat writes
    if (_lastSeenInterval) { clearInterval(_lastSeenInterval); _lastSeenInterval = null; }
    if (auth.currentUser) db.collection('rooms').doc(auth.currentUser.uid).update({ lastSeen: 0 }).catch(() => {});
    } else {
    _subscribeFood();
    // Resume heartbeat
    if (auth.currentUser) {
        db.collection('rooms').doc(auth.currentUser.uid).update({ lastSeen: Date.now() }).catch(() => {});
        if (!_lastSeenInterval) {
        _lastSeenInterval = setInterval(() => {
            if (document.hidden) return;
            if (auth.currentUser) db.collection('rooms').doc(auth.currentUser.uid).update({ lastSeen: Date.now() }).catch(() => {});
        }, 120000);
        }
    }
    }
});

/* ═══════════════════════════════════════════
    Daily vote reset at 12 AM
    ═══════════════════════════════════════════ */
function getTodayKey() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// On page load: reset votes if no one has done it today yet
async function dailyReset() {
    const today = getTodayKey();

    // Check Firestore meta doc (shared across all users)
    const metaRef = db.collection('_meta').doc('daily_reset');
    const metaDoc = await metaRef.get();
    const lastResetDay = metaDoc.exists ? (metaDoc.data().day ?? '') : '';

    // Always clear local vote tracking if the local day differs
    const localDay = localStorage.getItem('food_vote_day') ?? '';
    if (localDay !== today) {
    localStorage.removeItem('food_voted');
    localStorage.setItem('food_vote_day', today);
    }

    // Only reset Firestore votes if no client has reset today yet
    if (lastResetDay === today) return;

    try {
    // Mark reset day in Firestore FIRST to prevent other clients from also resetting
    await metaRef.set({ day: today });

    // Only fetch food docs that actually have votes to reset (avoids full collection scan)
    const votedFood = await foodRef.where('votes', '>', 0).get();
    if (votedFood.empty) return;
    const batch = db.batch();
    votedFood.forEach((doc) => {
        batch.update(doc.ref, { votes: 0 });
    });
    await batch.commit();
    resetInfoEl.textContent = '\uD83D\uDD04 Votes reset for today (' + today + ')';
    resetInfoEl.className = 'reset-info just-reset';
    } catch (e) {
    console.error('Daily vote reset failed:', e);
    }
}
dailyReset();

// Show current day info if no reset was needed
if (!resetInfoEl.textContent) {
    resetInfoEl.textContent = 'Votes reset daily at 12:00 AM';
}

// Also schedule a reset if the page stays open past midnight
function scheduleMidnightReset() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const msUntilMidnight = midnight - now;
    setTimeout(() => {
    dailyReset();
    scheduleMidnightReset();  // schedule next day
    }, msUntilMidnight + 500);  // +500ms buffer
}
scheduleMidnightReset();

/* ═══════════════════════════════════════════
    Countdown timer
    ═══════════════════════════════════════════ */
const countdownTimeInput = document.getElementById('countdownTime');
const countdownSetBtn    = document.getElementById('countdownSetBtn');
const countdownDigits    = document.getElementById('countdownDigits');
const countdownLabel     = document.getElementById('countdownLabel');
const countdownClear     = document.getElementById('countdownClear');
const countdownRef       = db.doc('app_state/countdown');
const celebrationOverlay = document.getElementById('celebrationOverlay');
const celebrationClose   = document.getElementById('celebrationClose');
let countdownInterval    = null;

// Only show celebration once per period per day — persist across refresh
function getCelebrationKey(type) {
    const d = new Date();
    return 'celebration_' + type + '_' + d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function wasCelebrationShown(type) {
    return localStorage.getItem(getCelebrationKey(type)) === '1';
}
function markCelebrationShown(type) {
    localStorage.setItem(getCelebrationKey(type), '1');
}

function padZ(n) { return String(n).padStart(2, '0'); }

// Confetti burst
function spawnConfetti() {
    const colors = ['#f7c97e','#e06377','#7ec8e3','#c8b6ff','#58c5b5','#f2a154','#9b72cf'];
    for (let i = 0; i < 80; i++) {
    const el = document.createElement('div');
    el.className = 'confetti';
    el.style.left = Math.random() * 100 + 'vw';
    el.style.background = colors[Math.floor(Math.random() * colors.length)];
    el.style.width = (6 + Math.random() * 8) + 'px';
    el.style.height = (6 + Math.random() * 8) + 'px';
    el.style.animationDuration = (2 + Math.random() * 3) + 's';
    el.style.animationDelay = (Math.random() * 1.5) + 's';
    document.body.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
    }
}

function showCelebration(type) {
    type = type || 'offwork';
    if (wasCelebrationShown(type)) return;
    markCelebrationShown(type);
    const celebrationText = document.getElementById('celebrationText');
    const celebrationSub = document.getElementById('celebrationSub');
    const celebrationEmojis = document.getElementById('celebrationEmojis');
    if (type === 'lunch') {
    celebrationEmojis.textContent = '🍽️😋🎉';
    celebrationText.textContent = 'LUNCH TIME!';
    celebrationSub.textContent = 'Go eat & recharge! Enjoy your break 🍜';
    } else {
    celebrationEmojis.textContent = '🎉🥳🎊';
    celebrationText.textContent = 'OFF WORK!';
    celebrationSub.textContent = 'Time to go home! You did great today 💪';
    }
    celebrationOverlay.classList.add('show');
    spawnConfetti();
    setTimeout(spawnConfetti, 1200);
}

celebrationClose.addEventListener('click', () => {
    celebrationOverlay.classList.remove('show');
});

// Default targets: Mon-Fri, 9AM→12:30PM (lunch) | 2PM→6PM (off work)
function getDefaultTarget() {
    const now = new Date();
    const day = now.getDay(); // 0=Sun, 6=Sat
    const hm = now.getHours() * 60 + now.getMinutes();
    // Only weekdays (Mon=1 to Fri=5)
    if (day === 0 || day === 6) return null;
    // Morning period: 9:00 AM (540) to 12:30 PM (750)
    if (hm >= 540 && hm < 750) {
    const target = new Date(now);
    target.setHours(12, 30, 0, 0);
    return { ts: target.getTime(), type: 'lunch' };
    }
    // Afternoon period: 2:00 PM (840) to 6:00 PM (1080)
    if (hm >= 840 && hm < 1080) {
    const target = new Date(now);
    target.setHours(18, 0, 0, 0);
    return { ts: target.getTime(), type: 'offwork' };
    }
    // Lunch break: 12:30 PM to 2:00 PM
    if (hm >= 750 && hm < 840) return { ts: null, type: 'lunchbreak' };
    return null;
}

function tickCountdown(targetTs, type) {
    clearInterval(countdownInterval);
    type = type || 'offwork';
    function update() {
    const diff = targetTs - Date.now();
    if (diff <= 0) {
        clearInterval(countdownInterval);
        if (type === 'lunch') {
        countdownDigits.innerHTML = '<span class="countdown-done">🍽️ Lunch time! 🍽️</span>';
        countdownLabel.textContent = 'Go eat & recharge!';
        showCelebration('lunch');
        } else {
        countdownDigits.innerHTML = '<span class="countdown-done">🎉 Off work! 🎉</span>';
        countdownLabel.textContent = 'Time to go home!';
        showCelebration('offwork');
        }
        // Auto-clean expired custom countdown after showing celebration
        setTimeout(() => countdownRef.delete().catch(() => {}), 5 * 60 * 1000);
        return;
    }
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    countdownDigits.textContent = padZ(h) + ':' + padZ(m) + ':' + padZ(s);
    countdownLabel.textContent = type === 'lunch' ? 'until lunch 🍜' : 'until freedom 🏃';
    }
    update();
    countdownInterval = setInterval(update, 1000);
}

// Set custom countdown — synced to Firebase so all users see same timer
countdownSetBtn.addEventListener('click', async () => {
    const val = countdownTimeInput.value;
    if (!val) return;
    const [hh, mm] = val.split(':').map(Number);
    const target = new Date();
    target.setHours(hh, mm, 0, 0);
    if (target.getTime() <= Date.now()) {
    target.setDate(target.getDate() + 1);
    }
    try {
    await countdownRef.set({ targetTs: target.getTime() });
    showToast('Countdown set! ⏰', 'success');
    } catch {
    showToast('Failed to set countdown', 'error');
    }
});

// Clear custom countdown (falls back to auto default)
countdownClear.addEventListener('click', async () => {
    try {
    await countdownRef.delete();
    clearInterval(countdownInterval);
    applyDefaultCountdown();
    showToast('Countdown cleared — using default', 'success');
    } catch {
    showToast('Failed to clear', 'error');
    }
});

function applyDefaultCountdown() {
    const result = getDefaultTarget();
    if (result && result.ts) {
    tickCountdown(result.ts, result.type);
    } else {
    const now = new Date();
    const day = now.getDay();
    const hm = now.getHours() * 60 + now.getMinutes();
    if (day === 0 || day === 6) {
        countdownDigits.textContent = '--:--:--';
        countdownLabel.textContent = 'It\u2019s the weekend! Enjoy \ud83c\udf1f';
    } else if (hm < 540) {
        countdownDigits.textContent = '--:--:--';
        countdownLabel.textContent = 'Work starts at 9:00 AM \u2615';
    } else if (result && result.type === 'lunchbreak') {
        countdownDigits.textContent = '--:--:--';
        countdownLabel.textContent = 'Lunch break! Back at 2:00 PM \ud83c\udf5c';
    } else {
        countdownDigits.innerHTML = '<span class="countdown-done">\ud83c\udf89 Off work! \ud83c\udf89</span>';
        countdownLabel.textContent = 'Enjoy your evening!';
    }
    }
}

// Real-time listener — custom override from Firebase; falls back to auto default
countdownRef.onSnapshot((snap) => {
    if (!snap.exists || !snap.data().targetTs) {
    clearInterval(countdownInterval);
    applyDefaultCountdown();
    return;
    }
    const targetTs = snap.data().targetTs;
    // If the custom countdown already expired, delete it and fall back to default schedule
    if (targetTs <= Date.now()) {
    countdownRef.delete().catch(() => {});
    return; // The delete triggers another onSnapshot which calls applyDefaultCountdown
    }
    tickCountdown(targetTs);
});

/* ── Cleanup: delete expired docs (runs once on each page load) ── */
(async function cleanup() {
    const now = Date.now();
    const expiredCutoff = now - SIX_HOURS;
    const expired = await answersRef.where('ts', '<=', expiredCutoff).get();
    const batch = db.batch();
    let count = 0;
    expired.forEach((doc) => {
        // A paid pin (置顶) must survive past the 6h window until it actually
        // expires — otherwise the 24h/6h/1h pin a user bought is deleted early.
        const d = doc.data();
        if (d.boostUntil && d.boostUntil > now) return;
        batch.delete(doc.ref);
        count++;
    });
    if (count) batch.commit();
})();

/* ═══════════════════════════════════════════
    Mood Check-in Widget
    ═══════════════════════════════════════════ */
(() => {
    const MOODS = ['great', 'good', 'meh', 'bad', 'fire'];
    const moodFab = document.getElementById('moodFab');
    const moodPanel = document.getElementById('moodPanel');
    const checkinArea = document.getElementById('moodCheckinArea');
    const moodRef = db.collection('mood_checkins');

    function todayKey() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    function todayDocRef() { return moodRef.doc(todayKey()); }

    function getUid() {
    const u = auth.currentUser;
    return u ? u.uid : null;
    }

    // Check if THIS user already voted today (stored in sub-collection)
    function getLocalMood() { return localStorage.getItem('mood_' + todayKey()); }
    function setLocalMood(mood) { localStorage.setItem('mood_' + todayKey(), mood); }

    // Toggle panel
    moodFab.addEventListener('click', () => {
    moodPanel.classList.toggle('show');
    });

    // Close panel on outside click
    document.addEventListener('click', (e) => {
    if (!moodPanel.contains(e.target) && e.target !== moodFab) {
        moodPanel.classList.remove('show');
    }
    });

    // Render checked state
    function renderChecked(mood) {
    moodFab.classList.add('has-checked');
    moodFab.textContent = { great: '😄', good: '🙂', meh: '😐', bad: '😢', fire: '🔥' }[mood] || '✅';
    checkinArea.innerHTML = '<div class="mood-checked-msg">You picked ' +
        { great: '😄', good: '🙂', meh: '😐', bad: '😢', fire: '🔥' }[mood] +
        ' today!</div>';
    }

    // Update chart bars
    function updateChart(data) {
    const counts = {};
    MOODS.forEach(m => { counts[m] = (data && data[m]) || 0; });
    const max = Math.max(1, ...Object.values(counts));
    MOODS.forEach(m => {
        const bar = document.getElementById('moodBar_' + m);
        const cnt = document.getElementById('moodCount_' + m);
        if (bar) bar.style.height = Math.max(2, (counts[m] / max) * 30) + 'px';
        if (cnt) cnt.textContent = counts[m];
    });
    }

    // Submit mood — 1 vote per Google account per day
    async function submitMood(mood) {
    const uid = getUid();
    if (!uid) { showToast('Please sign in first', 'error'); return; }

    setLocalMood(mood);
    renderChecked(mood);

    const votersRef = todayDocRef().collection('voters').doc(uid);
    try {
        const voterSnap = await votersRef.get();
        const previousMood = voterSnap.exists ? voterSnap.data().mood : null;

        await db.runTransaction(async (tx) => {
        const ref = todayDocRef();
        const snap = await tx.get(ref);
        const d = snap.exists ? snap.data() : {};

        // If already voted, undo previous mood count
        if (previousMood && previousMood !== mood) {
            d[previousMood] = Math.max(0, (d[previousMood] || 0) - 1);
        }

        // Only increment if new vote or changed mood
        if (!previousMood || previousMood !== mood) {
            d[mood] = (d[mood] || 0) + 1;
        }

        d.date = todayKey();
        tx.set(ref, d, { merge: true });
        });

        // Record this user's vote
        await votersRef.set({ mood, ts: Date.now() });
    } catch (err) {
        console.error('Mood submit error:', err, 'code:', err.code, 'msg:', err.message);
        showToast('Mood fail: ' + (err.code || '') + ' ' + (err.message || 'unknown'), 'error');
    }
    }

    // Check if user already voted today (from Firestore)
    async function checkExistingVote() {
    const uid = getUid();
    if (!uid) return;
    try {
        const voterSnap = await todayDocRef().collection('voters').doc(uid).get();
        if (voterSnap.exists) {
        const mood = voterSnap.data().mood;
        renderChecked(mood);
        setLocalMood(mood);
        }
    } catch (e) {
        // Fall back to localStorage
        const existing = getLocalMood();
        if (existing) renderChecked(existing);
    }
    }

    // Bind emoji buttons
    document.querySelectorAll('.mood-emoji-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const mood = btn.dataset.mood;
        document.querySelectorAll('.mood-emoji-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        submitMood(mood);
    });
    });

    // Init: check existing vote from localStorage first (fast), then verify from Firestore
    const existing = getLocalMood();
    if (existing) renderChecked(existing);

    // After auth ready, check Firestore for actual vote and start chart listener
    const unsubAuth = auth.onAuthStateChanged((user) => {
    if (!user) return; // Wait for authenticated state
    checkExistingVote();
    todayDocRef().onSnapshot(
        (snap) => { updateChart(snap.exists ? snap.data() : {}); },
        (err) => { console.warn('Mood chart listener error:', err); }
    );
    unsubAuth();
    });
})();

// ═══ Chinese Chess invite listener (pauses when tab is hidden) ═══
(function() {
    let chessInvUnsub = null;
    let _chessInvUid = null; // track current user for resubscribe
    const _auth = firebase.auth();
    const _db = firebase.firestore();

    function _subscribeChessInvites() {
    if (chessInvUnsub || !_chessInvUid) return; // already subscribed or no user
    chessInvUnsub = _db.collection('chess_invites')
        .where('toUid', '==', _chessInvUid)
        .where('status', '==', 'pending')
        .onSnapshot((snap) => {
        snap.docChanges().forEach(ch => {
            if (ch.type !== 'added') return;
            const inv = ch.doc.data();
            const id = ch.doc.id;
            console.log('[ChessInvite] Invite received on index:', id, inv);
            if (document.querySelector('.chess-invite-overlay')) return;
            const ov = document.createElement('div');
            ov.className = 'chess-invite-overlay';
            ov.innerHTML = '<div class="chess-invite-box">' +
            '<h3>♟️ Chess Challenge!</h3>' +
            '<div class="ci-from">' + (inv.fromName||'Someone') + ' invites you</div>' +
            '<div class="ci-bet">🪙 ' + inv.bet + ' coins</div>' +
            '<div class="ci-buttons">' +
                '<button class="ci-reject">Reject</button>' +
                '<button class="ci-accept">Accept</button>' +
            '</div></div>';
            document.body.appendChild(ov);
            ov.querySelector('.ci-accept').addEventListener('click', () => {
            ov.remove();
            _db.collection('chess_invites').doc(id).update({status:'accepted'});
            window.location.href = '/games/chinese-chess.html?join=' + inv.gameId;
            });
            ov.querySelector('.ci-reject').addEventListener('click', () => {
            ov.remove();
            _db.collection('chess_invites').doc(id).update({status:'rejected'});
            });
        });
        }, (err) => { console.error('[ChessInvite] onSnapshot error on index:', err); });
    }

    function _unsubscribeChessInvites() {
    if (chessInvUnsub) { chessInvUnsub(); chessInvUnsub = null; }
    }

    _auth.onAuthStateChanged((u) => {
    _unsubscribeChessInvites();
    if (!u) { _chessInvUid = null; return; }
    _chessInvUid = u.uid;
    console.log('[ChessInvite] Listening for invites on index, uid:', u.uid);
    _subscribeChessInvites();
    });

    // Pause/resume on visibility change
    document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        _unsubscribeChessInvites();
    } else {
        _subscribeChessInvites();
    }
    });
})();
