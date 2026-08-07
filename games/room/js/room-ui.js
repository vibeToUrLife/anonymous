    /* ═══════════════════════════════
       Tabs
       ═══════════════════════════════ */
    function switchTab(tabId) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + tabId));
      if (viewingUid === currentUid) renderActiveTab(tabId);
      if (tabId === 'extras') renderGuestbook();
    }

    function switchSubTab(subId) {
      const panel = document.getElementById(subId);
      if (!panel) return;
      const parent = panel.parentElement;
      parent.querySelectorAll('.sub-panel').forEach(p => p.classList.toggle('active', p.id === subId));
      parent.querySelectorAll('.sub-tab').forEach(b => b.classList.toggle('active', b.dataset.sub === subId));
    }

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Sub-tabs (Pet/Plant inside Shop)
    document.querySelectorAll('.sub-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.sub;
        btn.parentElement.querySelectorAll('.sub-tab').forEach(b => b.classList.toggle('active', b === btn));
        btn.parentElement.parentElement.querySelectorAll('.sub-panel').forEach(p => p.classList.toggle('active', p.id === target));
        // Trigger decor shop render when switching to decor tab
        if (target === 'decorShopWrap') renderDecorShop();
        // Refresh the Layer/Floors tab so coin totals and current-layer indicator are up-to-date
        if (target === 'feedLayerWrap') renderUpgrade();

      });
    });

    // Decor sub-tabs (Wall/Window/Art/Furniture/Rug)
    document.querySelectorAll('.decor-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.dcategory;
        const wrap = btn.closest('#decorShopWrap');
        wrap.querySelectorAll('.decor-tab').forEach(b => b.classList.toggle('active', b === btn));
        wrap.querySelectorAll('.decor-panel').forEach(p => {
          p.classList.toggle('active', p.id === 'dp-' + cat);
        });
        _renderDecorCategory(cat);
      });
    });

    // Back button: visiting a farm → back to my own farm (loads my pets);
    // visiting a room → my own room; otherwise the link falls through to the index.
    document.querySelector('.back-btn').addEventListener('click', (e) => {
      if (viewingUid !== currentUid) {
        e.preventDefault();
        if (isFarmView) visitFarm(currentUid);
        else goHome();
      }
    });

    // Panel collapse toggle
    const panelToggle = document.getElementById('panelToggle');
    const panelWrap = document.getElementById('panelWrap');
    const isMobile = () => window.innerWidth <= 768;
    panelToggle.addEventListener('click', () => {
      const collapsed = panelWrap.classList.toggle('collapsed');
      if (isMobile()) {
        panelToggle.textContent = collapsed ? '▲' : '▼';
      } else {
        panelToggle.textContent = collapsed ? '❯' : '❮';
      }
      // Re-render room canvas after transition completes
      setTimeout(() => {
        startRoomBgAnimation();
        // Also restart pet animation if active
        const activePets = getActivePets();
        if (activePets.length) {
          const petInfos = activePets.map(p => ({
            id: p.id, type: p.type,
            hunger: p.hunger ?? 100,
            color: p.color || null
          }));
          startPetAnimation(petInfos);
        }
      }, 320);
    });
    // Set initial toggle icon based on viewport
    if (isMobile()) panelToggle.textContent = '▼';

    /* ═══════════════════════════════
       1. DAILY LOGIN REWARDS
       ═══════════════════════════════ */
    /* The reward day is a FIXED zone for every device, not the local calendar
       day. On local time two devices on one account in different timezones
       disagreed about what "today" was: the second one re-armed the button, and
       because its own "yesterday" no longer matched lastLoginDay it reset the
       streak to 1. Pass a timestamp to ask about another day. */
    const GAME_DAY_OFFSET_MIN = 480;                      // UTC+8, no DST to straddle
    function getTodayStr(ts) {
      const d = new Date((ts == null ? Date.now() : ts) + GAME_DAY_OFFSET_MIN * 60000);
      return d.getUTCFullYear() + '-' + String(d.getUTCMonth()+1).padStart(2,'0') + '-' + String(d.getUTCDate()).padStart(2,'0');
    }

    function showDailyReward() {
      document.getElementById('settingsOverlay').classList.add('hidden');
      const ov = document.getElementById('dailyOverlay');
      ov.classList.remove('hidden');
      const today = getTodayStr();
      const alreadyClaimed = roomData.lastLoginDay === today;
      const streak = roomData.loginStreak || 0;
      document.getElementById('dailyStreak').textContent = '🔥 ' + I18N.plural(streak, 'Current streak: 1 day', 'Current streak: {n} days');
      let daysHtml = '';
      DAILY_REWARDS.forEach((r, i) => {
        const dayNum = i + 1;
        let cls = '';
        if (dayNum <= streak && alreadyClaimed) cls = 'claimed';
        else if (dayNum === streak + 1 && !alreadyClaimed) cls = 'today';
        else if (dayNum <= streak) cls = 'claimed';
        daysHtml += '<div class="daily-day ' + cls + '"><span class="dd-num">' + T(r.label) + '</span><span class="dd-coins">💰' + r.coins + '</span></div>';
      });
      document.getElementById('dailyDays').innerHTML = daysHtml;
      const btn = document.getElementById('dailyClaimBtn');
      btn.disabled = alreadyClaimed;
      btn.textContent = alreadyClaimed ? '✓ ' + T('Claimed Today') : T('Claim Today\'s Reward!');
    }

    /* Claiming is a TRANSACTION against the server document, not a local edit
       followed by a save. Both "has today been claimed?" and the streak come
       from the read inside the transaction, so a second device holding a stale
       lastLoginDay loses the check and walks away with nothing instead of paying
       itself a second time. It also means the streak can't be rewound by a
       device that has been asleep for a week.

       A transaction needs the server, so this fails while offline rather than
       queueing a write that would double-pay on reconnect. The caller says so. */
    async function claimDailyReward() {
      const today = getTodayStr();
      const yStr = getTodayStr(Date.now() - 86400000);
      const ref = userDocRef();
      let out = { claimed: false, reason: 'already' };
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const d = (snap && snap.exists) ? (snap.data() || {}) : {};
        if (d.lastLoginDay === today) {
          out = { claimed: false, reason: 'already', streak: d.loginStreak || 0, balance: Math.floor(d.coins || 0) };
          return;
        }
        let streak = (d.lastLoginDay === yStr) ? (d.loginStreak || 0) + 1 : 1;
        if (streak > 7) streak = ((streak - 1) % 7) + 1;
        const reward = DAILY_REWARDS[Math.min(streak, 7) - 1];
        const balance = Math.floor(d.coins || 0) + reward.coins;
        tx.set(ref, { lastLoginDay: today, loginStreak: streak, coins: balance }, { merge: true });
        out = { claimed: true, reason: 'ok', coins: reward.coins, streak: streak, balance: balance };
      });
      // The transaction is the source of truth for all three numbers — mirror
      // it rather than adding to whatever this device happened to be holding.
      // That runs on the refused path too: the server just said today is taken,
      // so leaving lastLoginDay stale would re-arm the button behind us.
      roomData.lastLoginDay = today;
      roomData.loginStreak = out.streak;
      // Through adoptServerCoins, not a bare assignment: the transaction already
      // banked this balance, so the save that follows must not post the reward
      // again as a delta of its own.
      adoptServerCoins(out.balance);
      if (out.claimed) {
        logCoin(out.coins, T('Daily reward') + ' 🎁');
        await saveRoom();
      }
      return out;
    }

    document.getElementById('dailyClaimBtn').addEventListener('click', async () => {
      const btn = document.getElementById('dailyClaimBtn');
      if (btn.disabled) return;
      btn.disabled = true;                       // no second tap while the write is in flight
      let out;
      try {
        out = await claimDailyReward();
      } catch (e) {
        btn.disabled = false;
        return showToast('🎁 ' + T('Could not reach the server — try again in a moment.'), 'error');
      }
      if (!out.claimed) {
        // Another device got there first. Re-render so the button tells the truth.
        showDailyReward();
        return showToast('🎁 ' + T('Already claimed today on another device.'), '');
      }
      showToast('🎁 ' + T('Claimed {coins} coins! Streak: {n}', { coins: out.coins, n: out.streak }), 'success');
      checkAchievements();
      // Re-render so today's cell flips to "claimed" and the streak updates,
      // then auto-dismiss. Once the reward is claimed there's nothing left to do
      // in here, so we close for the player instead of making them tap Close.
      // The toast already confirms the coins landed.
      showDailyReward();
      setTimeout(() => document.getElementById('dailyOverlay').classList.add('hidden'), 700);
    });

    document.getElementById('dailyCloseBtn').addEventListener('click', () => {
      document.getElementById('dailyOverlay').classList.add('hidden');
    });

    // Auto-show daily reward on login if not yet claimed
    function checkDailyOnLogin() {
      const today = getTodayStr();
      if (roomData.lastLoginDay !== today) {
        setTimeout(() => showDailyReward(), 1200);
      }
    }

    /* ═══════════════════════════════
       2. ACHIEVEMENTS
       ═══════════════════════════════ */
    function showAchievements() {
      document.getElementById('settingsOverlay').classList.add('hidden');
      const ov = document.getElementById('achieveOverlay');
      ov.classList.remove('hidden');
      const unlocked = roomData.achievements || [];
      let html = '';
      ACHIEVEMENTS.forEach(a => {
        const isUnlocked = unlocked.includes(a.id);
        html += '<div class="achieve-item ' + (isUnlocked ? 'unlocked' : '') + '">' +
          '<div class="achieve-icon">' + a.icon + '</div>' +
          '<div class="achieve-info"><div class="achieve-name">' + T(a.name) + '</div><div class="achieve-desc">' + T(a.desc) + '</div></div>' +
          '<div class="achieve-status">' + (isUnlocked ? '✓ ' + T('Unlocked') : '🔒') + '</div></div>';
      });
      document.getElementById('achieveList').innerHTML = html;
    }

    document.getElementById('achieveXBtn').addEventListener('click', () => {
      document.getElementById('achieveOverlay').classList.add('hidden');
    });
    document.getElementById('achieveOverlay').addEventListener('click', (e) => {
      if (e.target === document.getElementById('achieveOverlay')) {
        document.getElementById('achieveOverlay').classList.add('hidden');
      }
    });

    async function checkAchievements() {
      if (viewingUid !== currentUid) return;
      const unlocked = roomData.achievements || [];
      let newUnlocks = [];
      ACHIEVEMENTS.forEach(a => {
        if (!unlocked.includes(a.id) && a.check(roomData)) {
          newUnlocks.push(a.id);
        }
      });
      if (newUnlocks.length) {
        roomData.achievements = [...unlocked, ...newUnlocks];
        await saveRoom();
        newUnlocks.forEach(id => {
          const a = ACHIEVEMENTS.find(x => x.id === id);
          if (a) showToast('🏆 ' + T('Achievement: {name}!', { name: T(a.name) }), 'success');
        });
      }
    }

    /* ═══════════════════════════════
       3. GUESTBOOK
       ═══════════════════════════════ */
    let _gbSelectedSticker = null;

    function renderGuestbook() {
      const isOwner = viewingUid === currentUid;
      const targetUid = viewingUid;

      // Build guestbook HTML
      let html = '<div class="gb-input-area">' +
        '<textarea class="gb-textarea" id="gbText" placeholder="' + T('Leave a message...') + '" maxlength="200" rows="2"></textarea>' +
        '<div class="gb-sticker-row">' +
        GB_STICKERS.map(s => '<button class="gb-sticker-btn" onclick="selectGbSticker(this,\'' + s + '\')">' + s + '</button>').join('') +
        '</div>' +
        '<button class="gb-send-btn" onclick="sendGuestbookMsg()">📝 ' + T('Post') + '</button></div>';
      html += '<div class="guestbook-list gb-list-target"><div style="text-align:center;color:rgba(255,255,255,.3);font-size:12px;padding:20px">' + T('Loading...') + '</div></div>';

      // Owner sees guestbook in Extras tab
      const ownerEl = document.getElementById('guestbookContent');
      if (ownerEl) ownerEl.innerHTML = isOwner ? html : '';

      // Visitor sees guestbook in visit panel
      const visitorWrap = document.getElementById('visitorGuestbook');
      const visitorEl = document.getElementById('visitorGbContent');
      if (visitorWrap && visitorEl) {
        if (!isOwner) {
          visitorWrap.style.display = 'block';
          visitorEl.innerHTML = html;
        } else {
          visitorWrap.style.display = 'none';
          visitorEl.innerHTML = '';
        }
      }

      // Load guestbook entries
      loadGuestbookEntries(targetUid);
    }

    function selectGbSticker(btn, sticker) {
      document.querySelectorAll('.gb-sticker-btn').forEach(b => b.classList.remove('selected'));
      if (_gbSelectedSticker === sticker) {
        _gbSelectedSticker = null;
      } else {
        _gbSelectedSticker = sticker;
        btn.classList.add('selected');
      }
    }

    async function sendGuestbookMsg() {
      const text = (document.getElementById('gbText')?.value || '').trim();
      if (!text && !_gbSelectedSticker) return showToast(T('Write something or pick a sticker!'), 'error');
      if (text.length > 200) return showToast(T('Message too long!'), 'error');
      const targetUid = viewingUid;
      await db.collection('rooms').doc(targetUid).collection('guestbook').add({
        fromUid: currentUid,
        fromName: getPlayerName(),
        text: text,
        sticker: _gbSelectedSticker || null,
        createdAt: Date.now()
      });
      const gbText = document.getElementById('gbText');
      if (gbText) gbText.value = '';
      _gbSelectedSticker = null;
      document.querySelectorAll('.gb-sticker-btn').forEach(b => b.classList.remove('selected'));
      showToast('📝 ' + T('Message posted!'), 'success');
      loadGuestbookEntries(targetUid);
    }

    async function loadGuestbookEntries(uid) {
      const listEls = document.querySelectorAll('.gb-list-target');
      if (!listEls.length) return;
      try {
        const snap = await db.collection('rooms').doc(uid).collection('guestbook')
          .orderBy('createdAt', 'desc').limit(30).get();
        let html;
        if (snap.empty) {
          html = '<div style="text-align:center;color:rgba(255,255,255,.3);font-size:12px;padding:20px">' + T('No messages yet. Be the first!') + '</div>';
        } else {
          html = '';
          const docs = [];
          snap.forEach(doc => docs.push({ id: doc.id, ...doc.data() }));

          // Load only the 3 most recent replies per entry to reduce reads; user can expand on demand
          const replySnaps = await Promise.all(
            docs.map(d => db.collection('rooms').doc(uid).collection('guestbook').doc(d.id)
              .collection('replies').orderBy('createdAt', 'desc').limit(3).get())
          );

          docs.forEach((e, idx) => {
            const timeAgo = getTimeAgo(e.createdAt);
            html += '<div class="gb-entry" data-gb-id="' + e.id + '">' +
              (e.sticker ? '<div class="gb-sticker">' + e.sticker + '</div>' : '') +
              '<div class="gb-from">' + escapeHtml(e.fromName || T('Anonymous')) + '</div>' +
              (e.text ? '<div class="gb-msg">' + escapeHtml(e.text) + '</div>' : '') +
              '<div class="gb-time">' + timeAgo + '</div>';

            // Replies (fetched desc, reverse to chronological)
            const replies = [];
            replySnaps[idx].forEach(r => replies.push(r.data()));
            replies.reverse();
            if (replies.length) {
              html += '<div class="gb-replies">';
              replies.forEach(r => {
                html += '<div class="gb-reply">' +
                  '<div class="gb-from">' + escapeHtml(r.fromName || T('Anonymous')) + '</div>' +
                  '<div class="gb-msg">' + escapeHtml(r.text || '') + '</div>' +
                  '<div class="gb-time">' + getTimeAgo(r.createdAt) + '</div></div>';
              });
              html += '</div>';
            }

            // Reply button
            html += '<button class="gb-reply-btn" onclick="toggleGbReply(this,\'' + e.id + '\')">💬 ' + T('Reply') + '</button>';
            html += '</div>';
          });
        }
        listEls.forEach(el => el.innerHTML = html);
      } catch(e) { listEls.forEach(el => el.innerHTML = '<div style="color:rgba(255,255,255,.3);font-size:12px;padding:20px">' + T('Could not load guestbook') + '</div>'); }
    }

    function toggleGbReply(btn, entryId) {
      const entry = btn.closest('.gb-entry');
      const existing = entry.querySelector('.gb-reply-form');
      if (existing) { existing.remove(); return; }
      const form = document.createElement('div');
      form.className = 'gb-reply-form';
      form.innerHTML = '<input class="gb-reply-input" placeholder="' + T('Write a reply...') + '" maxlength="150">' +
        '<button class="gb-reply-send" onclick="sendGbReply(this,\'' + entryId + '\')">' + T('Send') + '</button>';
      entry.appendChild(form);
      const input = form.querySelector('input');
      input.focus();
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); sendGbReply(form.querySelector('.gb-reply-send'), entryId); }
      });
    }

    async function sendGbReply(btn, entryId) {
      const form = btn.closest('.gb-reply-form');
      const input = form.querySelector('input');
      const text = (input.value || '').trim();
      if (!text) return showToast(T('Write something!'), 'error');
      btn.disabled = true;
      const targetUid = viewingUid;
      await db.collection('rooms').doc(targetUid).collection('guestbook').doc(entryId)
        .collection('replies').add({
          fromUid: currentUid,
          fromName: getPlayerName(),
          text: text,
          createdAt: Date.now()
        });
      showToast('💬 ' + T('Reply sent!'), 'success');
      loadGuestbookEntries(targetUid);
    }

    function getTimeAgo(ts) {
      const diff = Date.now() - ts;
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return T('just now');
      if (mins < 60) return T('{n}m ago', { n: mins });
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return T('{n}h ago', { n: hrs });
      const days = Math.floor(hrs / 24);
      return T('{n}d ago', { n: days });
    }

    /* ═══════════════════════════════
       4. GIFT SYSTEM
       ═══════════════════════════════ */
    let _giftTargetUid = null;
    let _giftAmount = 0;
    const GIFT_AMOUNTS = [10, 50, 100, 250, 500];

    function showGiftModal(uid, name) {
      _giftTargetUid = uid;
      _giftAmount = 0;
      document.getElementById('giftTarget').textContent = T('To: {name}', { name: name || T('Anonymous') });
      const el = document.getElementById('giftAmounts');
      el.innerHTML = GIFT_AMOUNTS.map(a =>
        '<div class="gift-amt" onclick="selectGiftAmount(this,' + a + ')">💰 ' + a + '</div>'
      ).join('');
      document.getElementById('giftSendBtn').disabled = true;
      document.getElementById('giftOverlay').classList.remove('hidden');
    }

    function selectGiftAmount(el, amount) {
      _giftAmount = amount;
      document.querySelectorAll('.gift-amt').forEach(e => e.classList.remove('selected'));
      el.classList.add('selected');
      // Always use own coins for affordability check (roomData.coins may be visited user's)
      document.getElementById('giftSendBtn').disabled = false; // enabled, actual balance checked on send
    }

    document.getElementById('giftSendBtn').addEventListener('click', async () => {
      if (!_giftTargetUid || _giftAmount <= 0) return;
      if (_giftTargetUid === currentUid) return showToast(T('Can\'t gift yourself!'), 'error');

      // Always read sender's own coins fresh to avoid visiting-room data confusion
      const senderSnap = await userDocRef(currentUid).get();
      const senderCoins = senderSnap.exists ? (senderSnap.data().coins ?? 0) : 0;
      if (senderCoins < _giftAmount) return showToast(T('Not enough coins!'), 'error');

      // Deduct from sender's own doc directly
      await userDocRef(currentUid).update({
        coins: firebase.firestore.FieldValue.increment(-_giftAmount),
        giftsGiven: firebase.firestore.FieldValue.increment(1),
        updatedAt: Date.now()
      });
      // Update local roomData only if viewing own room
      if (viewingUid === currentUid) {
        // The increment above already took it out of the document — adopt the
        // deduction so the next save doesn't charge for the gift twice.
        adoptServerCoinDelta(-_giftAmount);
        logCoin(-_giftAmount, T('Gift sent') + ' 🎁');
        roomData.giftsGiven = (roomData.giftsGiven || 0) + 1;
        document.getElementById('coinAmount').textContent = roomData.coins;
        // Persist the log row and the counter now rather than leaving them to
        // whatever saves next. The coins themselves are already gone from the
        // document (the increment above), so closing the tab here left a
        // deduction with nothing to explain it.
        saveRoom();
      }
      // Add coins to target
      await db.collection('rooms').doc(_giftTargetUid).update({
        coins: firebase.firestore.FieldValue.increment(_giftAmount),
        giftsReceived: firebase.firestore.FieldValue.increment(1)
      });
      // Leave guestbook entry
      await db.collection('rooms').doc(_giftTargetUid).collection('guestbook').add({
        fromUid: currentUid,
        fromName: getPlayerName(),
        text: T('Sent a gift of {n} coins!', { n: _giftAmount }) + ' 🎁',
        sticker: '🎁',
        createdAt: Date.now()
      });
      showToast('🎁 ' + T('Sent {n} coins!', { n: _giftAmount }), 'success');
      checkAchievements();
      document.getElementById('giftOverlay').classList.add('hidden');
    });

    document.getElementById('giftCloseBtn').addEventListener('click', () => {
      document.getElementById('giftOverlay').classList.add('hidden');
    });

