// 防抖函数
function debounce(fn, delay = 500) {
  let timer = null;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// 数字格式化：大数字显示缩写
function formatNumber(num) {
  if (num >= 10000) return (num / 10000).toFixed(1) + 'w';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
  return String(num);
}

// 时间戳转展示时间
function formatTime(ts) {
  const d = new Date(ts);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 弹窗提示
function showToast(msg, duration = 2000) {
  let toast = document.getElementById('global-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'global-toast';
    toast.className = 'pixel-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}

// 星级显示
function renderStars(star) {
  const s = Math.max(0, Math.min(5, Math.floor(star || 0)));
  return '★'.repeat(s) + '☆'.repeat(5 - s);
}

// 品级颜色
function gradeColor(grade) {
  const colors = { B: '#8bc34a', A: '#2196f3', S: '#ff9800', SS: '#ff5722', SSS: '#f44336' };
  return colors[grade] || '#fff';
}

// 球员位置显示（含摇摆位）
function getDisplayPos(card) {
  const swing = SWING_POSITIONS[card.role_name];
  if (swing && swing.length > 1) return swing.join('/');
  return card.pos;
}

// 按篮球标准位置排序：PG→SG→SF→PF→C
const POS_ORDER = { PG: 0, SG: 1, SF: 2, PF: 3, C: 4 };
function sortByPosition(cards) {
  if (!cards || !cards.length) return [];
  return [...cards].sort((a, b) => (POS_ORDER[a.pos] ?? 9) - (POS_ORDER[b.pos] ?? 9));
}
