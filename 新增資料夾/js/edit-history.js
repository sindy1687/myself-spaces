// 編輯器復原／重做：以 innerHTML 快照記錄（含圖片移動、縮放、區塊排序等非文字操作）
export function createHistory(ce, { limit = 100, onRestore } = {}) {
  let stack = [ce.innerHTML], idx = 0, timer = null;
  const snap = () => {
    clearTimeout(timer); timer = null;
    const h = ce.innerHTML;
    if (h === stack[idx]) return;
    stack = stack.slice(0, idx + 1);
    stack.push(h);
    if (stack.length > limit) stack.shift();
    idx = stack.length - 1;
  };
  const restore = () => {
    ce.innerHTML = stack[idx];
    onRestore?.();
    ce.dispatchEvent(new Event('input', { bubbles: true }));
    snap(); // input 事件不會再多記一筆（內容相同）
  };
  // 打字：停頓 400ms 記一筆
  ce.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(snap, 400); });
  const h = {
    record: snap,
    // 包住一次操作：之前先存、之後再存，並通知「內容已變更」
    change(fn) {
      snap();
      const r = fn();
      const done = () => { snap(); ce.dispatchEvent(new Event('input', { bubbles: true })); };
      return r?.then ? r.then(v => (done(), v)) : (done(), r);
    },
    undo() { if (timer) snap(); if (idx > 0) { idx--; restore(); } },
    redo() { if (idx < stack.length - 1) { idx++; restore(); } },
    get canUndo() { return idx > 0 || !!timer; },
    get canRedo() { return idx < stack.length - 1; },
  };
  return h;
}
