/* ============================================================
   Chinese for the board pages (index.html).

   Keys are the English source text — see i18n.js. Only the settings
   panel is covered so far; everything else on the board still renders
   its own text and will fall back to English (or stay as the Chinese
   it is already hardcoded in) until it is converted.
   ============================================================ */
(function () {
  if (typeof I18N === 'undefined') return;
  I18N.register('zh', {

    /* ── Settings panel ── */
    'Language': '语言',
    'Minigame Display Name': '小游戏昵称',
    'Notifications': '通知',
    '🔔 Push Notifications': '🔔 推送通知',
    '🔊 Notification Sound': '🔊 提示音',
    'Appearance — Theme': '外观 — 主题',
    'Font Size': '字号',
    '💬 Bubble Animations': '💬 气泡动画',
    '🐾 Walking Pet': '🐾 走动的宠物',
    'Data': '数据',
    '🚶 Sign Out': '🚶 退出登录',
  });
})();
