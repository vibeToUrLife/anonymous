/* ============================================================
   The board pages (index.html), both directions.

   Most of this app's markup is English, so the key is the English and
   the zh block translates it. But parts of index.html were WRITTEN in
   Chinese — there the key is Chinese, zh finds nothing and correctly
   returns it as-is, and the en block translates it. See src/js/i18n.js.
   ============================================================ */
(function () {
  if (typeof I18N === 'undefined') return;

  /* ── English keys → Chinese ── */
  I18N.register('zh', {
    // Gate & sign-in
    'Anonymous Bubble Answers': '匿名泡泡留言板',
    '(dev only)': '（仅开发者）',
    'Flappy Bird': 'Flappy Bird',
    'Anonymous Bubble Answers v1.0': '匿名泡泡留言板 v1.0',
    'Enter Access Code': '输入访问码',
    'This site requires an access code to enter.': '进入本站需要访问码。',
    'Enter code…': '输入访问码…',
    'Enter': '进入',
    'Welcome': '欢迎',
    'Sign in with Google to continue.': '用 Google 账号登录后继续。',
    'Everything stays anonymous — your identity is never shown.': '全程匿名 — 你的身份不会被显示。',

    // Settings
    'Settings': '设置',
    'Language': '语言',
    'Minigame Display Name': '小游戏昵称',
    'Your name': '你的名字',
    'Save': '保存',
    'Notifications': '通知',
    '🔔 Push Notifications': '🔔 推送通知',
    '🔊 Notification Sound': '🔊 提示音',
    'Appearance — Theme': '外观 — 主题',
    'Font Size': '字号',
    'Small': '小',
    'Medium': '中',
    'Large': '大',
    '💬 Bubble Animations': '💬 气泡动画',
    '🐾 Walking Pet': '🐾 走动的宠物',
    'Data': '数据',
    '🗑️ Clear Local Cache': '🗑️ 清除本地缓存',
    '📣 What\'s New Editor': '📣 更新公告编辑器',
    'Version key e.g. v3': '版本号，例如 v3',
    'Bump the version to make all users see the popup again.': '改版本号可以让所有人重新看到弹窗。',
    'Badge text e.g. 🆕 What\'s New': '角标文字，例如 🆕 有更新',
    'Each line becomes one bullet in the popup.': '每一行会变成弹窗里的一条。',
    '💾 Save & Publish': '💾 保存并发布',
    '🚶 Sign Out': '🚶 退出登录',
    'Close': '关闭',
    'Cancel': '取消',
    'Toggle menu': '展开/收起菜单',
    'Dismiss': '关掉',

    // Off-work countdown & food
    '⏳ Countdown to Off Work': '⏳ 下班倒计时',
    'Set': '设定',
    '🔄 Clear countdown': '🔄 清除倒计时',
    'Default: Mon–Fri, 9 AM → 12:30 PM | 2 PM → 6 PM': '默认：周一至周五 9:00 → 12:30 ｜ 14:00 → 18:00',
    'What to Eat?': '吃什么？',
    '🍴 Food & Vote': '🍔 美食投票',
    'e.g. Nasi Lemak': '例如：椰浆饭',
    '🎲 Spin & Decide!': '🎲 转一转，帮你决定！',
    'Press the button!': '按下按钮！',
    '❌ Remove from spin': '❌ 从转盘移除',
    '🔄 Restore removed food': '🔄 恢复已移除的选项',
    'No suggestions yet': '还没有人推荐',
    'Off work in': '距离下班',
    'at 6:00 PM': '18:00 下班',
    'OFF WORK!': '下班啦！',
    'Time to go home! You did great today 💪': '可以回家了！今天辛苦了 💪',
    'Got it! 👍': '知道啦！👍',

    // My spaces
    'My Room': '我的房间',
    'Pets, plants & decor': '宠物、植物与装饰',
    'My Farm': '我的农场',
    'Animals, crops & coins': '动物、作物与金币',
    'My Aquarium': '我的水族馆',
    'Your Fishing collection': '你钓上来的收藏',

    // Minigames
    '🎮 Mini Games': '🎮 小游戏',
    'Tap to fly — beat the high score!': '点击起飞 — 冲高分！',
    'Tetris': '俄罗斯方块',
    'Clear lines, earn coins, chain combos!': '消行赚币，连击更爽！',
    'Challenge friends — bet coins & play!': '和朋友对战 — 押金币开局！',
    'Eat, grow, survive — earn coins!': '吃、变长、活下去 — 还能赚币！',
    'Block Blast': '方块爆破',
    'Fill rows & columns — combo for coins!': '填满行列 — 连击换金币！',
    'Swipe & merge tiles to 2048!': '滑动合并，冲到 2048！',
    'Fishing': '钓鱼',
    'Cast your line — catch fish for coins!': '抛竿下钩 — 钓鱼换金币！',
    'TOTO Lottery': 'TOTO 彩票',
    'Daily 4-digit draw — bet coins, win big!': '每日四位数开奖 — 押金币，博大奖！',
    'Subway Dash': '地铁跑酷',
    'Run, jump & roll — dodge the trains!': '跑跳翻滚 — 躲开列车！',

    // Board
    'Answers disappear after 6 hours ⌛': '留言 6 小时后消失 ⌛',
    '📌 Upcoming Events': '📌 近期活动',
    '+ Pin event': '+ 钉一个活动',
    '📌 Pin it': '📌 钉住',
    'Type your anonymous answer…': '匿名说点什么…',
    'Send': '发送',
    'Attach image': '添加图片',
    'Search GIFs': '搜索 GIF',
    'Search GIFs…': '搜索 GIF…',
    'Search for a GIF above': '在上面搜一个 GIF',
    'Powered by GIPHY': '由 GIPHY 提供',
    'Remove image': '移除图片',
    'Hide tools': '收起工具',
    'Toggle tools': '展开/收起工具',
    '+ Add option': '+ 加一个选项',
    '📊 Post Poll': '📊 发起投票',
    'Scroll to zoom · Drag to pan · Tap outside to close': '滚轮缩放 · 拖动平移 · 点外面关闭',
    'Feedback Corner': '意见箱',
    'Coin Rush': '金币狂潮',
    'Join': '参加',
    'How to play': '玩法说明',
    'How are you feeling today?': '今天心情如何？',
    'Collapse buttons': '收起按钮',
    'Tap to close': '点击关闭',
    '!! UPCOMING EVENT !!': '!! 活动预告 !!',
    '▶ PRESS ANYWHERE TO CLOSE ◀': '▶ 点任意处关闭 ◀',
    'You got:': '你获得了：',
    'One update item per line (plain text or HTML)\ne.g. 💬 <strong>New feature</strong> — description here.': '每行一条更新（纯文本或 HTML）\n例如 💬 <strong>新功能</strong> — 这里写说明。',
    'Type your message — press Enter for a new line\ne.g.\n25/07/2026 6.30pm\nMarjorie Hotel, Penang\nBirthday Event': '写点什么 — 回车换行\n例如：\n25/07/2026 晚上 6:30\n槟城 Marjorie 酒店\n生日会',

    /* ══ Board runtime: sign-in & access ══ */
    'Login failed: {msg}': '登录失败：{msg}',
    'Unknown error': '未知错误',
    'Access blocked': '访问已被封禁',
    'Your account has been blocked from this site. If you think this is a mistake, please contact the admin.':
      '你的账号已被本站封禁。如果你觉得这是误判，请联系管理员。',
    'Too many incorrect attempts. This account is locked — please contact the admin.':
      '错误次数太多，这个账号已被锁定 —— 请联系管理员。',
    'Please enter the access code.': '请输入访问码。',
    'Could not load the gate. Please try again.': '入口加载失败，请再试一次。',
    'Sign out': '退出登录',

    /* ══ Board runtime: bubbles ══ */
    'No answers yet — be the first!': '还没有人回答 —— 来抢第一个！',
    'expiring…': '快消失了…',
    '{h}h {m}m left': '还剩 {h} 小时 {m} 分',
    '{n}m left': '还剩 {n} 分',
    'HP {n}%': 'HP {n}%',
    'image': '图片',
    'reply image': '回复图片',
    'Answer sent!': '发出去了！',
    'Failed to send — try again': '发送失败 —— 再试一次',
    'Max 500 characters': '最多 500 字',
    'Max 100 characters': '最多 100 字',
    'Connection error — check console (F12)': '连接出错 —— 按 F12 看控制台',

    /* ══ Board runtime: replies ══
       The ↪ is part of the label, not decoration — keep it in front. */
    '💬 Reply': '💬 回复',
    '💬 Reply ({n})': '💬 回复（{n}）',
    '↪ Reply': '↪ 回复',
    '↪ Cancel': '↪ 取消',
    'Show thread ({n})': '↪ 展开 {n} 条',
    'Hide thread ({n})': '↪ 收起 {n} 条',
    'Write a reply…': '写个回复…',
    'Reply anonymously': '匿名回复',
    'Reply failed': '回复失败',

    /* ══ Board runtime: reactions ══ */
    'React': '加表情',
    'Reaction failed': '表情没发出去',

    /* ══ Board runtime: images & GIFs ══ */
    'GIF too large (max 500KB). Try a smaller GIF': 'GIF 太大了（最多 500KB），换张小一点的',
    'Failed to load image': '图片加载失败',
    'Failed to load pasted image': '粘贴的图片加载失败',
    'Loading…': '加载中…',
    'Failed to load GIFs': 'GIF 加载失败',
    'Searching…': '搜索中…',
    'Search failed': '搜索失败',
    'No GIFs found': '没找到 GIF',

    /* ══ Board runtime: polls ══ */
    'Poll': '投票',
    'Enter a question': '先写个问题',
    'Add at least 2 options': '至少要 2 个选项',
    'Max 10 options': '最多 10 个选项',
    'Option {n}': '选项 {n}',
    'Add an option…': '加个选项…',
    '+ Add': '+ 添加',
    'Option added!': '选项加好了！',
    'Option already exists': '这个选项已经有了',
    'Failed to add option': '选项添加失败',
    'Poll posted!': '投票发出去了！',
    'Failed to post poll': '投票发送失败',
    'Sign in to vote': '登录后才能投票',
    'Vote failed': '投票失败',

    /* ══ Board runtime: the space cards (room / farm / aquarium / world) ══ */
    'Join Pet World': '进入宠物世界',
    'Come hang out together →': '一起来玩 →',
    '{owner}’s {label}': '{owner}的{label}',
    '{verb} this {label} →': '{verb}这个{label} →',

    /* ══ Board runtime: food vote & spinner ══ */
    'Food added!': '加好了！',
    'Failed to add — try again': '添加失败 —— 再试一次',
    'Delete': '删除',
    'Delete "{name}" from the list?': '把「{name}」从列表里删掉？',
    'Deleted!': '删掉了！',
    'Delete failed': '删除失败',
    'Vote counted!': '投票成功！',
    'Vote removed': '取消投票了',
    'Vote failed — try again': '投票失败 —— 再试一次',
    'No food to spin!': '没有可以转的选项！',
    'Removed from list!': '从列表里移掉了！',
    'Remove failed': '移除失败',
    'Spin again!': '再转一次！',
    'All removed food restored!': '移掉的都恢复了！',
    'Restore failed': '恢复失败',
    '🔄 Votes reset for today ({date})': '🔄 今天的投票已重置（{date}）',
    'Votes reset daily at 12:00 AM': '投票每天 0:00 重置',

    /* ══ Board runtime: settings & notifications ══ */
    'Name must be 1-20 characters': '名字要 1-20 个字',
    'Saving…': '保存中…',
    '✓ Name updated!': '✓ 名字改好了！',
    'Failed to save — try again': '保存失败 —— 再试一次',
    'Notifications enabled! 🔔': '通知已开启！🔔',
    'In-app notifications enabled! 🔔': '站内通知已开启！🔔',
    'Notifications disabled': '通知已关闭',
    'Notifications blocked — enable in browser settings': '通知被拦截了 —— 去浏览器设置里开启',
    'Notifications blocked by browser': '浏览器拦截了通知',
    'Sound on 🔊': '声音已开 🔊',
    'Sound muted 🔇': '已静音 🔇',
    'Cache cleared!': '缓存清好了！',
    '({n}) New message!': '（{n}）有新消息！',
    'New Anonymous Message': '新的匿名留言',
    'New Reply': '新回复',
    '📷 Image message': '📷 图片留言',
    '📷 Image reply': '📷 图片回复',
    '{n} new — {body}': '{n} 条新消息 —— {body}',

    /* ══ Board runtime: the clock & countdown ══
       Chinese puts 上午/下午 BEFORE the digits, which is exactly why the whole
       reading is one key instead of a meridiem glued on the end. */
    '{h}:{m} AM': '上午{h}:{m}',
    '{h}:{m} PM': '下午{h}:{m}',
    'Lunch in': '午饭还有',
    'at {time}': '{time}',
    '🍽️ Lunch time! 🍽️': '🍽️ 午饭时间！🍽️',
    'Go eat & recharge!': '去吃饭，回回血！',
    '🎉 Off work! 🎉': '🎉 下班啦！🎉',
    'Time to go home!': '可以回家了！',
    'until lunch 🍜': '到午饭 🍜',
    'until freedom 🏃': '到下班 🏃',
    'Countdown set! ⏰': '倒数设好了！⏰',
    'Failed to set countdown': '倒数设置失败',
    'Countdown cleared — using default': '倒数已清除 —— 恢复默认',
    'Failed to clear': '清除失败',
    'It’s the weekend! Enjoy 🌟': '周末啦！好好玩 🌟',
    'Work starts at 9:00 AM ☕': '早上 9:00 上班 ☕',
    'Lunch break! Back at 2:00 PM 🍜': '午休中！下午 2:00 回来 🍜',
    'Enjoy your evening!': '晚上好好休息！',

    /* ══ Board runtime: mood & chess ══ */
    'You picked {emoji} today!': '你今天选了 {emoji}！',
    'Please sign in first': '请先登录',
    'Mood fail: {code} {msg}': '心情记录失败：{code} {msg}',
    '♟️ Chess Challenge!': '♟️ 象棋挑战！',
    '🪙 {n} coins': '🪙 {n} 金币',

    /* ══ Coin Rush ══ */
    'Coin Rush at {time}': '{time} 金币狂潮',
    'starts in {t}': '{t} 后开始',
    'in {t}': '{t} 后',
    'Coin Rush starting!': '金币狂潮就要开始了！',
    'Coin Rush is LIVE!': '金币狂潮进行中！',
    '{t} left': '还剩 {t}',
    'Tap to Join': '点击参加',
    'Coin Rush results': '金币狂潮结果',
    'tap to view the ranking': '点一下看排名',
    'View': '查看',
    '💰 Coin Rush starts in': '💰 金币狂潮开始倒数',
    'Get ready to tap! 💰': '准备好狂点了！💰',
    'Score {n}': '得分 {n}',
    'Grab the coins before others do! 💰': '抢在别人前面把金币捡走！💰',
    'Tap the coins as fast as you can! 💰': '越快点到金币越好！💰',
    'Ended': '已结束',
    'Tallying the results… 🏆': '正在算结果… 🏆',
    'No one joined this rush 😴': '这场没有人参加 😴',
    'Results preview (mock)': '结果预览（示例）',
    "Today's Coin Rush ranking": '今天的金币狂潮排名',
    '🏆 You placed #{rank}! +{bonus} 💰 bonus': '🏆 你排第 {rank} 名！奖励 +{bonus} 💰',
    "Once each weekday a coin rush starts at a surprise time. Race your coworkers to grab the coins before they're gone — every coin is money in your wallet. The top 3 grabbers win bonus coins (1st 1000 / 2nd 500 / 3rd 300). Watch the countdown!":
      '每个工作日都会在一个不预告的时间开一场金币狂潮。跟同事抢，谁手快谁拿得多 —— 每一枚都直接进你的钱包。前 3 名还有额外奖励（第 1 名 1000 / 第 2 名 500 / 第 3 名 300）。盯着倒数就对了！',
    'Got it': '知道了',

    /* ══ Upcoming events ══ */
    '🔴 happening now': '🔴 正在进行',
    '✅ started': '✅ 已开始',
    'in {d}d {h}h': '{d} 天 {h} 小时后',
    'in {h}h {m}m': '{h} 小时 {m} 分后',
    'in {n}m': '{n} 分钟后',
    'Add a title': '写个标题',
    'Pick a date & time': '选个日期和时间',
    'Invalid date': '日期不对',
    'Please sign in': '请先登录',
    '📌 Event pinned!': '📌 活动钉好了！',
    'Failed to pin event': '活动钉住失败',
    'No upcoming events pinned yet.': '还没有钉住的活动。',
    '>> IN ABOUT 1 HOUR <<': '>> 大约 1 小时后 <<',
    '>> COMING UP IN 1 DAY <<': '>> 还有 1 天 <<',

    /* ══ Presence & doodle ══ */
    '{n} viewing the board right now': '现在有 {n} 人在看留言板',
    'Close (Esc)': '关闭（Esc）',
    'Under Maintenance': '维护中',
    /* The space cards read these out of a data table (T(meta.label)), so the
       checker that only sees T('literal') cannot find them. */
    'Room': '房间',
    'Aquarium': '水族箱',
    'Pet World': '宠物世界',
    'Visit': '参观',
    '1 vote': '1 票',
    '{n} votes': '{n} 票',
    /* Rows the room dictionary also carries. index.html does not load that
       file, and a key it alone answers renders in English here. room.html
       loads both and registers the room LAST, so its own wording still wins
       there — 'Remove' is 收起 for a decoration, 移除 for a pinned note. */
    'Someone': '某人',
    '{name} invites you': '{name}邀请你',
    'Reject': '拒绝',
    'Accept': '接受',
    'Anonymous': '匿名',
    'Remove': '移除',
  });

  /* ── Chinese keys → English ── */
  I18N.register('en', {
    '在线': 'Online',
    '🔥 营火 Campfire': '🔥 Campfire',
    '中國象棋': 'Chinese Chess',
    '贪吃蛇': 'Snake',
    '现在在线人数': 'People online right now',
    '摸鱼': 'Slacking',
    '你在本站的总摸鱼时长（聊天板 + 游戏 + 房间 + 农场 + 水族馆 + Pet World）':
      'Your total time here (board + games + room + farm + aquarium + Pet World)',
    '排名': 'Rank',
    '你在摸鱼榜的名次': 'Your place on the slacking board',
    '今日': 'Today',
    '全站今天新发的泡泡数': 'Bubbles posted site-wide today',
    '峰值': 'Peak',
    '今天你看到的最高同时在线人数': 'The most people you saw online at once today',

    '✨ 更多玩法': '✨ More to play',
    '点开试试': 'Tap to try',
    '泡泡罐': 'Bubble Jar',
    '收藏的留言': 'Saved messages',
    '泡泡罐 — 收藏过的留言': 'Bubble Jar — messages you saved',
    '涂鸦墙': 'Graffiti Wall',
    '一起画画': 'Draw together',
    '涂鸦墙 — 在留言板背景上画画，大家都看得到': 'Graffiti Wall — draw on the board background for everyone to see',
    '金币乐园': 'Coin Park',
    '商店/扭蛋': 'Shop / gacha',
    '金币乐园 — 商店 / 扭蛋 / 老虎机': 'Coin Park — shop / gacha / slots',
    '富豪榜': 'Rich List',
    '金币排名': 'By coins',
    '富豪榜 — 按当前金币排名': 'Rich List — ranked by coins held',
    '摸鱼榜': 'Slacking Board',
    '时长排名': 'By time',
    '摸鱼榜 — 按总摸鱼时长排名': 'Slacking Board — ranked by total time here',
    '假期列表': 'Holidays',
    '放假倒数': 'Countdowns',
    '假期列表 — 法定节假日放假倒数，摸鱼必备': 'Holidays — public holiday countdowns',
    '赛马': 'Horse Race',
    '万能决策': 'Decide anything',
    '赛马 — 写下选项让马来决定，全站实时一起围观': 'Horse Race — write the options, let the horses decide, everyone watches live',

    '🌟 每日正能量': '🌟 Daily lift',
    '💬 评论': '💬 Comments',
    '还没有评论，来抢沙发吧！': 'No comments yet — be the first!',
    '说点什么…': 'Say something…',
    '发送': 'Send',
    '🕶️ 匿名': '🕶️ Anonymous',
    '画个涂鸦': 'Draw something',
    '收藏的 GIF': 'Saved GIFs',

    '🧠 每日脑筋急转弯': '🧠 Daily Brain Teaser',
    '每日脑筋急转弯 · 答对得100金币': 'Daily brain teaser · 100 coins for a right answer',
    '输入你的答案…': 'Type your answer…',
    '提交': 'Submit',
    '💡 提示': '💡 Hint',
    '查看答案': 'Reveal answer',
    '取消': 'Cancel',
    '⚠️ 看答案会用掉今天的作答机会，拿不到 100 金币。': '⚠️ Revealing uses up today\'s attempt — no 100 coins.',
    '🪙 答对奖励 100 金币（每天一次）': '🪙 100 coins for a right answer (once a day)',

    '🐉 每日成语接龙': '🐉 Daily Idiom Chain',
    '每日成语接龙 · 答对一个得20金币': 'Daily idiom chain · 20 coins each',
    '输入成语接龙…': 'Type the next idiom…',
    '接龙': 'Chain it',
    '卡住了，换开头': 'Stuck — new start',
    '💰 答对一个成语 +20 金币': '💰 +20 coins per correct idiom',

    '关闭': 'Close',
    '✕ 关闭': '✕ Close',
    '有什么更新了': 'What\'s new',
    '可选：介绍页 URL（如 ./whats-new/2026-07.html）': 'Optional: intro page URL (e.g. ./whats-new/2026-07.html)',
    '填了 URL 就改为「首次访问弹出这个 HTML 页面」（用 iframe，一次性）；留空则用上面的条目列表。':
      'With a URL, first visit opens that page in an iframe once; leave it blank to use the list above.',

    /* ══ Board runtime: the parts written in Chinese ══ */

    // GIF tray (app.js)
    '请先填入免费的 Giphy API key<br>（developers.giphy.com → Create App）':
      'Add a free Giphy API key first<br>(developers.giphy.com → Create App)',
    '收藏的 GIF（{n}）': 'Saved GIFs ({n})',
    '收藏这个 GIF，下次直接用': 'Save this GIF for next time',
    '还没有收藏的 GIF —— 点任意 GIF 右上角的 ☆，下次点这里直接用':
      'No saved GIFs yet — tap the ☆ on any GIF and it lands here',

    // Bubble footer (app.js)
    '⭐ 置顶': '⭐ Pin',
    '花金币把这条留言置顶': 'Spend coins to pin this message',
    '🏆 打赏': '🏆 Award',
    '花金币给这条留言一个奖章': 'Spend coins to give this message a medal',
    '🏺 收藏': '🏺 Keep',
    '收进泡泡罐（只保存在这台设备）': 'Into your bubble jar (this device only)',
    '置顶 {n}h': 'Pinned {n}h',
    '置顶 {n}m': 'Pinned {n}m',
    '🎉 {names} 打赏了': '🎉 {names} gave an award',
    '🎉 {names} 等{n}人 打赏了': '🎉 {names} and {n} others gave awards',

    // Doodle pad
    '撤销': 'Undo',
    '清空': 'Clear',
    '贴到输入框': 'Paste into the box',
    '橡皮擦（白色）': 'Eraser (white)',
    '笔刷 {n}px': 'Brush {n}px',
    '先画点什么吧 🖌️': 'Draw something first 🖌️',
    '🎨 已贴到输入框，点 Send 发送': '🎨 Pasted into the box — hit Send',

    // Campfire
    '点天空放烟花 · 点火堆丢火星 · 点地面走过去':
      'Tap the sky for fireworks · tap the fire for sparks · tap the ground to walk over',
    '收起': 'Collapse',
    '展开营火小景': 'Open the campfire scene',

    // Quote comments
    '删除': 'Delete',
    '评论不能超过 {n} 字': 'Comments are limited to {n} characters',
    '发送失败，请重试': 'Could not send — try again',
    '删除失败': 'Could not delete',

    // Live board durations
    '{d}天{h}小时': '{d}d {h}h',
    '{d}天': '{d}d',
    '{h}小时': '{h}h',
    '{m}分钟': '{m}m',
    '不到1分钟': 'under a minute',

    // Bubble jar timestamps. Unspaced on purpose: the key is the source text and
    // jar-logic.test.js pins the exact Chinese output, so the spaced variants in
    // i18n-en-more.js (used by coin-center.js) cannot stand in for these.
    '{n}分钟前': '{n} min ago',
    '{n}小时前': '{n} h ago',
    '{n}天前': '{n} d ago',
    '昨天': 'yesterday',
  });
})();
