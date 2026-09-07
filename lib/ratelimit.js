// 速率限制：内存滑动窗口，零依赖。单进程部署适用。
const buckets = new Map();

// 顺序敏感：先匹配到的规则生效，兜底规则必须在最后
const RULES = [
  { prefix: '/api/login', limit: 10, window: 60 * 1000 },
  { prefix: '/api/register', limit: 5, window: 10 * 60 * 1000 },
  { prefix: '/api/works', limit: 60, window: 60 * 1000 },
  { prefix: '/api/', limit: 120, window: 60 * 1000 }
];

const DEFAULT_RULE = RULES[RULES.length - 1];

function pick(pathname) {
  for (const r of RULES) if (pathname.startsWith(r.prefix)) return r;
  return DEFAULT_RULE;
}

/**
 * @returns {number} 0 表示放行；>0 表示需等待的秒数（调用方应返回 429）
 */
function hit(ip, pathname) {
  const rule = pick(pathname);
  const key = ip + '|' + rule.prefix;
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now - b.start > rule.window) {
    b = { start: now, count: 0 };
    buckets.set(key, b);
  }
  b.count++;
  if (b.count > rule.limit) {
    return Math.max(1, Math.ceil((rule.window - (now - b.start)) / 1000));
  }
  return 0;
}

// 清理长期未活动的桶，防止 Map 无限增长
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) {
    if (now - v.start > 15 * 60 * 1000) buckets.delete(k);
  }
}, 5 * 60 * 1000);
sweeper.unref(); // 不阻止进程退出

module.exports = { hit, RULES };
