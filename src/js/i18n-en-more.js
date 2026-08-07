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

    /* ── 🏖️ 假期列表 ── */
    '假期列表': 'Holidays',
    // Weekday + clock parts. Kept as separate keys because the countdown
    // assembles them, and English wants different spacing than Chinese.
    '周日': 'Sun', '周一': 'Mon', '周二': 'Tue', '周三': 'Wed',
    '周四': 'Thu', '周五': 'Fri', '周六': 'Sat',
    '上午': 'am', '下午': 'pm',
    '天': 'd', '小时': 'h', '分': 'm', '秒': 's', '后': ' left',
    '{h}小时{m}分': '{h}h {m}m',
    '{m}分{s}秒': '{m}m {s}s',
    '{s}秒': '{s}s',
    '共 {n} 天': '{n} days total',
    '{y}年{m}月': '{m}/{y}',
    '距离放假': 'Until the break',
    '下一个假期': 'Next holiday',
    '🔒 私密假期 · 只有你看得到': '🔒 Private holiday · only you see it',
    '🔒 只有你看得到': '🔒 Only you',
    '{who} 添加': 'added by {who}',
    '→ 点结束日期': '→ tap the end date',
    '选日期（可以选连续几天）': 'Pick a date (a run of days works too)',
    '点选放假第一天': 'Tap the first day off',
    '再点最后一天（点同一天＝只放一天）': 'Now tap the last day (same day = one day off)',
    '选时间（可不选，几点开始放假）': 'Pick a time (optional — when the break starts)',
    '点表盘选小时': 'Tap the face for the hour',
    '点表盘选分钟': 'Tap the face for the minutes',
    '不设时间': 'No time',
    '确定': 'Done',
    '公开': 'Public',
    '大家都看得到': 'Everyone sees it',
    '私密': 'Private',
    '只有你看得到': 'Only you see it',
    '✏️ 编辑假期': '✏️ Edit holiday',
    '➕ 添加假期': '➕ Add a holiday',
    '假期名字（如：请年假去玩）': 'Name it (e.g. annual leave trip)',
    '💾 保存修改': '💾 Save changes',
    '加进倒数表': 'Add to the countdown',
    '取消': 'Cancel',
    '🏝️ 数着日子等放假 · 假期由大家一起添加和管理':
      '🏝️ Counting down to time off · everyone adds and manages these',
    '还没有假期在倒数 🏖️<br>加一个假期，大家一起等放假吧！':
      'Nothing to count down to yet 🏖️<br>Add a holiday and everyone can wait together!',
    '假期加载中…': 'Loading holidays…',
    '后续假期': 'Coming up',
    '公开假期实时同步、所有人共享，任何人都可以添加或移除；<br>🔒 私密假期只有你自己看得到。':
      'Public holidays sync live and are shared — anyone may add or remove one.<br>🔒 Private ones are yours alone.',
    '给假期起个名字吧': 'Give the holiday a name',
    '选一个日期': 'Pick a date',
    '请选择明天或以后的日期': 'Pick tomorrow or later',
    '请先登录再添加假期': 'Sign in before adding a holiday',
    '请先登录再操作': 'Sign in first',
    '✏️ 已保存修改': '✏️ Changes saved',
    '🔒 已加入你的私密假期倒数': '🔒 Added to your private countdown',
    '📌 已加入假期倒数，大家都看得到啦': '📌 Added — everyone can see it now',
    '保存失败，稍后再试': 'Save failed — try again shortly',
    '添加失败，稍后再试': 'Could not add it — try again shortly',
    '移除失败，稍后再试': 'Could not remove it — try again shortly',
    '★ 假 期 预 告 ★': '★ H O L I D A Y  A H E A D ★',
    '▶ 点一下关闭 ◀': '▶ TAP TO CLOSE ◀',
    '还有 <b>{n}</b> 天': '<b>{n}</b> days to go',

    /* ── 🎰 金币乐园 ── */
    '用金币换装扮': 'Spend coins on cosmetics',
    '商店': 'Shop',
    '扭蛋': 'Gacha',
    '老虎机': 'Slots',
    '土豪榜': 'Big Spenders',
    '特效': 'Effects',
    '求签': 'Fortune',

    // Coin history
    '金币记录': 'Coin history',
    '刚刚': 'just now',
    '{n} 分钟前': '{n} min ago',
    '{n} 小时前': '{n} h ago',
    '{n} 天前': '{n} d ago',
    '{m}月{d}日': '{m}/{d}',
    '加载失败，请重试': 'Failed to load — try again',
    '还没有金币记录～': 'No coin history yet',
    '消费或赚取金币后会显示在这里': 'Spending or earning coins will show up here',
    '金币': 'Coins',
    '下一页（还剩 {n} 条）': 'Next page ({n} more)',
    '开发者': 'Developer',
    '商店：{name}': 'Shop: {name}',
    '装扮': 'cosmetic',
    '扭蛋抽奖（返还 {n}）': 'Gacha pull (refund {n})',
    '扭蛋抽奖': 'Gacha pull',
    '老虎机中奖': 'Slots win',
    '置顶冲榜': 'Pin & burn',
    '每日求签': 'Daily fortune',
    '每日求签（返还 {n}）': 'Daily fortune (refund {n})',

    // 土豪榜 + burn
    '按累计消费金币排名 · 烧得越多越靠前 💸': 'Ranked by coins burned — the more you spend, the higher you sit 💸',
    '📌 本榜单仅统计「本页面（金币乐园）」的消费，房间 / 地铁等其他页面的消费不计入':
      '📌 Only spending on this page (Coin Park) counts — the room, Subway Dash and the rest do not',
    '🔥 烧钱冲榜': '🔥 Burn to climb',
    '烧钱冲榜': 'Burn to climb',
    '还没有人消费，快来当第一个土豪！': 'Nobody has spent a thing — be the first big spender!',
    ' (你)': ' (you)',
    '确定要烧掉 <b>{amount}</b> 金币来冲榜吗？': 'Burn <b>{amount}</b> coins to climb the board?',
    '⚠️ 金币将永久消耗，不会退还！': '⚠️ These coins are gone for good — no refunds!',
    '确定烧掉': 'Burn them',
    '🔥 烧掉 {n} 金币，冲榜！': '🔥 Burned {n} coins — up you go!',

    // Effects, awards, boost
    '放一个全屏特效，所有在线的人都能看到！🎆': 'Set off a full-screen effect everyone online will see! 🎆',
    '特效：{name}': 'Effect: {name}',
    '🎆 特效已发射！': '🎆 Effect launched!',
    '🏆 打赏这条留言': '🏆 Award this message',
    '为喜欢的留言点亮一枚奖章，让大家看到你的支持 ✨': 'Pin a medal on a message you like so everyone sees your support ✨',
    '💡 打赏仅用于支持这条留言，会显示你的名字；金币不会退还，也不会获得任何回报哦～':
      '💡 An award just supports the message and shows your name. The coins are not refunded and buy you nothing else.',
    '🏆 打赏成功！': '🏆 Awarded!',
    '⭐ 置顶这条留言': '⭐ Pin this message',
    '置顶后会浮到留言板最上方并高亮显示': 'It floats to the top of the board and gets highlighted',
    '⭐ 置顶成功！': '⭐ Pinned!',

    // Fortune
    '上上签': 'Great fortune',
    '上签': 'Good fortune',
    '返还 {n}': 'refund {n}',
    '今天已经求过签啦，明天再来～': "You've drawn today — come back tomorrow",
    '今天已经求过签啦～': "Already drawn today",
    '每天可求一签 {cost} · 抽中稀有签返还金币': 'One draw a day for {cost} · a rare fortune refunds coins',
    '🎋 求一签': '🎋 Draw',
    '求签中': 'Drawing',
    '🎉 抽中 {tier}！': '🎉 You drew {tier}!',

    // Shop + gacha
    '名字': 'Name',
    '气泡': 'Bubble',
    '泡': 'B',
    '点一下预览': 'Tap to preview',
    '购买装扮，装备后会显示在你的留言上 ✨': 'Buy a look — once equipped it shows on your messages ✨',
    '已拥有': 'Owned',
    '已装备 ✓': 'Equipped ✓',
    '装备': 'Equip',
    '传说 2% · 史诗 8% · 稀有 30% · 普通 60%': 'Legendary 2% · Epic 8% · Rare 30% · Common 60%',
    '🎲 查看奖池 / 概率': '🎲 Pool & odds',
    '🎲 扭蛋奖池 &amp; 概率': '🎲 Gacha pool &amp; odds',
    '奖池整体：传说 2% · 史诗 8% · 稀有 30% · 普通 60%（同稀有度平分）':
      'Whole pool: Legendary 2% · Epic 8% · Rare 30% · Common 60% (even within a tier)',
    '抽一次 {cost}': 'One pull {cost}',
    '抽十次 {cost}': 'Ten pulls {cost}',
    '抽到重复的装扮返还 {n}': 'A duplicate refunds {n}',
    '重复 +{n}': 'Dup +{n}',
    '购买成功 🎉': 'Bought 🎉',
    '已经拥有啦': 'You already own that',
    '恭喜获得 {n} 件新装扮！': '{n} new looks — nice!',
    '又是重复的…再来！': 'All duplicates… go again!',

    // Slots
    '🎰 拉一把': '🎰 Pull',
    '三个一样 = 大奖 · 两个🍒 = 小奖 · 三个7️⃣ = 头奖×100':
      'Three of a kind = big win · two 🍒 = small win · three 7️⃣ = jackpot ×100',
    '🎉 中奖 +{n} 金币！': '🎉 You won +{n} coins!',
    '🎰 中奖 +{n} 金币！': '🎰 You won +{n} coins!',
    '差一点，再来一把～': 'So close — one more?',

    // Shared errors
    '金币不足': 'Not enough coins',
    '出错了': 'Something went wrong',

    /* ── 🧠 每日脑筋急转弯 ──
       The riddles themselves stay Chinese: they turn on Chinese wordplay and
       have no English equivalent. Only the chrome around them switches. */
    '答案：{list}（都算对）': 'Answer: {list} (any of these)',
    '答案：{a}': 'Answer: {a}',
    '（答案 {n} 个字）': '({n} characters)',
    '✅ 今天已经答对啦，奖励已到账！': '✅ Already solved today — the reward has landed!',
    '🪙 明天再来挑战，再赚 100 金币！': '🪙 Come back tomorrow for another 100 coins!',
    '今天已看过答案，明天再来赚金币吧～': "You've seen today's answer — come back tomorrow to earn",
    '🪙 明天答对可得 100 金币': '🪙 Solve it tomorrow for 100 coins',
    '❌ 再想想~ 可以点"💡 提示"哦': '❌ Have another think — there is a "💡 Hint" button',
    '🎉 答对了！': '🎉 Correct!',
    '🎉 答对了！+100 金币 🪙': '🎉 Correct! +100 coins 🪙',
    '🧠 答对脑筋急转弯，+100 金币！': '🧠 Riddle solved — +100 coins!',
    '脑筋急转弯': 'Daily riddle',                        // the coin-log row for the reward
    '🪙 已领取今日奖励，明天再来！': "🪙 Today's reward is claimed — see you tomorrow!",
    '🎉 答对了！(今天已领过奖励)': '🎉 Correct! (reward already claimed today)',
    '🪙 今天的奖励已经领过啦': "🪙 Today's reward has been claimed",
    '🎉 答对了！(登录后才能领取金币)': '🎉 Correct! (sign in to collect the coins)',
    '🪙 登录后答对可得 100 金币': '🪙 Sign in and a correct answer pays 100 coins',
    '⚠️ 确定看答案？(放弃今天机会)': "⚠️ Reveal the answer? (that's today's attempt gone)",
    '答案已揭晓，明天再来赚金币吧～': 'Answer revealed — come back tomorrow to earn',
    '还没有人答对，快来抢首位！': 'Nobody has solved it yet — take first place!',
    '今日答对（{n}）': "Solved today ({n})",
    '{n} 次': '{n}x',
    '还没有人上榜，答对就能登顶！': 'The board is empty — one right answer puts you on top!',
    '🏅 答对排行榜（累计）': '🏅 All-time solvers',

    /* ── 🐉 每日成语接龙 ──
       The idioms are Chinese by nature; only the surrounding UI switches. */
    '要输入四个汉字的成语': 'Enter a four-character idiom',
    '这不是成语（成语库里查不到）': "That isn't in the idiom dictionary",
    '这个成语已经用过了': 'That idiom has already been used',
    '接不上「{ch}」（首字要相同或同音）': "Doesn't follow 「{ch}」 — the first character must match or rhyme",
    '系统': 'System',
    '收起 ▴': 'Collapse ▴',
    '展开全部（{n}）▾': 'Show all ({n}) ▾',
    '接龙：下一个要接「{ch}」（首字相同或同音）': 'Next one must start with 「{ch}」 (same character or homophone)',
    '🏆 答对榜': '🏆 Correct answers',
    '还没有人答错～': 'No wrong answers yet',
    '❌ 答错记录': '❌ Wrong answers',
    '玩法与奖励说明': 'How it works & rewards',
    '📖 每接对一个成语 +1 个，比谁一周接得多': '📖 Each correct idiom is +1 — most in a week wins',
    '🗓️ 每周日 00:00 刷新新一周榜单': '🗓️ A new week starts Sunday 00:00',
    '🏆 每周结算：上周前三名自动到账 🥇{a} / 🥈{b} / 🥉{c} 金币 💰':
      "🏆 Weekly payout: last week's top three are paid 🥇{a} / 🥈{b} / 🥉{c} coins 💰",
    '上周获奖：': 'Last week:',
    '{n} 个': '{n}',
    '本周还没有人上榜，接对就能登顶！': "Nobody on this week's board yet — one link puts you on top!",
    '🏅 本周答对榜': '🏅 This week',
    '🎉 接上了！+{n} 金币 💰': '🎉 Linked! +{n} coins 💰',
    '🐉 成语接龙 +{n} 金币！': '🐉 Idiom chain +{n} coins!',
    '请先登录再玩哦': 'Sign in to play',
    '🐢 手慢了，接龙刚被接走，请接「{ch}」': '🐢 Too slow — someone linked first. Now follow 「{ch}」',
    '出错了，请再试一次': 'Something went wrong — try again',
    '🔄 换了个新开头，开始接「{ch}」': '🔄 New starting idiom — follow 「{ch}」',
    '接龙已经开始啦，不能再换开头咯': 'The chain has started — the opener is locked in',
  });
})();
