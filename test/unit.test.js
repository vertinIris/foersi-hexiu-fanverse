// 单元测试：纯函数与数据层。运行：node --test test/unit.test.js
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const APP = path.join(__dirname, '..');
const auth = require(path.join(APP, 'lib/auth'));
const store = require(path.join(APP, 'store'));
const ratelimit = require(path.join(APP, 'lib/ratelimit'));

test('密码哈希：相同明文产生不同密文（随机盐）', () => {
  assert.notStrictEqual(auth.hashPassword('demo1234'), auth.hashPassword('demo1234'));
});

test('密码校验：正确通过 / 错误拒绝', () => {
  const h = auth.hashPassword('s3cret-pw');
  assert.ok(auth.verifyPassword('s3cret-pw', h));
  assert.ok(!auth.verifyPassword('wrong-pw', h));
  assert.ok(!auth.verifyPassword('', h));
});

test('密码校验：畸形密文不抛异常（健壮性）', () => {
  assert.ok(!auth.verifyPassword('x', ''));
  assert.ok(!auth.verifyPassword('x', 'no-colon-here'));
  assert.ok(!auth.verifyPassword('x', null));
  assert.ok(!auth.verifyPassword('x', undefined));
  assert.ok(!auth.verifyPassword('x', {}));
});

test('Token：48 位十六进制且唯一', () => {
  const a = auth.genToken();
  const b = auth.genToken();
  assert.strictEqual(a.length, 48);
  assert.match(a, /^[0-9a-f]{48}$/);
  assert.notStrictEqual(a, b);
});

test('字数统计：忽略空白、中文按字计、容错', () => {
  assert.strictEqual(store.countWords('你好 世界'), 4);
  assert.strictEqual(store.countWords('a b\n\nc'), 3);
  assert.strictEqual(store.countWords(''), 0);
  assert.strictEqual(store.countWords(undefined), 0);
  assert.strictEqual(store.countWords(null), 0);
});

test('ID 生成：前缀正确、长度固定、唯一', () => {
  assert.match(store.genId('w'), /^w_[0-9a-f]{16}$/);
  assert.match(store.genId('c'), /^c_[0-9a-f]{16}$/);
  assert.notStrictEqual(store.genId('c'), store.genId('c'));
});

test('速率限制：超限前放行、超限后拒绝、按 IP 隔离', () => {
  const ip1 = '10.0.0.1';
  const ip2 = '10.0.0.2';
  const p = '/api/login';
  let allowed = 0;
  for (let i = 0; i < 10; i++) if (ratelimit.hit(ip1, p) === 0) allowed++;
  assert.strictEqual(allowed, 10, '前 10 次应放行');
  assert.ok(ratelimit.hit(ip1, p) > 0, '第 11 次应限流');
  assert.strictEqual(ratelimit.hit(ip2, p), 0, '不同 IP 独立计数');
});

test('速率限制：不同端点使用各自的桶', () => {
  const ip = '10.0.0.9';
  for (let i = 0; i < 10; i++) ratelimit.hit(ip, '/api/login');
  assert.ok(ratelimit.hit(ip, '/api/login') > 0);
  assert.strictEqual(ratelimit.hit(ip, '/api/works'), 0, '/api/works 应仍有配额');
});
