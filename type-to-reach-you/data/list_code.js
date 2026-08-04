/* 自動產生：勿改外層宣告，只改 ` ` 之間的內容 */
window.LIST_CODE = `
# 一段為一道題目，以空行分隔。# 開頭為註解（在題目文字外）會被忽略。
# 語法高亮在 main.js 內以簡易規則處理。

function debounce(fn, wait) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  };
}

const fibonacci = (n) => {
  if (n < 2) return n;
  let [a, b] = [0, 1];
  for (let i = 2; i <= n; i++) [a, b] = [b, a + b];
  return b;
};

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
  return await res.json();
}

class Queue {
  constructor() { this.items = []; }
  enqueue(x) { this.items.push(x); }
  dequeue() { return this.items.shift(); }
  get size() { return this.items.length; }
}

# Python 範例
def quicksort(arr):
    if len(arr) <= 1:
        return arr
    pivot = arr[len(arr) // 2]
    left = [x for x in arr if x < pivot]
    mid = [x for x in arr if x == pivot]
    right = [x for x in arr if x > pivot]
    return quicksort(left) + mid + quicksort(right)

`;
