    /* ═══════════════════════════════
       10. MINI-GAME LEADERBOARD
       ═══════════════════════════════ */
    let _lbCurrentGame = 'flappy';
    // In-memory leaderboard cache to avoid re-reading on every tab switch
    const _lbCache = {}; // { gameId: { html, ts } }
    const LB_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    function showLeaderboard() {
      document.getElementById('settingsOverlay').classList.add('hidden');
      document.getElementById('lbOverlay').classList.remove('hidden');
      renderLeaderboardTabs();
      loadLeaderboard(_lbCurrentGame);
    }

    function renderLeaderboardTabs() {
      const el = document.getElementById('lbTabs');
      el.innerHTML = LB_GAMES.map(g =>
        '<button class="lb-tab ' + (g.id === _lbCurrentGame ? 'active' : '') + '" onclick="switchLbGame(\'' + g.id + '\')">' + g.name + '</button>'
      ).join('');
    }

    function switchLbGame(gameId) {
      _lbCurrentGame = gameId;
      renderLeaderboardTabs();
      loadLeaderboard(gameId);
    }

    async function loadLeaderboard(gameId) {
      const listEl = document.getElementById('lbList');
      const game = LB_GAMES.find(g => g.id === gameId);
      if (!game) return;

      // Return cached HTML if still fresh (avoids Firestore read on tab switch)
      const cached = _lbCache[gameId];
      if (cached && (Date.now() - cached.ts) < LB_CACHE_TTL) {
        listEl.innerHTML = cached.html;
        return;
      }

      listEl.innerHTML = '<div style="text-align:center;color:rgba(255,255,255,.3);padding:20px">Loading...</div>';
      try {
        const snap = await db.collection(game.key)
          .orderBy('score', 'desc').limit(20).get();
        if (snap.empty) {
          const emptyHtml = '<div style="text-align:center;color:rgba(255,255,255,.3);padding:20px">No scores yet!</div>';
          _lbCache[gameId] = { html: emptyHtml, ts: Date.now() };
          listEl.innerHTML = emptyHtml;
          return;
        }
        let html = '';
        let rank = 0;
        snap.forEach(doc => {
          rank++;
          const d = doc.data();
          const medals = ['🥇','🥈','🥉'];
          const cls = rank <= 3 ? ' top' + rank : '';
          html += '<div class="lb-row' + cls + '">' +
            '<div class="lb-rank">' + (rank <= 3 ? medals[rank-1] : '#' + rank) + '</div>' +
            '<div class="lb-name">' + escapeHtml(d.name || 'Anonymous') + '</div>' +
            '<div class="lb-score">' + (d.score || 0) + '</div></div>';
        });
        _lbCache[gameId] = { html, ts: Date.now() };
        listEl.innerHTML = html;
      } catch(e) {
        listEl.innerHTML = '<div style="text-align:center;color:rgba(255,255,255,.3);padding:20px">Could not load scores</div>';
      }
    }

    /** Invalidate a specific leaderboard cache (call after score submission) */
    function invalidateLbCache(gameId) {
      if (gameId) delete _lbCache[gameId];
      else Object.keys(_lbCache).forEach(k => delete _lbCache[k]);
    }

    document.getElementById('lbCloseBtn').addEventListener('click', () => {
      document.getElementById('lbOverlay').classList.add('hidden');
    });

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
              console.log('[ChessInvite] Invite received on room:', id, inv);
              if (document.querySelector('.chess-invite-overlay')) return;
              const ov = document.createElement('div');
              ov.className = 'chess-invite-overlay';
              ov.innerHTML = '<div class="chess-invite-box">' +
                '<h3>♟️ Chess Challenge!</h3>' +
                '<div class="ci-from">' + (inv.fromName||'Someone') + ' invites you</div>' +
                '<div class="ci-bet">💰 ' + inv.bet + ' coins</div>' +
                '<div class="ci-buttons">' +
                  '<button class="ci-reject">Reject</button>' +
                  '<button class="ci-accept">Accept</button>' +
                '</div></div>';
              document.body.appendChild(ov);
              ov.querySelector('.ci-accept').addEventListener('click', () => {
                ov.remove();
                _db.collection('chess_invites').doc(id).update({status:'accepted'});
                window.location.href = 'chinese-chess.html?join=' + inv.gameId;
              });
              ov.querySelector('.ci-reject').addEventListener('click', () => {
                ov.remove();
                _db.collection('chess_invites').doc(id).update({status:'rejected'});
              });
            });
          }, (err) => { console.error('[ChessInvite] onSnapshot error on room:', err); });
      }

      function _unsubscribeChessInvites() {
        if (chessInvUnsub) { chessInvUnsub(); chessInvUnsub = null; }
      }

      _auth.onAuthStateChanged((u) => {
        if (window.SITE_MAINTENANCE) return; // Maintenance mode: don't start invite listener
        _unsubscribeChessInvites();
        if (!u) { _chessInvUid = null; return; }
        _chessInvUid = u.uid;
        console.log('[ChessInvite] Listening for invites on room, uid:', u.uid);
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
