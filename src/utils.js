export function compact(value, length) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > length ? `${text.slice(0, length)}...` : text;
}

export function formatDate(value) {
  if (!value) return '暂无';
  const n = Number(value);
  const date = Number.isFinite(n) && n > 1000000000
    ? new Date(n * 1000)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return '暂无';
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function typeLabel(type) {
  return {
    highlight: '划线',
    review: '想法',
    linked: '划线+想法',
  }[type] || type || '资料';
}

export function normalizeCategoryPath(value) {
  return String(value || '')
    .split('/')
    .map(part => part.trim())
    .filter(Boolean)
    .join('/');
}

export function buildTree(paths, withItems = false) {
  const root = { name: '', path: '', children: [], description: '', item: null };
  const map = new Map([['', root]]);

  paths.forEach(entry => {
    const path = typeof entry === 'string' ? entry : entry.path;
    if (!path) return;
    let parentPath = '';
    path.split('/').map(part => part.trim()).filter(Boolean).forEach(part => {
      const nodePath = parentPath ? `${parentPath}/${part}` : part;
      if (!map.has(nodePath)) {
        const node = { name: part, path: nodePath, children: [], description: '', item: null };
        map.set(nodePath, node);
        map.get(parentPath).children.push(node);
      }
      parentPath = nodePath;
    });
    if (withItems) {
      const node = map.get(path);
      if (node && typeof entry !== 'string') {
        node.description = entry.description || '';
        node.item = entry;
      }
    }
  });

  const sortNode = node => {
    node.children.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
    node.children.forEach(sortNode);
  };
  sortNode(root);
  return root;
}
