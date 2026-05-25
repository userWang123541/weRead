function timeAgo(ts) {
  if (!ts) return '';
  const now = Date.now();
  const t = typeof ts === 'number' && ts < 1e12 ? ts * 1000 : ts;
  const diff = now - t;
  if (diff < 0) return '刚刚';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return mins + '分钟前';
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + '小时前';
  const days = Math.floor(hours / 24);
  if (days === 1) return '昨天';
  if (days < 30) return days + '天前';
  const d = new Date(t);
  return (d.getMonth() + 1) + '/' + d.getDate();
}

function formatDate(ts) {
  if (!ts) return '';
  const t = typeof ts === 'number' && ts < 1e12 ? ts * 1000 : ts;
  const d = new Date(t);
  return d.getFullYear() + '/' + pad(d.getMonth() + 1) + '/' + pad(d.getDate());
}

function formatDateTime(ts) {
  if (!ts) return '';
  const t = typeof ts === 'number' && ts < 1e12 ? ts * 1000 : ts;
  const d = new Date(t);
  return (d.getMonth() + 1) + '/' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function pad(n) { return n < 10 ? '0' + n : '' + n; }

function truncate(text, len) {
  if (!text) return '';
  if (text.length <= len) return text;
  return text.slice(0, len) + '...';
}

function typeLabel(type) {
  if (type === 0) return '划线';
  if (type === 1) return '想法';
  if (type === 2) return '链接';
  return '';
}

function typeClass(type) {
  if (type === 0) return 'highlight';
  if (type === 1) return 'review';
  if (type === 2) return 'linked';
  return '';
}

module.exports = { timeAgo, formatDate, formatDateTime, truncate, typeLabel, typeClass, pad };
