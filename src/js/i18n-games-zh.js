/* ============================================================
   Chinese for the mini-game pages (games/*.html).

   One dictionary for all of them on purpose: they share most of their
   chrome — Score, Best, Game Over, Play Again, Back to Lobby — and a
   file per game would have meant translating those a dozen times and
   drifting a dozen ways.

   Keys are the English source text, as everywhere else; see
   src/js/i18n.js for why. A key with no row here simply renders in
   English, which is the designed fallback rather than a failure.

   Loaded by every mini-game page BEFORE i18n-ui.js, because that file
   sweeps the static markup the moment it runs.
   ============================================================ */
(function () {
  if (typeof I18N === 'undefined') return;
  I18N.register('zh', {

    /* ── Shared chrome ── */
    'Score': '分数',
    'Best': '最高',
    'Best: {n}': '最高：{n}',
    'Coins:': '金币：',
    'Playing as:': '当前玩家：',
    '▶ Play': '▶ 开始',
    'Play!': '开始！',
    'Play Again': '再玩一次',
    '← Back to Lobby': '← 回大厅',
    '🏆 Leaderboard': '🏆 排行榜',
    'Game Over': '游戏结束',
    'You Win!': '你赢了！',
    '⭐ New personal best!': '⭐ 破个人纪录！',
    '⏹ End Game': '⏹ 结束游戏',
    '✖ End Game': '✖ 结束游戏',
    'Sign in to save scores & earn coins': '登录后可以保存成绩、赚金币',
    'Sign in with Google to play.': '用 Google 登录就能玩。',
    'Your score will appear on the leaderboard.': '你的成绩会出现在排行榜上。',
    'Your name will appear on the leaderboard.': '你的名字会出现在排行榜上。',
    'No scores yet — be the first!': '还没有成绩 —— 来抢第一个！',
    // The count is chosen at the call site; Chinese needs no plural, so both
    // forms map to the same sentence.
    '🪙 +1 coin!': '🪙 +1 金币！',
    '🪙 +{n} coins!': '🪙 +{n} 金币！',

    /* ── 2048 ── */
    'Swipe or arrow keys — merge tiles to 2048!': '滑动或方向键 —— 合并到 2048！',
    'Arrow keys or swipe to merge tiles': '方向键或滑动来合并方块',
    '🎉 You reached 2048!': '🎉 你合到 2048 了！',
    'Max Tile:': '最大方块：',

    /* ── Snake ── */
    "Eat food to grow — don't hit yourself!": '吃到食物就变长 —— 别撞到自己！',
    'Length': '长度',
    'Length:': '长度：',
    'PAUSE': '暂停',
    'PAUSED': '已暂停',
    'Press P or Space to pause': '按 P 或空格暂停',

    /* ── Tetris ── */
    'Complete lines to earn coins!': '消行就能赚金币！',
    'Hold': '暂存',
    'HOLD': '暂存',
    'Next': '下一个',
    'Lines': '消行',
    'Lines:': '消行：',
    'Combo': '连击',
    'DROP': '落下',
    '⏸ PAUSE': '⏸ 暂停',
    'Press P or tap to resume': '按 P 或点一下继续',
    '← → Move': '← → 移动',
    '↑ Rotate': '↑ 旋转',
    '↓ Soft Drop': '↓ 慢降',
    'Space Hard Drop': '空格 直落',
    'C Hold': 'C 暂存',
    'P Pause': 'P 暂停',
    '{n}x': '{n} 倍',
    'TETRIS!': '四行消除！',
    'Triple!': '三连消！',
    'Double!': '双消！',
    '{n}x Combo!': '{n} 连击！',

    /* ── Flappy ── */
    '🐦 Flappy Bird': '🐦 Flappy Bird',
    'Tap or press Space to flap!': '点一下或按空格扇翅膀！',
    'Tap / Space / Click to flap': '点击 / 空格 / 鼠标 扇翅膀',
    'Tap / Space / Click': '点击 / 空格 / 鼠标',
    'Tap to start!': '点一下开始！',

    /* ── Block Blast ── */
    '🧩 Block Blast': '🧩 方块爆破',
    'Fill rows & columns to clear — place all 3 blocks!': '填满整行或整列就消除 —— 三块都要放下！',
    'Drag or tap to place blocks': '拖动或点击来放方块',
    '{n}x COMBO!': '{n} 连击！',

    /* ── Feedback Corner ── */
    '💬 Feedback Corner': '💬 意见角',
    'Share your ideas & suggestions anonymously': '匿名说说你的想法和建议',
    '📩 Submit Feedback': '📩 提交意见',
    'Write your feedback, suggestion, or bug report…': '写下你的意见、建议，或者遇到的问题…',
    'Please write some feedback first!': '先写点什么吧！',
    'Feedback is too long (max 1000 chars)': '内容太长了（最多 1000 字）',
    '📩 Feedback submitted! Thank you!': '📩 意见已提交，谢谢！',
    'Failed to submit feedback': '提交失败',
    'All': '全部',
    '⏳ Pending': '⏳ 待处理',
    '🔧 Developing': '🔧 开发中',
    '✅ Done': '✅ 已完成',
    '❌ Rejected': '❌ 已婉拒',
    'No feedback yet — be the first!': '还没有人留意见 —— 来抢第一条！',
    'Developer · {time}': '开发者 · {time}',
    'Leave a dev comment…': '写条开发者回复…',
    'Status updated to {status}': '状态已改为 {status}',
    'Failed to update status': '状态更新失败',
    'Comment too long': '回复太长了',
    'Comment added': '回复已添加',
    'Failed to add comment': '回复添加失败',

    /* ── Rows the room dictionary already has ──
       Same wording deliberately: these pages load i18n-zh-app.js and this
       file, NOT games/room/js/room-i18n-zh.js, so a key that lives only
       there renders in English here. Copied rather than shared because
       shipping the room's 1100 rows to a mini-game page would be worse. */
    '← Back': '← 返回',
    '⚙️ Settings': '⚙️ 设置',
    'Sign in with Google': '用 Google 登录',
    'Coins': '金币',
    'Anonymous': '匿名',
    '🐍 Snake': '🐍 贪吃蛇',
    '🧱 Tetris': '🧱 俄罗斯方块',

    // …and the chess-invite popup every game page carries.
    'Someone': '某人',
    '{name} invites you': '{name}邀请你',
    'Reject': '拒绝',
    'Accept': '接受',
    '{n} coins': '{n} 金币',
    '1 coin': '1 金币',
  });
})();
