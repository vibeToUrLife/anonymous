/* ============================================================
   English for the "更多玩法" modals.

   These screens were written in Chinese, so the KEY is Chinese: zh
   finds no entry and correctly returns it unchanged, en looks it up
   and translates. See src/js/i18n.js.
   ============================================================ */
(function () {
  if (typeof I18N === 'undefined') return;
  I18N.register('en', {

    /* ── shared across the modals ── */
    '关闭': 'Close',
    '加载中…': 'Loading…',
    '排行榜加载失败': 'Could not load the board',
    '你': 'you',
    '匿名': 'Anonymous',
    '{n} 分钟': '{n} min',

    /* ── 🏆 富豪榜 ── */
    '富豪榜': 'Rich List',
    '按当前金币余额排名 · 金币越多越靠前 👑': 'Ranked by coins held — the more you have, the higher you sit 👑',
    '还没有人有金币，快去赚第一桶金！': 'Nobody has any coins yet — go earn the first pile!',

    /* ── 🐟 摸鱼榜 ── */
    '摸鱼榜': 'Slacking Board',
    '按在本站摸鱼的总时长排名 · 摸得越久越靠前 🐟👑': 'Ranked by total time spent here — the longer the better 🐟👑',
    '还没有人开始摸鱼，快去摸一会儿吧！🐟': 'Nobody is slacking yet — go put in some quality time 🐟',
    '🐟 有人摸鱼反超你了！摸鱼榜 #{from} → #{to}': '🐟 Someone out-slacked you! Board #{from} → #{to}',
    '🎉 你反超啦！摸鱼榜 #{from} → #{to}': '🎉 You moved up! Board #{from} → #{to}',
    // Slacking ranks, by hours logged
    '新手': 'Rookie',
    '学徒': 'Apprentice',
    '达人': 'Regular',
    '大师': 'Master',
    '宗师': 'Grandmaster',
    '仙人': 'Immortal',

    /* ── 🏺 泡泡罐 ── */
    '泡泡罐': 'Bubble Jar',
    '收藏过的留言 · 跨设备同步': 'Messages you saved · synced across devices',
    '🔍 搜索收藏…': '🔍 Search saved…',
    '罐子还是空的': 'The jar is empty',
    '在任意留言下点 <b>🏺 收藏</b>，留言过期消失后也能在这里回味。':
      'Tap <b>🏺 Save</b> under any message — you can still read it here after it expires.',
    '☁️ 现在会跟着你的账号跨设备同步': '☁️ Now synced to your account across devices',
    '没有匹配的收藏': 'Nothing matches',
    '已经在泡泡罐里啦 🏺': 'Already in the jar 🏺',
    '无法收藏这条留言': "Can't save that one",
    '保存失败 —— 存储空间不够了': 'Save failed — out of storage',
    '🏺 收进泡泡罐了！': '🏺 Into the jar!',
    '同步暂时不可用，稍后再删': 'Sync is down — try deleting later',
    '移出泡泡罐': 'Remove from the jar',
    '点击放大': 'Tap to enlarge',
    '收于 {when}': 'Saved {when}',
    '复制文字': 'Copy text',
    '已复制 ✓': 'Copied ✓',
    '☁️ 同步中…': '☁️ Syncing…',
    '☁️ 已同步': '☁️ Synced',
    '⚠️ 未同步': '⚠️ Not synced',

    /* ── ✏️ 涂鸦墙 ── */
    '涂鸦墙暂时不可用（数据库规则还没更新）': 'The wall is unavailable (database rules not updated yet)',
    '✏️ 画在留言板背景上 · 大家都看得到 · 每天自动清空':
      '✏️ Draw on the board background · everyone sees it · cleared daily',
    '⬡ 点一下定起点，再点一下完成 · Esc / 右键取消':
      '⬡ Tap to start, tap again to finish · Esc / right-click to cancel',
    '🧽 拖动擦掉我自己画的': '🧽 Drag to erase what you drew',
    '✋ 拖动屏幕上下浏览画布 · 选其它工具继续画':
      '✋ Drag to scroll the canvas · pick another tool to keep drawing',
    '🪣 点一下封闭区域填色 · 区域要整个在屏幕里':
      '🪣 Tap a closed area to fill it · the area must fit on screen',
    '这块区域没封闭 · 先把它围起来': "That area isn't closed — seal it first",
    '这块太小了，换个地方点': 'Too small — try somewhere else',
    '自定义颜色': 'Custom colour',
    '画笔（自由涂鸦）': 'Pen (free draw)',
    '直线': 'Line',
    '矩形': 'Rectangle',
    '圆形': 'Circle',
    '三角形': 'Triangle',
    '填色 — 点一下封闭区域，用当前颜色填满': 'Fill — tap a closed area to flood it with the current colour',
    '移动 — 拖动屏幕上下浏览画布': 'Move — drag to scroll the canvas',
    '橡皮擦 — 擦掉我自己画的': 'Eraser — remove what you drew',
    '撤销我画的上一笔': 'Undo my last stroke',
    '完成': 'Done',
    '没有可以撤销的笔画了': 'Nothing left to undo',

    /* ── 🏇 赛马 ── */
    '赛马 · 万能决策': 'Horse Race · decide anything',
    '写下选项让马来决定 — 全站实时一起看': 'Write the options, let the horses decide — everyone watches live',
    '一行一个选项（{min}~{max} 个，每个 ≤{len} 字）。开赛后倒计时 {sec} 秒，全站在线的人都会看到同一场比赛！':
      'One option per line ({min}-{max} of them, {len} characters each). After the off there is a {sec}s countdown, and everyone online sees the same race.',
    '例如：\n奶茶\n咖啡\n柠檬茶\n不喝了省钱': 'e.g.\nMilk tea\nCoffee\nLemon tea\nNothing, save the money',
    '🏁 开赛！': '🏁 Race!',
    '🏁 开赛！（上一场刚结束，{n} 秒后可开）': '🏁 Race! (last one just ended — {n}s to go)',
    '⏱ 比赛进行中 — 点击去观战': '⏱ A race is running — tap to watch',
    '发起新比赛': 'Start a new race',
    '声音开关': 'Sound on/off',
    '领先': 'Leading',
    '冲线': 'At the line',
    '完赛': 'Finished',
    '有人': 'Someone',
    '「{who}」发起了比赛 · {n} 位选手就位': '{who} started a race · {n} runners on the line',
    '🎉 冠军 — {name}': '🎉 Winner — {name}',
    '上一场：': 'Last race:',
    '点击看完整排名 ›': 'Tap for the full result ›',
    '请先登录': 'Sign in first',
    '实时服务不可用': 'Live service unavailable',
    '实时服务不可用，稍后再试': 'Live service unavailable — try again shortly',
    '至少要 {n} 个选项哦': 'You need at least {n} options',
    '最多 {max} 个选项（现在有 {n} 个）': 'At most {max} options (you have {n})',
    '第 {i} 个选项太长了（≤{len} 字）': 'Option {i} is too long (max {len} characters)',
    '开赛失败：可能有比赛正在进行': "Couldn't start — a race may already be running",
  });
})();
