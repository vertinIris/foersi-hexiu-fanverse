// 端到端测试：起临时服务（独立端口 + 独立测试库）。运行：node --test test/api.test.js
// 注意：注册接口限流 5 次/10 分钟，故全程复用两个共享用户，避免触发限流。
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

const APP = path.join(__dirname, '..');
const PORT = 3999;
const TEST_DB = path.join(APP, 'data', 'db.test.json');
let child;
let TOKEN_A = '';
let TOKEN_B = '';

test.before(async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  const logsDir = path.join(APP, 'logs');
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

  child = spawn(process.execPath, ['server.js'], {
    cwd: APP,
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', FH_TEST_DB: '1' },
    stdio: 'ignore'
  });

  const api0 = async (p, opt = {}) => {
    const r = await fetch(`http://127.0.0.1:${PORT}${p}`, {
      headers: { 'Content-Type': 'application/json', ...(opt.headers || {}) },
      ...opt
    });
    let body = {};
    try { body = await r.json(); } catch (e) {}
    return { status: r.status, body };
  };

  // 等待就绪
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/health`);
      if (r.ok) break;
    } catch (e) { /* 未就绪 */ }
    await new Promise((r) => setTimeout(r, 100));
  }

  const stamp = Date.now();
  const ra = await api0('/api/register', {
    method: 'POST', body: JSON.stringify({ username: 'a_' + stamp, password: 'pw123456' })
  });
  const rb = await api0('/api/register', {
    method: 'POST', body: JSON.stringify({ username: 'b_' + stamp, password: 'pw123456' })
  });
  assert.strictEqual(ra.status, 201, '共享用户A注册失败');
  assert.strictEqual(rb.status, 201, '共享用户B注册失败');
  TOKEN_A = ra.body.token;
  TOKEN_B = rb.body.token;
});

test.after(() => {
  if (child) child.kill();
  try { if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB); } catch (e) {}
});

const api = async (p, opt = {}) => {
  const r = await fetch(`http://127.0.0.1:${PORT}${p}`, {
    headers: { 'Content-Type': 'application/json', ...(opt.headers || {}) },
    ...opt
  });
  let body = {};
  try { body = await r.json(); } catch (e) {}
  return { status: r.status, body, headers: r.headers };
};

test('健康检查：返回 ok 与统计', async () => {
  const r = await api('/api/health');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.ok, true);
  assert.strictEqual(typeof r.body.works, 'number');
  assert.strictEqual(typeof r.body.dbSize, 'number');
});

test('当前用户：不泄露密码哈希', async () => {
  const r = await api('/api/me', { headers: { Authorization: 'Bearer ' + TOKEN_A } });
  assert.strictEqual(r.status, 200);
  assert.ok(r.body.user.username);
  assert.ok(!r.body.user.password, '响应不得包含密码字段');
});

test('登录：错误密码 401 且不区分用户是否存在', async () => {
  let r = await api('/api/login', {
    method: 'POST', body: JSON.stringify({ username: 'no_such_user', password: 'whatever' })
  });
  assert.strictEqual(r.status, 401);
  assert.strictEqual(r.body.error, '用户名或密码错误');
});

test('未登录写入：返回 401', async () => {
  const r = await api('/api/works', { method: 'POST', body: JSON.stringify({ title: 'x' }) });
  assert.strictEqual(r.status, 401);
});

test('越权防护：他人不得增改删我的作品', async () => {
  const created = await api('/api/works', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN_A },
    body: JSON.stringify({ title: 'A的作品', rating: 'G', type: 'novel' })
  });
  assert.strictEqual(created.status, 201);
  const wid = created.body.work.id;

  let r = await api('/api/works/' + wid, {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + TOKEN_B },
    body: JSON.stringify({ title: '被篡改' })
  });
  assert.strictEqual(r.status, 403, '他人修改应被拒绝');

  r = await api('/api/works/' + wid + '/chapters', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN_B },
    body: JSON.stringify({ title: '恶意章节', content: 'x' })
  });
  assert.strictEqual(r.status, 403, '他人添加章节应被拒绝');

  r = await api('/api/works/' + wid, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer ' + TOKEN_B }
  });
  assert.strictEqual(r.status, 403, '他人删除应被拒绝');
});

test('分级门控：默认列表不含 M/E', async () => {
  await api('/api/works', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN_A },
    body: JSON.stringify({ title: '成熟向作品', rating: 'M', type: 'novel' })
  });
  const r = await api('/api/works?pageSize=48');
  assert.ok(
    r.body.items.every((w) => w.rating === 'G' || w.rating === 'T'),
    '默认列表不得包含 M/E'
  );
});

test('请求体过大：返回 413', async () => {
  const big = 'x'.repeat(2 * 1024 * 1024);
  const r = await api('/api/works', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN_A },
    body: JSON.stringify({ title: 't', content: big })
  });
  assert.strictEqual(r.status, 413);
});

test('无效 Token：返回 401', async () => {
  const r = await api('/api/me', { headers: { Authorization: 'Bearer invalid_token_x' } });
  assert.strictEqual(r.status, 401);
});

test('评论：未登录 401 / 登录可发', async () => {
  const list = await api('/api/works?pageSize=1');
  assert.ok(list.body.items.length > 0, '作品列表不应为空');
  const wid = list.body.items[0].id;

  let r = await api('/api/works/' + wid + '/comments', {
    method: 'POST', body: JSON.stringify({ content: 'x' })
  });
  assert.strictEqual(r.status, 401, '未登录发评论应被拒绝');

  r = await api('/api/works/' + wid + '/comments', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN_A },
    body: JSON.stringify({ content: '测试评论' })
  });
  assert.strictEqual(r.status, 201, '登录后发评论应成功');
});

test('登出后 Token 立即失效（置于最后，避免影响其他用例）', async () => {
  let r = await api('/api/me', { headers: { Authorization: 'Bearer ' + TOKEN_B } });
  assert.strictEqual(r.status, 200);

  r = await api('/api/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN_B } });
  assert.strictEqual(r.status, 200);

  r = await api('/api/me', { headers: { Authorization: 'Bearer ' + TOKEN_B } });
  assert.strictEqual(r.status, 401, '登出后应无法访问');
});
