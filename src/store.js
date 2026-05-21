import { buildTree, formatDate, normalizeCategoryPath } from './utils.js';

const { reactive, computed } = Vue;

export const store = reactive({
  apiKey: localStorage.getItem('weread_api_key') || '',
  status: '等待载入本地数据。',
  categoryStatus: '分类会写入 config/taxonomy.json。',
  raw: { books: [] },
  cardsData: { cards: [], taxonomy: [] },
  taxonomy: { categories: [] },
  classified: null,
  stats: {},
  selectedTag: '',
  tagSearch: '',
  searchInput: '',
  typeFilter: '',
  bookFilter: '',
  loading: false,
  activeCategoryEdit: null,
  categoryForm: { mode: 'create', path: '', parentPath: '', originalPath: '', name: '', description: '' },
});

export const getters = {
  subtitle: computed(() => `最近同步：${formatDate(store.stats.fetchedAt)}，资料卡生成：${formatDate(store.stats.generatedAt)}。`),

  statItems: computed(() => [
    { label: '书籍', value: store.stats.totalBooks || 0 },
    { label: '划线', value: store.stats.totalHighlights || 0 },
    { label: '想法', value: store.stats.totalReviews || 0 },
    { label: '资料卡', value: store.stats.totalCards || 0 },
    { label: '已分类', value: store.classified?.totalNotes || 0 },
    { label: '未分类', value: store.classified?.stats?.['未分类'] || 0 },
  ]),

  bookOptions: computed(() => [...new Set((store.cardsData.cards || []).map(card => card.bookTitle).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'zh'))),

  classificationMap: computed(() => {
    if (!store.classified?.notes?.length) return null;
    const map = new Map();
    store.classified.notes.forEach((note, index) => {
      const item = { ...note, _index: index };
      const key = `${note.bookId}|${note.type}|${(note.text || '').slice(0, 60)}`;
      map.set(key, item);
    });
    return map;
  }),

  categoryOptions: computed(() => {
    const set = new Set(['未分类']);
    (store.taxonomy.categories || []).forEach(item => item.path && set.add(item.path));
    Object.keys(store.classified?.stats || {}).forEach(tag => set.add(tag));
    (store.cardsData.taxonomy || []).forEach(item => item.tag && set.add(item.tag));
    return [...set].sort((a, b) => a.localeCompare(b, 'zh'));
  }),

  categoryTree: computed(() => buildTree(getters.categoryOptions.value.filter(item => item !== '未分类'))),

  manageCategoryTree: computed(() => buildTree(store.taxonomy.categories || [], true)),

  filteredTags: computed(() => {
    const q = store.tagSearch.trim().toLowerCase();
    if (store.classified?.stats) {
      return Object.entries(store.classified.stats)
        .map(([tag, count]) => ({ tag, count }))
        .filter(item => !q || item.tag.toLowerCase().includes(q))
        .sort((a, b) => b.count - a.count)
        .slice(0, 80);
    }
    return (store.cardsData.taxonomy || [])
      .filter(item => !q || item.tag.toLowerCase().includes(q))
      .slice(0, 80);
  }),

  filteredCards: computed(() => {
    const q = store.searchInput.trim().toLowerCase();
    return (store.cardsData.cards || []).filter(card => {
      if (store.selectedTag) {
        if (getters.classificationMap.value) {
          const cls = cardClassification(card);
          if (!cls || cls.category !== store.selectedTag) return false;
        } else if (!(card.tags || []).includes(store.selectedTag)) {
          return false;
        }
      }
      if (store.typeFilter && card.type !== store.typeFilter) return false;
      if (store.bookFilter && card.bookTitle !== store.bookFilter) return false;
      if (!q) return true;
      const haystack = [
        card.quote,
        card.note,
        card.bookTitle,
        card.author,
        card.chapterTitle,
        ...(card.tags || []),
        ...(card.keywords || []),
      ].join('\n').toLowerCase();
      return haystack.includes(q);
    }).slice(0, 120);
  }),

  taxonomyRows: computed(() => {
    if (store.classified?.stats) {
      return Object.entries(store.classified.stats)
        .map(([tag, count]) => ({
          tag,
          count,
          depth: (tag.match(/\//g) || []).length + 1,
          bookCount: 0,
        }))
        .sort((a, b) => b.count - a.count);
    }
    return store.cardsData.taxonomy || [];
  }),

  currentEditCategory: computed(() => {
    if (store.activeCategoryEdit === null) return '';
    return store.classified?.notes?.[store.activeCategoryEdit]?.category || '';
  }),
};

export async function request(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (store.apiKey.trim()) headers['X-Weread-Key'] = store.apiKey.trim();
  const response = await fetch(path, { ...options, headers });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

export async function loadData() {
  store.status = '正在读取本地资料库...';
  try {
    const [data, classified, taxonomy] = await Promise.all([
      request('/api/data'),
      request('/api/classified').catch(() => null),
      request('/api/taxonomy').catch(() => ({ categories: [] })),
    ]);
    store.raw = data.raw || { books: [] };
    store.cardsData = data.cards || { cards: [], taxonomy: [] };
    store.stats = data.stats || {};
    store.classified = classified;
    store.taxonomy = taxonomy || { categories: [] };
    const clsCount = store.classified?.totalNotes || 0;
    store.status = `本地资料库已载入：${store.stats.totalCards || 0} 张资料卡${clsCount ? `，${clsCount} 条已分类` : ''}。`;
  } catch (err) {
    store.status = `载入失败：${err.message}`;
  }
}

export async function syncData() {
  if (store.apiKey.trim()) localStorage.setItem('weread_api_key', store.apiKey.trim());
  store.loading = true;
  store.status = '正在同步微信读书数据，书多时可能需要一两分钟...';
  try {
    const data = await request('/api/sync', { method: 'POST', body: JSON.stringify({}) });
    store.raw = data.raw;
    store.cardsData = data.cards;
    store.stats = data.stats;
    store.status = `同步完成：${store.stats.totalBooks} 本书，${store.stats.totalCards} 张资料卡。`;
  } catch (err) {
    store.status = `同步失败：${err.message}`;
  } finally {
    store.loading = false;
  }
}

export async function rebuildCards() {
  store.loading = true;
  store.status = '正在从本地原始数据重建资料卡...';
  try {
    const data = await request('/api/cards/rebuild', { method: 'POST', body: JSON.stringify({}) });
    store.cardsData = data.cards;
    store.stats = data.stats;
    store.status = `资料卡已重建：${store.stats.totalCards} 张。`;
  } catch (err) {
    store.status = `重建失败：${err.message}`;
  } finally {
    store.loading = false;
  }
}

export async function classifyData() {
  store.loading = true;
  store.status = '正在调用 BGE 模型进行向量分类，首次可能需要几分钟...';
  try {
    const result = await request('/api/classify', { method: 'POST', body: JSON.stringify({}) });
    store.classified = await request('/api/classified');
    store.status = `分类完成：${result.totalNotes} 条笔记，${Object.keys(result.stats || {}).length} 个分类。`;
  } catch (err) {
    store.status = `分类失败：${err.message}。请确认 LLM_API_KEY 可用。`;
  } finally {
    store.loading = false;
  }
}

export function cardClassification(card) {
  const map = getters.classificationMap.value;
  if (!map) return null;
  const text = card.quote || card.note || '';
  const type = card.type === 'linked' ? 'highlight' : card.type;
  const key = `${card.bookId}|${type}|${text.slice(0, 60)}`;
  const hit = map.get(key);
  if (hit) return hit;
  // linked 卡片同时有划线和想法，quote 匹配 highlight 失败时用 note 匹配 review
  if (card.type === 'linked' && card.note) {
    const reviewKey = `${card.bookId}|review|${card.note.slice(0, 60)}`;
    return map.get(reviewKey) || null;
  }
  return null;
}

export async function updateNoteCategory(category) {
  if (store.activeCategoryEdit === null) return;
  const noteIndex = store.activeCategoryEdit;
  store.status = '正在保存分类...';
  try {
    const result = await request('/api/classified/update', {
      method: 'POST',
      body: JSON.stringify({ noteIndex, category }),
    });
    store.classified.notes[noteIndex].category = category;
    store.classified.notes[noteIndex].userEdited = true;
    store.classified.stats = result.stats;
    store.activeCategoryEdit = null;
    store.status = '分类已保存。';
  } catch (err) {
    store.status = `保存失败：${err.message}`;
  }
}

export async function replaceTaxonomy(categories) {
  store.loading = true;
  try {
    store.taxonomy = await request('/api/taxonomy', {
      method: 'PUT',
      body: JSON.stringify({ ...store.taxonomy, categories }),
    });
  } catch (err) {
    store.categoryStatus = `保存失败：${err.message}`;
    throw err;
  } finally {
    store.loading = false;
  }
}

export async function saveCategory() {
  const name = normalizeCategoryPath(store.categoryForm.name).replace(/\//g, '');
  if (!name) {
    store.categoryStatus = '分类名称不能为空。';
    return;
  }
  const parentPath = normalizeCategoryPath(store.categoryForm.parentPath);
  const nextPath = parentPath ? `${parentPath}/${name}` : name;
  const categories = (store.taxonomy.categories || []).map(item => ({ ...item }));
  let nextCategories;

  if (store.categoryForm.mode === 'edit') {
    const oldPath = store.categoryForm.originalPath;
    if (!oldPath) return;
    if (categories.some(item => item.path !== oldPath && !item.path.startsWith(`${oldPath}/`) && item.path === nextPath)) {
      store.categoryStatus = '同级分类已存在。';
      return;
    }
    nextCategories = categories.map(item => {
      if (item.path === oldPath || item.path.startsWith(`${oldPath}/`)) {
        const suffix = item.path.slice(oldPath.length);
        return {
          ...item,
          path: `${nextPath}${suffix}`,
          description: item.path === oldPath ? store.categoryForm.description : item.description,
        };
      }
      return item;
    });
    if (!nextCategories.some(item => item.path === nextPath)) {
      nextCategories.push({ id: `cat_${Date.now()}`, path: nextPath, description: store.categoryForm.description });
    }
  } else {
    if (categories.some(item => item.path === nextPath)) {
      store.categoryStatus = '分类已存在。';
      return;
    }
    nextCategories = [...categories, { id: `cat_${Date.now()}`, path: nextPath, description: store.categoryForm.description }];
  }

  try {
    await replaceTaxonomy(nextCategories);
    store.categoryStatus = store.categoryForm.mode === 'edit' ? '分类已更新。' : '分类已新增。';
    resetCategoryForm();
  } catch (_err) {}
}

export function editCategoryNode(node) {
  const parts = node.path.split('/');
  store.categoryForm = {
    mode: 'edit',
    path: node.path,
    originalPath: node.path,
    parentPath: parts.slice(0, -1).join('/'),
    name: node.name,
    description: node.description || '',
  };
  store.categoryStatus = `正在编辑：${node.path}`;
}

export function startCreateChild(node) {
  store.categoryForm = {
    mode: 'create',
    path: '',
    originalPath: '',
    parentPath: node.path,
    name: '',
    description: '',
  };
  store.categoryStatus = `将在「${node.path}」下面新增子分类。`;
}

export function startCreateRoot() {
  resetCategoryForm();
  store.categoryStatus = '正在新增一级分类。';
}

export async function deleteCategoryNode(node) {
  const affected = (store.taxonomy.categories || []).filter(item => item.path === node.path || item.path.startsWith(`${node.path}/`));
  if (!affected.length) return;
  if (!confirm(`删除「${node.path}」及其 ${affected.length} 个分类？`)) return;
  const nextCategories = (store.taxonomy.categories || [])
    .map(item => ({ ...item }))
    .filter(item => item.path !== node.path && !item.path.startsWith(`${node.path}/`));
  try {
    await replaceTaxonomy(nextCategories);
    if (store.categoryForm.originalPath === node.path || store.categoryForm.originalPath.startsWith(`${node.path}/`)) {
      resetCategoryForm();
    }
    store.categoryStatus = '分类已删除。已分类笔记不会自动改动。';
  } catch (_err) {}
}

export function resetCategoryForm() {
  store.categoryForm = { mode: 'create', path: '', parentPath: '', originalPath: '', name: '', description: '' };
}

export function openOriginal(url) {
  store.status = '正在尝试打开微信读书原文...';
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).catch(() => {});
  window.location.href = url;
  setTimeout(() => {
    store.status = '如果没有跳转，通常是浏览器拦截 weread:// 协议，或本机没有安装/注册微信读书客户端。链接已尝试复制。';
  }, 900);
}
