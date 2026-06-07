/**
 * Quote Comments — lets users comment on the daily 正能量 (motivational) quote.
 *
 * Firestore path: quote_comments/{YYYY-MM-DD}/comments/{autoId}
 * Each comment: { uid, displayName, text, createdAt }
 *
 * Comments are lazy-loaded (only when the section is expanded)
 * and use onSnapshot for real-time updates to minimise redundant reads.
 */

// eslint-disable-next-line no-unused-vars
const QuoteComments = (() => {
  const MAX_COMMENT_LENGTH = 200;
  const COMMENTS_PER_PAGE = 50;

  let _unsubscribe = null; // onSnapshot listener
  let _expanded = false;

  /**
   * Get today's date string used as the Firestore doc key.
   * @returns {string} YYYY-MM-DD
   */
  function _todayKey() {
    const d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  /** Firestore ref to today's comments subcollection */
  function _commentsRef() {
    // `db` and `auth` are global (firebase-config + app.js)
    return db.collection('quote_comments').doc(_todayKey()).collection('comments');
  }

  /**
   * Render the comment list from a Firestore snapshot.
   */
  function _renderComments(snapshot) {
    const list = document.getElementById('quoteCommentList');
    if (!list) return;

    if (snapshot.empty) {
      list.innerHTML = '<div class="qc-empty">还没有评论，来抢沙发吧！</div>';
      return;
    }

    const frag = document.createDocumentFragment();
    snapshot.forEach(doc => {
      const d = doc.data();
      const el = document.createElement('div');
      el.className = 'qc-item';

      const name = document.createElement('span');
      name.className = 'qc-name';
      name.textContent = d.displayName || 'Anonymous';

      const time = document.createElement('span');
      time.className = 'qc-time';
      time.textContent = _formatTime(d.createdAt);

      const text = document.createElement('div');
      text.className = 'qc-text';
      text.textContent = d.text;

      // Delete button — only for own comments
      const currentUid = auth.currentUser?.uid;
      if (currentUid && d.uid === currentUid) {
        const del = document.createElement('button');
        del.className = 'qc-delete';
        del.title = '删除';
        del.textContent = '✕';
        del.addEventListener('click', () => _deleteComment(doc.id));
        el.appendChild(del);
      }

      el.appendChild(name);
      el.appendChild(time);
      el.appendChild(text);
      frag.appendChild(el);
    });

    list.innerHTML = '';
    list.appendChild(frag);
  }

  /** Format timestamp to HH:mm */
  function _formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  /** Subscribe to today's comments via onSnapshot (real-time). */
  function _subscribe() {
    if (_unsubscribe) return; // already listening
    _unsubscribe = _commentsRef()
      .orderBy('createdAt', 'asc')
      .limit(COMMENTS_PER_PAGE)
      .onSnapshot(snap => _renderComments(snap), err => {
        console.error('Quote comments listener error:', err);
      });
  }

  /** Unsubscribe from real-time listener to save reads. */
  function _detach() {
    if (_unsubscribe) {
      _unsubscribe();
      _unsubscribe = null;
    }
  }

  /** Toggle the comment section open / closed. */
  function toggle() {
    _expanded = !_expanded;
    const section = document.getElementById('quoteCommentSection');
    const arrow = document.getElementById('quoteCommentArrow');
    if (!section) return;

    if (_expanded) {
      section.classList.add('open');
      if (arrow) arrow.textContent = '▲';
      _subscribe();
    } else {
      section.classList.remove('open');
      if (arrow) arrow.textContent = '▼';
      _detach();
    }
  }

  const ANONYMOUS_LABEL = '匿名用户';

  /** Post a new comment. */
  async function post() {
    const input = document.getElementById('quoteCommentInput');
    if (!input) return;

    const text = input.value.trim();
    if (!text) return;
    if (text.length > MAX_COMMENT_LENGTH) {
      _showToast('评论不能超过 ' + MAX_COMMENT_LENGTH + ' 字');
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      _showToast('请先登录');
      return;
    }

    // Check if anonymous toggle is checked (default: anonymous)
    const anonCheckbox = document.getElementById('quoteCommentAnon');
    const isAnonymous = anonCheckbox ? anonCheckbox.checked : true;

    let displayName = ANONYMOUS_LABEL;
    if (!isAnonymous) {
      displayName =
        localStorage.getItem('flappy_custom_name_' + user.uid) ||
        localStorage.getItem('flappy_name') ||
        user.displayName ||
        'Anonymous';
    }

    const btn = document.getElementById('quoteCommentSendBtn');
    if (btn) btn.disabled = true;

    try {
      await _commentsRef().add({
        uid: user.uid,
        displayName: displayName,
        text: text,
        createdAt: Date.now()
      });
      input.value = '';
    } catch (err) {
      console.error('Failed to post quote comment:', err);
      _showToast('发送失败，请重试');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  /** Delete own comment by doc ID. */
  async function _deleteComment(commentId) {
    try {
      await _commentsRef().doc(commentId).delete();
    } catch (err) {
      console.error('Failed to delete comment:', err);
      _showToast('删除失败');
    }
  }

  /** Simple toast (reuse app toast if available, else console). */
  function _showToast(msg) {
    // Check if the app already exposes a toast helper
    if (typeof window.showToast === 'function') {
      window.showToast(msg);
      return;
    }
    const toast = document.getElementById('quoteCommentToast');
    if (!toast) { console.warn(msg); return; }
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
  }

  /** Initialise — bind events. */
  function init() {
    const toggleBtn = document.getElementById('quoteCommentToggle');
    if (toggleBtn) toggleBtn.addEventListener('click', toggle);

    const sendBtn = document.getElementById('quoteCommentSendBtn');
    if (sendBtn) sendBtn.addEventListener('click', post);

    // Allow Enter key to send
    const input = document.getElementById('quoteCommentInput');
    if (input) {
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          post();
        }
      });
    }
  }

  return { init, toggle, post };
})();
