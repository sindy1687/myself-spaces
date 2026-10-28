// 分類純函式邏輯（可在 Node 測試）
export function childrenOf(cats, id) { return cats.filter(c => c.parentId === id); }

export function descendants(cats, id) {
  const out = new Set();
  const walk = pid => { for (const c of childrenOf(cats, pid)) { if (!out.has(c.id)) { out.add(c.id); walk(c.id); } } };
  walk(id);
  return out;
}

// 拖曳目標是否合法：不能移到自己或子分類底下
export function canMove(cats, id, newParentId) {
  if (id === newParentId) return false;
  if (!newParentId) return true;
  return !descendants(cats, id).has(newParentId);
}

// 偵測循環
export function findCycles(cats) {
  const bad = [];
  for (const c of cats) {
    const seen = new Set([c.id]);
    let p = c.parentId;
    while (p) {
      if (seen.has(p)) { bad.push(c.id); break; }
      seen.add(p);
      p = cats.find(x => x.id === p)?.parentId;
    }
  }
  return bad;
}

// 同上層同範圍內重複名稱
export function dupNames(cats) {
  const seen = new Map(), dups = [];
  for (const c of cats) {
    const k = `${c.parentId || ''}|${c.type}|${c.name}`;
    if (seen.has(k)) dups.push(c.id); else seen.set(k, c.id);
  }
  return dups;
}

// 合併預覽：將 src 的作品關聯與子分類移到 dst
export function mergePreview(cats, works, srcId, dstId) {
  const affected = works.filter(w => (w.categoryIds || []).includes(srcId) || w.categoryId === srcId).length;
  const kids = childrenOf(cats, srcId).length;
  return { affected, kids };
}
export function applyMerge(cats, works, srcId, dstId) {
  const newWorks = works.map(w => {
    const ids = new Set(w.categoryIds || []);
    let changed = false;
    if (ids.delete(srcId)) changed = true;
    if (changed) ids.add(dstId);
    if (w.categoryId === srcId) { w.categoryId = dstId; changed = true; }
    if (w.primaryCategoryId === srcId) { w.primaryCategoryId = dstId; changed = true; }
    return changed ? { ...w, categoryIds: [...ids] } : w;
  });
  const newCats = cats.filter(c => c.id !== srcId).map(c => c.parentId === srcId ? { ...c, parentId: dstId } : c);
  return { cats: newCats, works: newWorks };
}

// 刪除預覽與套用：子分類上移到祖父層或指定目標
export function applyDelete(cats, works, id, { moveChildrenTo = null, moveWorksTo = null } = {}) {
  const newCats = cats.filter(c => c.id !== id).map(c =>
    c.parentId === id ? { ...c, parentId: moveChildrenTo ?? cats.find(x => x.id === id)?.parentId ?? null } : c);
  const newWorks = works.map(w => {
    const ids = new Set(w.categoryIds || []);
    let changed = ids.delete(id);
    if (w.categoryId === id) { w.categoryId = moveWorksTo; changed = true; }
    if (w.primaryCategoryId === id) { w.primaryCategoryId = moveWorksTo; changed = true; }
    if (changed && moveWorksTo) ids.add(moveWorksTo);
    return changed ? { ...w, categoryIds: [...ids] } : w;
  });
  return { cats: newCats, works: newWorks };
}

// 直接作品數 + 含子分類去重總數
export function counts(cats, works, id) {
  const direct = works.filter(w => (w.categoryIds || []).includes(id) || w.categoryId === id).length;
  const ids = new Set([id, ...descendants(cats, id)]);
  const total = new Set(works.filter(w => (w.categoryIds || []).some(c => ids.has(c)) || ids.has(w.categoryId)).map(w => w.id)).size;
  return { direct, total };
}

