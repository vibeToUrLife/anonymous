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

    // Back button: if visiting, go home; else go to index
    document.querySelector('.back-btn').addEventListener('click', (e) => {
      if (viewingUid !== currentUid) {
        e.preventDefault();
        goHome();
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
    function getTodayStr() {
      const d = new Date();
      return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    }

    function showDailyReward() {
      document.getElementById('settingsOverlay').classList.add('hidden');
      const ov = document.getElementById('dailyOverlay');
      ov.classList.remove('hidden');
      const today = getTodayStr();
      const alreadyClaimed = roomData.lastLoginDay === today;
      const streak = roomData.loginStreak || 0;
      document.getElementById('dailyStreak').textContent = '🔥 Current streak: ' + streak + ' day' + (streak !== 1 ? 's' : '');
      let daysHtml = '';
      DAILY_REWARDS.forEach((r, i) => {
        const dayNum = i + 1;
        let cls = '';
        if (dayNum <= streak && alreadyClaimed) cls = 'claimed';
        else if (dayNum === streak + 1 && !alreadyClaimed) cls = 'today';
        else if (dayNum <= streak) cls = 'claimed';
        daysHtml += '<div class="daily-day ' + cls + '"><span class="dd-num">' + r.label + '</span><span class="dd-coins">💰' + r.coins + '</span></div>';
      });
      document.getElementById('dailyDays').innerHTML = daysHtml;
      const btn = document.getElementById('dailyClaimBtn');
      btn.disabled = alreadyClaimed;
      btn.textContent = alreadyClaimed ? '✓ Claimed Today' : 'Claim Today\'s Reward!';
    }

    document.getElementById('dailyClaimBtn').addEventListener('click', async () => {
      const today = getTodayStr();
      if (roomData.lastLoginDay === today) return;
      // Check if streak continues (yesterday)
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
      const yStr = yesterday.getFullYear() + '-' + String(yesterday.getMonth()+1).padStart(2,'0') + '-' + String(yesterday.getDate()).padStart(2,'0');
      let newStreak = (roomData.lastLoginDay === yStr) ? (roomData.loginStreak || 0) + 1 : 1;
      if (newStreak > 7) newStreak = ((newStreak - 1) % 7) + 1;
      const reward = DAILY_REWARDS[Math.min(newStreak, 7) - 1];
      roomData.loginStreak = newStreak;
      roomData.lastLoginDay = today;
      roomData.coins += reward.coins;
      await saveRoom();
      showToast('🎁 Claimed ' + reward.coins + ' coins! Streak: ' + newStreak, 'success');
      checkAchievements();
      showDailyReward();
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
          '<div class="achieve-info"><div class="achieve-name">' + a.name + '</div><div class="achieve-desc">' + a.desc + '</div></div>' +
          '<div class="achieve-status">' + (isUnlocked ? '✓ Unlocked' : '🔒') + '</div></div>';
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
          if (a) showToast('🏆 Achievement: ' + a.name + '!', 'success');
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
        '<textarea class="gb-textarea" id="gbText" placeholder="Leave a message..." maxlength="200" rows="2"></textarea>' +
        '<div class="gb-sticker-row">' +
        GB_STICKERS.map(s => '<button class="gb-sticker-btn" onclick="selectGbSticker(this,\'' + s + '\')">' + s + '</button>').join('') +
        '</div>' +
        '<button class="gb-send-btn" onclick="sendGuestbookMsg()">📝 Post</button></div>';
      html += '<div class="guestbook-list gb-list-target"><div style="text-align:center;color:rgba(255,255,255,.3);font-size:12px;padding:20px">Loading...</div></div>';

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
      if (!text && !_gbSelectedSticker) return showToast('Write something or pick a sticker!', 'error');
      if (text.length > 200) return showToast('Message too long!', 'error');
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
      showToast('📝 Message posted!', 'success');
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
          html = '<div style="text-align:center;color:rgba(255,255,255,.3);font-size:12px;padding:20px">No messages yet. Be the first!</div>';
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
              '<div class="gb-from">' + escapeHtml(e.fromName || 'Anonymous') + '</div>' +
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
                  '<div class="gb-from">' + escapeHtml(r.fromName || 'Anonymous') + '</div>' +
                  '<div class="gb-msg">' + escapeHtml(r.text || '') + '</div>' +
                  '<div class="gb-time">' + getTimeAgo(r.createdAt) + '</div></div>';
              });
              html += '</div>';
            }

            // Reply button
            html += '<button class="gb-reply-btn" onclick="toggleGbReply(this,\'' + e.id + '\')">💬 Reply</button>';
            html += '</div>';
          });
        }
        listEls.forEach(el => el.innerHTML = html);
      } catch(e) { listEls.forEach(el => el.innerHTML = '<div style="color:rgba(255,255,255,.3);font-size:12px;padding:20px">Could not load guestbook</div>'); }
    }

    function toggleGbReply(btn, entryId) {
      const entry = btn.closest('.gb-entry');
      const existing = entry.querySelector('.gb-reply-form');
      if (existing) { existing.remove(); return; }
      const form = document.createElement('div');
      form.className = 'gb-reply-form';
      form.innerHTML = '<input class="gb-reply-input" placeholder="Write a reply..." maxlength="150">' +
        '<button class="gb-reply-send" onclick="sendGbReply(this,\'' + entryId + '\')">Send</button>';
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
      if (!text) return showToast('Write something!', 'error');
      btn.disabled = true;
      const targetUid = viewingUid;
      await db.collection('rooms').doc(targetUid).collection('guestbook').doc(entryId)
        .collection('replies').add({
          fromUid: currentUid,
          fromName: getPlayerName(),
          text: text,
          createdAt: Date.now()
        });
      showToast('💬 Reply sent!', 'success');
      loadGuestbookEntries(targetUid);
    }

    function getTimeAgo(ts) {
      const diff = Date.now() - ts;
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return 'just now';
      if (mins < 60) return mins + 'm ago';
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return hrs + 'h ago';
      const days = Math.floor(hrs / 24);
      return days + 'd ago';
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
      document.getElementById('giftTarget').textContent = 'To: ' + (name || 'Anonymous');
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
      if (_giftTargetUid === currentUid) return showToast('Can\'t gift yourself!', 'error');

      // Always read sender's own coins fresh to avoid visiting-room data confusion
      const senderSnap = await userDocRef(currentUid).get();
      const senderCoins = senderSnap.exists ? (senderSnap.data().coins ?? 0) : 0;
      if (senderCoins < _giftAmount) return showToast('Not enough coins!', 'error');

      // Deduct from sender's own doc directly
      await userDocRef(currentUid).update({
        coins: firebase.firestore.FieldValue.increment(-_giftAmount),
        giftsGiven: firebase.firestore.FieldValue.increment(1),
        updatedAt: Date.now()
      });
      // Update local roomData only if viewing own room
      if (viewingUid === currentUid) {
        roomData.coins -= _giftAmount;
        roomData.giftsGiven = (roomData.giftsGiven || 0) + 1;
        document.getElementById('coinAmount').textContent = roomData.coins;
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
        text: 'Sent a gift of ' + _giftAmount + ' coins! 🎁',
        sticker: '🎁',
        createdAt: Date.now()
      });
      showToast('🎁 Sent ' + _giftAmount + ' coins!', 'success');
      checkAchievements();
      document.getElementById('giftOverlay').classList.add('hidden');
    });

    document.getElementById('giftCloseBtn').addEventListener('click', () => {
      document.getElementById('giftOverlay').classList.add('hidden');
    });

