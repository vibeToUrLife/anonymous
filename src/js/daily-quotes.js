/**
 * Daily Random 正能量 (Motivational) Quotes
 *
 * A collection of uplifting, encouraging Chinese quotes.
 * One quote is deterministically selected per day using a date-based seed
 * so all users see the same quote on the same day.
 */

// eslint-disable-next-line no-unused-vars
const DAILY_QUOTES = [
  "越努力，越幸运。",
  "你今天的努力，是幸运的伏笔。",
  "星光不问赶路人，时光不负有心人。",
  "所有的努力都不会白费，时间会给你答案。",
  "你只管努力，剩下的交给时间。",
  "山高路远，但行则将至；事虽难做，做则必成。",
  "每一个不曾起舞的日子，都是对生命的辜负。",
  "心之所向，素履以往。",
  "凡是过往，皆为序章。",
  "慢慢来，比较快。",
  "哪有什么天生如此，只是我们天天坚持。",
  "你现在的努力，是为了以后有更多选择的权利。",
  "与其羡慕别人，不如努力成为别人羡慕的人。",
  "把每一件简单的事做好，就是不简单。",
  "行动是治愈恐惧的良药，犹豫拖延只会滋养恐惧。",
  "不怕慢，就怕站；坚持下去，总会抵达。",
  "今天的你，要比昨天更靠近梦想一点。",
  "生活不会辜负每一个努力奔跑的人。",
  "你要悄悄拔尖，然后惊艳所有人。",
  "当你想要放弃的时候，想想当初为什么开始。",
  "努力到无能为力，拼搏到感动自己。",
  "每天进步一点点，时间会见证你的蜕变。",
  "风雨之后，总会有彩虹。",
  "种一棵树最好的时间是十年前，其次是现在。",
  "你的潜力，远比你想象的更强大。",
  "只要方向对了，就不怕路远。",
  "自律的人生，才能拥有真正的自由。",
  "怕什么真理无穷，进一寸有一寸的欢喜。",
  "愿你历尽千帆，归来仍是少年。",
  "乾坤未定，你我皆是黑马。",
  "没有伞的孩子，必须努力奔跑。",
  "你若盛开，清风自来。",
  "脚踏实地，仰望星空。",
  "既然选择了远方，便只顾风雨兼程。",
  "真正的强者，是含着眼泪也要奔跑的人。",
  "愿你成为自己的光，照亮前行的路。",
  "不要因为走得太远，而忘了为什么出发。",
  "梦想还是要有的，万一实现了呢。",
  "念念不忘，必有回响。",
  "万事开头难，但开始了就成功了一半。"
];

/**
 * Get a deterministic daily quote index using date string as seed.
 * All users see the same quote on the same day.
 * @returns {number} Index into DAILY_QUOTES array
 */
function getDailyQuoteIndex() {
  const today = new Date();
  // Use YYYY-MM-DD format as seed
  const dateStr = today.getFullYear() + '-' +
    String(today.getMonth() + 1).padStart(2, '0') + '-' +
    String(today.getDate()).padStart(2, '0');

  // Simple hash to convert date string to a number
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = ((hash << 5) - hash) + dateStr.charCodeAt(i);
    hash |= 0; // Convert to 32-bit integer
  }

  return Math.abs(hash) % DAILY_QUOTES.length;
}

/**
 * Get today's daily quote string.
 * @returns {string} The quote for today
 */
// eslint-disable-next-line no-unused-vars
function getDailyQuote() {
  return DAILY_QUOTES[getDailyQuoteIndex()];
}