// 匯入驗證：重複 ID、無效上層、循環、失效作品關聯
export function validateImport(data, existingCatIds = new Set()) {
  const problems = [];
  const catIds = new Set((data.categories || []).map(c => c.id));
  for (const c of data.categories || []) {
    if (!c.id) problems.push({ kind: 'no-id', item: c.name });
    if (c.parentId && !catIds.has(c.parentId) && !existingCatIds.has(c.parentId)) problems.push({ kind: 'bad-parent', item: c.name, detail: c.parentId });
  }
  const cyc = findCycles(data.categories || []);
  for (const id of cyc) problems.push({ kind: 'cycle', item: id });
  const allIds = new Set([...catIds, ...existingCatIds]);
  for (const w of [...(data.novels || []), ...(data.images || []), ...(data.diaries || [])]) {
    for (const c of w.categoryIds || []) if (!allIds.has(c)) problems.push({ kind: 'dead-ref', item: w.title, detail: c });
  }
  return problems;
}

// ---- 分類範本 ----
export const TEMPLATES = {
  novel: {
    label: '小說',
    groups: {
      '題材': ['奇幻', '科幻', '愛情', '推理', '懸疑', '恐怖', '歷史', '武俠', '冒險', '校園', '日常', '其他'],
      '背景': ['現代', '古代', '未來', '架空世界', '異世界'],
      '篇幅': ['微小說', '短篇', '中篇', '長篇'],
      '創作性質': ['原創', '二次創作', '翻譯'],
    },
  },
  image: {
    label: '圖片',
    groups: {
      '作品形式': ['攝影', '插畫', '繪畫', '漫畫', '平面設計', '3D 作品', '其他'],
      '主題': ['人物', '風景', '動物', '植物', '建築', '美食', '生活', '抽象'],
      '用途': ['個人創作', '練習', '委託作品', '活動紀錄'],
    },
  },
  diary: {
    label: '日記',
    groups: {
      '生活領域': ['日常生活', '工作', '學習', '感情', '家庭', '朋友', '健康', '旅行', '興趣'],
      '記錄形式': ['每日記錄', '每週回顧', '每月回顧', '靈感筆記', '夢境紀錄', '心得感想'],
    },
  },
  craft: {
    label: '手作手札',
    groups: {
      '紙藝': ['摺紙', '剪紙', '卡片', '紙模型'],
      '布藝': ['縫紉', '拼布', '刺繡', '羊毛氈'],
      '編織': ['鉤針', '棒針', '繩結'],
      '飾品': ['串珠', '金屬線', '樹脂飾品'],
      '陶土': ['陶藝', '黏土', '軟陶'],
      '木作': ['木工', '雕刻', '模型'],
      '生活手作': ['皮革', '蠟燭', '手工皂', '花藝', '居家裝飾'],
      '其他手作': [],
    },
  },
  book: {
    label: '繪本',
    groups: {
      '適讀對象': ['幼兒', '兒童', '親子共讀', '大人'],
      '主題': ['動物', '友情', '家庭', '成長', '冒險', '自然', '生活', '奇幻', '節日'],
      '創作方式': ['手繪', '數位繪圖', 'AI 繪圖', '拼貼', '攝影'],
    },
  },
};
export const TAG_TEMPLATES = {
  '氛圍': ['療癒', '溫暖', '歡樂', '悲傷', '黑暗', '浪漫'],
  '元素': ['成長', '友情', '親情', '冒險', '自然', '城市'],
};
export const DIARY_MOODS = ['開心', '平靜', '期待', '難過', '焦慮', '生氣', '疲倦'];
export const DIARY_WEATHERS = ['晴天', '多雲', '陰天', '雨天', '雷雨', '下雪'];

// 範本匯入預覽：依「名稱+上層+類型」判斷新增/略過
export function templatePreview(cats, templateKey) {
  const t = TEMPLATES[templateKey];
  const out = { add: [], skip: [] };
  for (const [group, names] of Object.entries(t.groups)) {
    const exists = cats.find(c => c.name === group && c.type === templateKey && !c.parentId);
    for (const n of names) {
      const dup = cats.find(c => c.name === n && c.type === templateKey && c.parentId === (exists?.id || '__group__'));
      (exists && dup ? out.skip : out.add).push(`${group} → ${n}`);
    }
    if (!exists) out.add.push(group);
  }
  return out;
}
