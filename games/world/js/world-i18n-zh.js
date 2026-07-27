/* ============================================================
   Chinese for the Pet World (games/world/).

   Keys are the English source text — see src/js/i18n.js for why.
   Anything absent simply renders in English.

   Registered before i18n-ui.js sweeps the static markup.

   Note the block at the bottom: pet names, coat colours, accessories
   and pet tricks are already keyed in games/room/js/room-i18n-zh.js,
   but this page does not load that file — so those rows are repeated
   here with the SAME wording. Shipping the room's 1100 rows to reach
   forty of them would be the worse trade.
   ============================================================ */
(function () {
  if (typeof I18N === 'undefined') return;
  I18N.register('zh', {

    /* ── The page ── */
    '🌍 Pet World': '🌍 宠物世界',
    '🐾 Pet': '🐾 宠物',
    '👕 Wear': '👕 换装',
    '📢 Share': '📢 分享',
    '🔴 connecting…': '🔴 连接中…',
    '✋ High-five back!': '✋ 击掌回去！',
    '📋 Open board': '📋 打开留言板',
    '📋 Notes Board': '📋 留言板',
    '📌 Pin': '📌 贴上去',
    '🐾 Choose your pet': '🐾 选一只宠物',
    '👕 Change your outfit': '👕 换身装扮',
    'Please open the World from inside the app so we know who you are.':
      '请从 App 里进入宠物世界，这样我们才知道你是谁。',
    'Go to the app': '去 App',
    'Back to room': '回房间',
    'Share this world to the bubble board': '把这个世界分享到留言板',
    'Close board': '关闭留言板',
    'Toggle chat': '开关聊天',
    'Write a note for the board… 🌸': '给留言板写点什么… 🌸',
    'Say hi… (be kind 🌸)': '打个招呼吧…（友善一点 🌸）',

    /* ── Connection & presence ── */
    '🔴 connecting to server…': '🔴 正在连接服务器…',
    '🟢 1 pet here': '🟢 这里有 1 只宠物',
    '🟢 {n} pets here': '🟢 这里有 {n} 只宠物',
    '⚠️ can’t sync: {msg}': '⚠️ 同步不了：{msg}',
    'sync error': '同步出错',
    'write failed': '写入失败',
    'read denied': '没有读取权限',

    /* ── Playing together ── */
    'Get closer to {name} to high-five 🐾': '走近{name}才能击掌 🐾',
    'Get closer to another pet to play 🐾': '走近别的宠物才能一起玩 🐾',
    'You offered a high five to {name}! ✋': '你想跟{name}击个掌！✋',
    'High five with {names}! 🎉': '和{names}击掌成功！🎉',
    'them': '它',
    'a friend': '一位朋友',
    'You are now a {pet}! 🐾': '你现在是{pet}啦！🐾',
    '🚶  {scene}': '🚶  {scene}',

    /* ── Notes board ── */
    '📋 {emoji} {scene} — Notes': '📋 {emoji} {scene} — 留言',
    '📋 NOTES': '📋 留言',
    'No notes yet — be the first to leave one! 🌸': '还没有人留言 —— 来写第一条吧！🌸',
    'Page {n} / {total}': '第 {n} / {total} 页',
    '📌 Pinned to the board!': '📌 贴到留言板上了！',
    'Give it a moment ⏳': '稍等一下 ⏳',
    'Write something first ✍️': '先写点什么 ✍️',

    /* ── Chat & moderation ── */
    '💬 Chat': '💬 聊天',
    '💬 Hide': '💬 收起',
    "Let's keep it kind 🌸": '说话友善一点 🌸',
    'Slow down a little 🐢': '慢一点 🐢',
    '🚩 Report': '🚩 举报',
    '🚫 Block': '🚫 拉黑',
    '✋ High-five': '✋ 击掌',
    'Reported. Thanks for keeping the World kind 💛': '已举报。谢谢你让这个世界更友善 💛',
    "Blocked. You won't see them anymore.": '已拉黑，之后不会再看到它。',

    /* ── Sparkle hunt ── */
    '✨ Sparkle found! {n}/{total} today': '✨ 找到一颗！今天 {n}/{total}',
    '🎉 All sparkles found! You earned {n} coins 💰': '🎉 全部找齐了！赚到 {n} 金币 💰',
    '✨ 3 sparkles hide in each scene (9 total). Collect them all for {n} coins 💰':
      '✨ 每个场景藏着 3 颗（一共 9 颗）。全部找齐可得 {n} 金币 💰',

    /* ── Sharing ── */
    'Sign in first to share.': '先登录才能分享。',
    '📢 Shared Pet World to the board!': '📢 已经把宠物世界分享到留言板！',
    'Just shared — give it a moment.': '刚分享过，稍等一下。',
    'Could not share.': '分享失败。',

    /* ── Scenes (world-config.js — the ID travels in the URL, the NAME is text) ── */
    'Splash Pool': '戏水池',
    'Desert of Egypt': '埃及沙漠',
    'Green Grassland': '青青草原',

    /* ── Action bar (world-actions.js labels, world-input.js headings) ── */
    'Signature move': '招牌动作',
    'High-five a nearby pet': '和旁边的宠物击掌',
    'Emotes': '表情',
    'Signature': '招牌',
    'Wave': '挥手',
    'Love': '比心',
    'Laugh': '大笑',
    'Dance': '跳舞',
    'Cry': '哭',
    'Sparkle': '闪耀',
    'High-five': '击掌',
    'Splash': '戏水',
    'Dive': '潜水',
    'Float': '漂浮',
    'Take a bow': '鞠躬',
    'Dig': '挖沙',
    'Roll': '打滚',
    'Pounce': '扑击',

    /* ══ Repeated from the room dictionary, which this page does not load ══ */

    // Pet ids — T(type) in the picker; the id itself still travels raw.
    'cat': '猫',
    'dog': '狗',
    'bunny': '兔子',
    'hamster': '仓鼠',
    'fox': '狐狸',
    'panda': '熊猫',
    'goose': '鹅',
    'tom': '汤姆',
    'jerry': '杰瑞',
    'Pet': '宠物',
    'None': '不戴',

    // Coat colours
    'Gray': '灰',
    'Grey': '灰',
    'Orange': '橘',
    'Black': '黑',
    'White': '白',
    'Brown': '棕',
    'Pink': '粉',
    'Red': '火红',
    'Silver': '银灰',
    'Cream': '奶油',
    'Golden': '金',
    'Classic': '经典',
    'Siamese': '暹罗',
    'Husky': '哈士奇',
    'Swan': '天鹅白',
    'Arctic': '雪白',
    'Cross': '十字纹',
    'Fennec': '耳廓狐',
    'Sky Blue': '天蓝',
    'Mint': '薄荷',
    'Butch': '布奇',
    'Ochre': '赭黄',

    // Accessories
    'Top Hat': '高礼帽',
    'Crown': '皇冠',
    'Sunglasses': '墨镜',
    'Bow': '蝴蝶结',
    'Scarf': '围巾',
    'Flower': '小花',
    'Bandana': '头巾',
    'Monocle': '单片眼镜',
    'Halo': '天使光环',
    'Wizard Hat': '巫师帽',
    'Party Hat': '派对帽',
    'Heart Glasses': '爱心眼镜',
    'Devil Horns': '恶魔角',
    'Angel Wings': '天使翅膀',
    'Cape': '披风',
    'Ninja Mask': '忍者面罩',
    'Pirate Patch': '海盗眼罩',
    'Tiara': '公主头冠',
    'Star Badge': '星星徽章',

    // room-accessories.js rides along on this page
    '{name} does a trick!': '{name}表演了一个才艺！',
    'Owned': '已拥有',
    'Gacha Only': '仅扭蛋',
    'Pet Tricks': '宠物才艺',
    'Pets learn tricks as affection grows!': '好感度越高，宠物会的才艺越多！',
    'Accessories can only be obtained from Gacha!': '配饰只能从扭蛋里抽到！',
    'Accessory removed!': '配饰取下来了！',
    'Anonymous': '匿名',

    // Pet tricks (PET_TRICKS in room-accessories.js, rendered via T(tr.name))
    'Sit': '坐下',
    'Spin': '转圈',
    'Backflip': '后空翻',
    'Shake': '握手',
    'Roll Over': '打滚',
    'Stand Up': '站起来',
    'Binky Jump': '欢乐跳',
    'Flap': '拍翅膀',
    'Hop': '蹦跳',
  });
})();
