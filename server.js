// 佛尔思和休同人作品站 —— 零依赖纯 Node 服务（API + 静态资源）
const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const store = require('./store');
const auth = require('./lib/auth');
const logger = require('./lib/logger');
const ratelimit = require('./lib/ratelimit');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC_DIR = path.join(__dirname, 'public');
const IS_PROD = process.env.NODE_ENV === 'production';

// 浏览计数缓冲 + 会话续期：合并后定时落盘，避免每请求全量重写数据库
const viewBuf = new Map();
let dbDirty = false;
function flushViews() {
  if (!dbDirty) return;
  try {
    const db = store.getDB();
    for (const [id, n] of viewBuf) {
      const w = db.works.find((x) => x.id === id);
      if (w) w.views = (w.views || 0) + n;
    }
    viewBuf.clear();
    store.save();
    dbDirty = false;
  } catch (e) {
    logger.error('批量落盘失败', e);
  }
}
const viewTimer = setInterval(flushViews, 60000);
viewTimer.unref();

// 内容分级：G 全年龄 / T 青少年 / M 成熟 / E 限制级
const RATINGS = ['G', 'T', 'M', 'E'];
const RATING_LABELS = { G: '全年龄', T: '青少年', M: '成熟', E: '限制级' };
const TYPE_LABELS = { novel: '小说', short: '短篇', setting: '设定' };
// 默认仅展示全年龄与青少年内容；成熟/限制级需年龄确认（mature=1）才可见
function isAllowedRating(rating, mature) {
  const r = RATINGS.includes(rating) ? rating : 'G';
  if (mature) return true;
  return r === 'G' || r === 'T';
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

// 请求体上限：普通接口 1MB；上传接口放宽（base64 编码后体积膨胀约 33%）
const MAX_BODY = 1024 * 1024;
const MAX_UPLOAD = 6 * 1024 * 1024;
function readBody(req, limit) {
  const max = limit || MAX_BODY;
  return new Promise((resolve, reject) => {
    let data = '';
    let tooBig = false;
    req.on('data', (c) => {
      if (tooBig) return; // 已超限：丢弃后续分片，不再累加，防止内存增长
      data += c;
      if (data.length > max) {
        tooBig = true;
        data = ''; // 立即释放已缓存内容
      }
    });
    req.on('end', () => {
      // 超限后仍等 end，保证客户端能收到 413 响应而非连接重置
      if (tooBig) {
        const err = new Error('请求体过大');
        err.status = 413;
        return reject(err);
      }
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

// 校验图片魔数，防止伪造 MIME 上传非图片内容
function checkMagic(buf, mime) {
  if (mime === 'image/svg+xml') return true; // 文本格式，安全性单独检查
  if (!buf || buf.length < 12) return false;
  if (mime === 'image/png') return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  if (mime === 'image/jpeg' || mime === 'image/jpg') return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (mime === 'image/gif') return buf.slice(0, 6).toString('ascii') === 'GIF87a' || buf.slice(0, 6).toString('ascii') === 'GIF89a';
  if (mime === 'image/webp') return buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP';
  return false;
}

function publicUser(u) {
  return { id: u.id, username: u.username, email: u.email, bio: u.bio, role: u.role, createdAt: u.createdAt };
}
function publicWork(w, user, db) {
  const cat = db.categories.find((c) => c.id === w.category);
  const author = db.users.find((u) => u.id === w.authorId);
  const kudosed = user ? (db.kudos || []).some((k) => k.userId === user.id && k.workId === w.id) : false;
  return {
    id: w.id,
    title: w.title,
    authorId: w.authorId,
    authorName: w.authorName,
    authorBio: author ? author.bio : '',
    cover: w.cover || '',
    category: w.category,
    categoryName: cat ? cat.name : w.category,
    type: w.type || 'novel',
    typeName: TYPE_LABELS[w.type] || (w.type === 'foxiu' ? '佛休' : w.type),
    rating: RATINGS.includes(w.rating) ? w.rating : 'G',
    summary: w.summary,
    tags: w.tags,
    status: w.status,
    chaptersCount: w.chaptersCount,
    wordsCount: w.wordsCount,
    views: w.views,
    favoritesCount: w.favoritesCount,
    kudosCount: w.kudosCount || 0,
    commentsCount: w.commentsCount,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
    isFavorited: user ? db.favorites.some((f) => f.userId === user.id && f.workId === w.id) : false,
    isKudos: kudosed
  };
}
function notify(db, toUserId, type, payload) {
  if (!toUserId) return;
  const recipient = db.users.find((u) => u.id === toUserId);
  if (!recipient) return;
  const prefs = recipient.notifyOn || {};
  if (prefs[type] === false) return;
  if (!db.notifications) db.notifications = [];
  db.notifications.unshift({
    id: store.genId('nt'),
    userId: toUserId,
    type,
    payload,
    read: false,
    createdAt: Date.now()
  });
}
function getUser(req) {
  const h = req.headers['authorization'] || '';
  const m = h.match(/^Bearer\s+(.+)$/);
  if (!m) return null;
  const token = m[1];
  const db = store.getDB();
  const uid = db.sessions[token];
  if (!uid) return null;
  // Token 滑动过期：7 天未活动即失效（兼容无 meta 的旧 token，首次访问补记）
  const now = Date.now();
  if (!db.sessionsMeta) db.sessionsMeta = {};
  const meta = db.sessionsMeta[token];
  if (meta) {
    if (now - (meta.lastSeen || 0) > store.TOKEN_TTL) {
      delete db.sessions[token];
      delete db.sessionsMeta[token];
      store.save();
      return null;
    }
    meta.lastSeen = now;
    dbDirty = true;
  } else {
    db.sessionsMeta[token] = { createdAt: now, lastSeen: now };
    dbDirty = true;
  }
  return db.users.find((u) => u.id === uid) || null;
}
function recomputeWork(db, workId) {
  const chs = db.chapters.filter((c) => c.workId === workId);
  const work = db.works.find((w) => w.id === workId);
  work.chaptersCount = chs.length;
  work.wordsCount = chs.reduce((s, c) => s + store.countWords(c.content), 0);
  work.updatedAt = Date.now();
}

async function handleApi(req, res, pathname, query) {
  const method = req.method;
  const send = (status, obj) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(obj));
  };

  // 健康检查：无需鉴权，供探活与监控使用
  if (method === 'GET' && pathname === '/api/health') {
    const d0 = store.getDB();
    return send(200, {
      ok: true,
      uptime: Math.round(process.uptime()),
      works: d0.works.length,
      users: d0.users.length,
      dbSize: (() => {
        try { return fs.statSync(store.DB_FILE).size; } catch (e) { return -1; }
      })(),
      version: (() => {
        try { return require('./package.json').version; } catch (e) { return '0.0.0'; }
      })()
    });
  }

  // 速率限制：登录/注册更严格
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
          || (req.socket && req.socket.remoteAddress) || 'unknown';
  const retryAfter = ratelimit.hit(ip, pathname);
  if (retryAfter) {
    res.setHeader('Retry-After', String(retryAfter));
    logger.warn(`限流 ${ip} ${method} ${pathname} retry=${retryAfter}s`);
    return send(429, { error: '请求过于频繁，请稍后再试' });
  }

  const db = store.getDB();
  const user = getUser(req);
  let body = {};
  if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
    try {
      body = await readBody(req, pathname === '/api/upload' ? MAX_UPLOAD : MAX_BODY);
    } catch (e) {
      return send(e.status || 400, { error: '请求体过大' });
    }
  }

  let match;

  // ---------- 认证 ----------
  if (method === 'POST' && pathname === '/api/register') {
    const { username, password, email, bio } = body;
    if (!username || !username.trim()) return send(400, { error: '请填写用户名' });
    if (!password || password.length < 6) return send(400, { error: '密码至少 6 位' });
    if (db.users.find((u) => u.username === username.trim())) return send(400, { error: '用户名已存在' });
    const u = {
      id: store.genId('u'),
      username: username.trim(),
      password: auth.hashPassword(password),
      email: email || '',
      bio: bio || '',
      role: 'author',
      createdAt: Date.now()
    };
    db.users.push(u);
    const token = auth.genToken();
    const now = Date.now();
    db.sessions[token] = u.id;
    if (!db.sessionsMeta) db.sessionsMeta = {};
    db.sessionsMeta[token] = { createdAt: now, lastSeen: now }; // 立即落盘，避免重启后过期时间丢失
    store.save();
    return send(201, { token, user: publicUser(u) });
  }

  if (method === 'POST' && pathname === '/api/login') {
    const { username, password } = body;
    const u = db.users.find((x) => x.username === (username || '').trim());
    if (!u || !auth.verifyPassword(password || '', u.password)) return send(401, { error: '用户名或密码错误' });
    const token = auth.genToken();
    const now = Date.now();
    db.sessions[token] = u.id;
    if (!db.sessionsMeta) db.sessionsMeta = {};
    db.sessionsMeta[token] = { createdAt: now, lastSeen: now }; // 立即落盘，避免重启后过期时间丢失
    store.save();
    return send(200, { token, user: publicUser(u) });
  }

  if (method === 'POST' && pathname === '/api/logout') {
    const h = req.headers['authorization'] || '';
    const m = h.match(/^Bearer\s+(.+)$/);
    if (m && db.sessions[m[1]]) {
      delete db.sessions[m[1]];
      if (db.sessionsMeta) delete db.sessionsMeta[m[1]];
      store.save();
    }
    return send(200, { ok: true });
  }

  if (method === 'GET' && pathname === '/api/me') {
    if (!user) return send(401, { error: '未登录' });
    return send(200, { user: publicUser(user) });
  }

  // ---------- 分类 / 标签 ----------
  if (method === 'GET' && pathname === '/api/categories') {
    return send(200, { categories: db.categories });
  }
  if (method === 'GET' && pathname === '/api/tags') {
    const map = {};
    db.works.forEach((w) => w.tags.forEach((t) => (map[t] = (map[t] || 0) + 1)));
    const tags = Object.entries(map)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 40);
    return send(200, { tags });
  }

  // ---------- 作品列表（筛选/搜索/排序/分页） ----------
  if (method === 'GET' && pathname === '/api/works') {
    let items = db.works.slice();
    const q = (query.q || '').trim().toLowerCase();
    if (q) items = items.filter((w) => (w.title + w.summary + w.authorName + w.tags.join(' ')).toLowerCase().includes(q));
    if (query.category) items = items.filter((w) => w.category === query.category);
    else items = items.filter((w) => w.category === 'foxiu');
    if (query.type) items = items.filter((w) => (w.type || 'novel') === query.type);
    if (query.tag) items = items.filter((w) => w.tags.includes(query.tag));
    if (query.status) items = items.filter((w) => w.status === query.status);
    if (query.author) items = items.filter((w) => w.authorId === query.author);
    if (query.rating) items = items.filter((w) => (w.rating || 'G') === query.rating);
    const mature = query.mature === '1' || query.mature === 'true';
    if (!mature) items = items.filter((w) => isAllowedRating(w.rating, false));
    const sort = query.sort || 'newest';
    items.sort((a, b) => {
      if (sort === 'popular') return b.favoritesCount - a.favoritesCount;
      if (sort === 'views') return b.views - a.views;
      return b.updatedAt - a.updatedAt;
    });
    const total = items.length;
    const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
    const pageSize = Math.min(48, Math.max(1, parseInt(query.pageSize || '12', 10) || 12));
    const start = (page - 1) * pageSize;
    const paged = items.slice(start, start + pageSize).map((w) => publicWork(w, user, db));
    return send(200, { items: paged, total, page, pageSize, pages: Math.ceil(total / pageSize) });
  }

  // ---------- 创建作品 ----------
  if (method === 'POST' && pathname === '/api/works') {
    if (!user) return send(401, { error: '请先登录' });
    const { title, summary, tags, status, rating, type, cover } = body;
    const category = body.category || 'foxiu';
    if (!title || !title.trim()) return send(400, { error: '请填写标题' });
    if (!db.categories.find((c) => c.id === category)) return send(400, { error: '分类无效' });
    const tagArr = Array.isArray(tags)
      ? tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 20)
      : String(tags || '')
          .split(/[,，\s]+/)
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 20);
    const work = {
      id: store.genId('w'),
      title: title.trim(),
      authorId: user.id,
      authorName: user.username,
      category,
      type: TYPE_LABELS[type] ? type : 'novel',
      cover: typeof cover === 'string' ? cover.trim().slice(0, 500) : '',
      summary: (summary || '').trim(),
      tags: tagArr,
      rating: RATINGS.includes(rating) ? rating : 'G',
      kudosCount: 0,
      status: status === 'completed' ? 'completed' : 'ongoing',
      chaptersCount: 0,
      wordsCount: 0,
      views: 0,
      favoritesCount: 0,
      commentsCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    db.works.push(work);
    store.save();
    return send(201, { work: publicWork(work, user, db) });
  }

  // ---------- 作家：我的作品 / 收藏 ----------
  if (method === 'GET' && pathname === '/api/me/works') {
    if (!user) return send(401, { error: '未登录' });
    const items = db.works.filter((w) => w.authorId === user.id).map((w) => publicWork(w, user, db));
    return send(200, { items });
  }
  if (method === 'GET' && pathname === '/api/favorites') {
    if (!user) return send(401, { error: '未登录' });
    const favIds = db.favorites.filter((f) => f.userId === user.id).map((f) => f.workId);
    const items = db.works.filter((w) => favIds.includes(w.id)).map((w) => publicWork(w, user, db));
    return send(200, { items });
  }

  // ---------- 章节：列表 / 新建 ----------
  if ((match = pathname.match(/^\/api\/works\/([^/]+)\/chapters$/))) {
    const workId = match[1];
    const work = db.works.find((w) => w.id === workId);
    if (!work) return send(404, { error: '作品不存在' });
    if (method === 'GET') {
      const list = db.chapters
        .filter((c) => c.workId === workId)
        .sort((a, b) => a.order - b.order)
        .map((c) => ({ id: c.id, title: c.title, order: c.order, wordsCount: c.wordsCount, createdAt: c.createdAt }));
      return send(200, { chapters: list });
    }
    if (method === 'POST') {
      if (!user) return send(401, { error: '请先登录' });
      if (work.authorId !== user.id) return send(403, { error: '只能给自己作品添加章节' });
      const { title, content, order } = body;
      if (!title || !title.trim()) return send(400, { error: '请填写章节标题' });
      const ch = {
        id: store.genId('c'),
        workId,
        title: title.trim(),
        order: order ? Number(order) : db.chapters.filter((c) => c.workId === workId).length + 1,
        content: content || '',
        wordsCount: store.countWords(content || ''),
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      db.chapters.push(ch);
      recomputeWork(db, workId);
      store.save();
      return send(201, { chapter: ch });
    }
  }

  // ---------- 章节：内容 / 更新 / 删除 ----------
  if ((match = pathname.match(/^\/api\/chapters\/([^/]+)$/))) {
    const ch = db.chapters.find((c) => c.id === match[1]);
    if (!ch) return send(404, { error: '章节不存在' });
    const work = db.works.find((w) => w.id === ch.workId);
    if (method === 'GET') {
      return send(200, {
        chapter: { id: ch.id, workId: ch.workId, title: ch.title, order: ch.order, content: ch.content, wordsCount: ch.wordsCount },
        work: { id: work.id, title: work.title, authorName: work.authorName }
      });
    }
    if (!user) return send(401, { error: '请先登录' });
    if (work.authorId !== user.id) return send(403, { error: '无权操作该章节' });
    if (method === 'PUT') {
      if (body.title !== undefined) ch.title = String(body.title).trim() || ch.title;
      if (body.content !== undefined) {
        ch.content = body.content;
        ch.wordsCount = store.countWords(body.content);
      }
      if (body.order !== undefined) ch.order = Number(body.order) || ch.order;
      ch.updatedAt = Date.now();
      recomputeWork(db, work.id);
      store.save();
      return send(200, { chapter: ch });
    }
    if (method === 'DELETE') {
      db.chapters = db.chapters.filter((c) => c.id !== ch.id);
      recomputeWork(db, work.id);
      store.save();
      return send(200, { ok: true });
    }
  }

  // ---------- 评论：列表 / 新增 ----------
  if ((match = pathname.match(/^\/api\/works\/([^/]+)\/comments$/))) {
    const workId = match[1];
    if (!db.works.find((w) => w.id === workId)) return send(404, { error: '作品不存在' });
    if (method === 'GET') {
      const list = db.comments
        .filter((c) => c.workId === workId)
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((c) => ({ id: c.id, userId: c.userId, userName: c.userName, content: c.content, createdAt: c.createdAt }));
      return send(200, { comments: list });
    }
    if (method === 'POST') {
      if (!user) return send(401, { error: '请先登录' });
      const content = (body.content || '').trim();
      if (!content) return send(400, { error: '评论内容不能为空' });
      const cm = { id: store.genId('cm'), workId, userId: user.id, userName: user.username, content, createdAt: Date.now() };
      db.comments.push(cm);
      const work = db.works.find((w) => w.id === workId);
      work.commentsCount = (work.commentsCount || 0) + 1;
      if (work.authorId !== user.id) {
        notify(db, work.authorId, 'comment', { workId, workTitle: work.title, commentId: cm.id, userName: user.username, userId: user.id, content: cm.content });
      }
      store.save();
      return send(201, { comment: cm });
    }
  }

  // ---------- 收藏：切换 ----------
  if ((match = pathname.match(/^\/api\/favorites\/([^/]+)$/))) {
    if (!user) return send(401, { error: '请先登录' });
    const workId = match[1];
    const work = db.works.find((w) => w.id === workId);
    if (!work) return send(404, { error: '作品不存在' });
    const idx = db.favorites.findIndex((f) => f.userId === user.id && f.workId === workId);
    let favorited;
    if (idx >= 0) {
      db.favorites.splice(idx, 1);
      favorited = false;
    } else {
      db.favorites.push({ userId: user.id, workId, createdAt: Date.now() });
      favorited = true;
      if (work.authorId !== user.id) {
        notify(db, work.authorId, 'favorite', { workId, workTitle: work.title, userName: user.username, userId: user.id });
      }
    }
    work.favoritesCount = db.favorites.filter((f) => f.workId === workId).length;
    store.save();
    return send(200, { favorited, count: work.favoritesCount });
  }

  // ---------- Kudos：给作品点个赞 ----------
  if ((match = pathname.match(/^\/api\/works\/([^/]+)\/kudos$/))) {
    const workId = match[1];
    const work = db.works.find((w) => w.id === workId);
    if (!work) return send(404, { error: '作品不存在' });
    if (!user) return send(401, { error: '请先登录' });
    const k = (db.kudos || []).find((x) => x.userId === user.id && x.workId === workId);
    let kudosed;
    if (k) {
      db.kudos = db.kudos.filter((x) => x !== k);
      kudosed = false;
    } else {
      if (!db.kudos) db.kudos = [];
      db.kudos.push({ userId: user.id, workId, createdAt: Date.now() });
      kudosed = true;
      if (work.authorId !== user.id) {
        notify(db, work.authorId, 'kudos', { workId, workTitle: work.title, userName: user.username, userId: user.id });
      }
    }
    work.kudosCount = (db.kudos || []).filter((x) => x.workId === workId).length;
    store.save();
    return send(200, { kudosed, count: work.kudosCount });
  }

  // ---------- 作者主页 ----------
  if (method === 'GET' && pathname.startsWith('/api/authors/')) {
    const authorId = pathname.slice('/api/authors/'.length);
    const author = db.users.find((u) => u.id === authorId);
    if (!author) return send(404, { error: '作者不存在' });
    const works = db.works.filter((w) => w.authorId === authorId);
    const totalWords = works.reduce((s, w) => s + (w.wordsCount || 0), 0);
    const totalViews = works.reduce((s, w) => s + (w.views || 0), 0);
    const totalFav = works.reduce((s, w) => s + (w.favoritesCount || 0), 0);
    const totalKudos = works.reduce((s, w) => s + (w.kudosCount || 0), 0);
    const followers = (db.follows || []).filter((f) => f.authorId === authorId).length;
    const isFollowing = user ? (db.follows || []).some((f) => f.authorId === authorId && f.userId === user.id) : false;
    return send(200, {
      author: { id: author.id, username: author.username, bio: author.bio, createdAt: author.createdAt },
      stats: { works: works.length, words: totalWords, views: totalViews, favorites: totalFav, kudos: totalKudos, followers },
      isFollowing
    });
  }
  if (method === 'POST' && pathname.startsWith('/api/authors/')) {
    const authorId = pathname.slice('/api/authors/'.length);
    const author = db.users.find((u) => u.id === authorId);
    if (!author) return send(404, { error: '作者不存在' });
    if (!user) return send(401, { error: '请先登录' });
    if (author.id === user.id) return send(400, { error: '不能关注自己' });
    if (!db.follows) db.follows = [];
    const idx = db.follows.findIndex((f) => f.authorId === authorId && f.userId === user.id);
    let following;
    if (idx >= 0) {
      db.follows.splice(idx, 1);
      following = false;
    } else {
      db.follows.push({ authorId, userId: user.id, createdAt: Date.now() });
      following = true;
      notify(db, authorId, 'follow', { userName: user.username, userId: user.id });
    }
    store.save();
    const followers = db.follows.filter((f) => f.authorId === authorId).length;
    return send(200, { following, followers });
  }

  // ---------- 通知中心 ----------
  if (method === 'GET' && pathname === '/api/notifications') {
    if (!user) return send(401, { error: '未登录' });
    const list = (db.notifications || []).filter((n) => n.userId === user.id).slice(0, 100);
    const unread = list.filter((n) => !n.read).length;
    return send(200, {
      notifications: list.map((n) => ({ id: n.id, type: n.type, payload: n.payload, read: n.read, createdAt: n.createdAt })),
      unread
    });
  }
  if (method === 'POST' && pathname === '/api/notifications/read-all') {
    if (!user) return send(401, { error: '未登录' });
    (db.notifications || []).forEach((n) => { if (n.userId === user.id) n.read = true; });
    store.save();
    return send(200, { ok: true });
  }

  // ---------- 站点页面（角色志 / 关于）：公开读，管理员写 ----------
  if ((match = pathname.match(/^\/api\/pages\/([a-zA-Z0-9_-]+)$/))) {
    const key = match[1];
    if (method === 'GET') {
      const p = (db.sitePages || []).find((x) => x.key === key);
      if (!p) return send(404, { error: '页面不存在' });
      const editor = db.users.find((u) => u.id === p.updatedBy);
      return send(200, {
        page: {
          key: p.key,
          title: p.title,
          subtitle: p.subtitle || '',
          content: p.content || '',
          updatedAt: p.updatedAt,
          updatedBy: editor ? editor.username : ''
        }
      });
    }
    if (method === 'PUT') {
      if (!user) return send(401, { error: '请先登录' });
      if (user.role !== 'admin') return send(403, { error: '仅管理员可编辑站点页面' });
      if (!db.sitePages) db.sitePages = [];
      let p = db.sitePages.find((x) => x.key === key);
      const now = Date.now();
      if (!p) {
        p = { key, title: key, subtitle: '', content: '', createdAt: now };
        db.sitePages.push(p);
      }
      if (body.title !== undefined) p.title = String(body.title).trim() || p.title;
      if (body.subtitle !== undefined) p.subtitle = String(body.subtitle).trim();
      if (body.content !== undefined) p.content = String(body.content);
      p.updatedAt = now;
      p.updatedBy = user.id;
      store.save();
      return send(200, {
        page: {
          key: p.key, title: p.title, subtitle: p.subtitle,
          content: p.content, updatedAt: p.updatedAt, updatedBy: user.username
        }
      });
    }
  }

  // ---------- 图片上传（base64 → public/uploads） ----------
  if (method === 'POST' && pathname === '/api/upload') {
    if (!user) return send(401, { error: '请先登录' });
    const { data, type, name } = body;
    if (!data || typeof data !== 'string') return send(400, { error: '缺少文件数据' });
    const m = String(data).match(/^data:([^;,]+);base64,([\s\S]*)$/);
    const mime = (m ? m[1] : (type || '')).toLowerCase();
    const raw = m ? m[2] : String(data);
    const ALLOWED = {
      'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg',
      'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg'
    };
    if (!ALLOWED[mime]) return send(400, { error: '仅支持 PNG / JPG / GIF / WebP / SVG' });
    let buf;
    try { buf = Buffer.from(raw, 'base64'); } catch (e) { return send(400, { error: '文件数据格式错误' }); }
    if (!buf.length) return send(400, { error: '文件为空' });
    if (buf.length > 5 * 1024 * 1024) return send(413, { error: '图片不能超过 5MB' });
    if (mime === 'image/svg+xml' && /<script|onload\s*=|javascript:/i.test(buf.toString('utf8'))) {
      return send(400, { error: 'SVG 包含不安全内容' });
    }
    if (!checkMagic(buf, mime)) return send(400, { error: '文件内容与声明类型不符' });

    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dir = path.join(PUBLIC_DIR, 'uploads', String(d.getFullYear()), mm);
    try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { return send(500, { error: '无法创建上传目录' }); }
    const fname = store.genId('img') + '.' + ALLOWED[mime];
    const rel = '/uploads/' + d.getFullYear() + '/' + mm + '/' + fname;
    try {
      fs.writeFileSync(path.join(dir, fname), buf);
    } catch (e) {
      logger.error('上传写入失败', e);
      return send(500, { error: '文件写入失败' });
    }
    if (!db.media) db.media = [];
    db.media.push({
      id: store.genId('md'), userId: user.id, url: rel,
      name: name || '', mime, size: buf.length, createdAt: Date.now()
    });
    store.save();
    return send(201, { url: rel, size: buf.length, mime });
  }

  // ---------- 作品：详情 / 更新 / 删除 ----------
  if ((match = pathname.match(/^\/api\/works\/([^/]+)$/))) {
    const work = db.works.find((w) => w.id === match[1]);
    if (!work) return send(404, { error: '作品不存在' });
    if (method === 'GET') {
      // 缓冲累加，由 flushViews 每 60s 批量落盘（原为每次阅读全量重写数据库）
      viewBuf.set(work.id, (viewBuf.get(work.id) || 0) + 1);
      dbDirty = true;
      const chapters = db.chapters
        .filter((c) => c.workId === work.id)
        .sort((a, b) => a.order - b.order)
        .map((c) => ({ id: c.id, title: c.title, order: c.order, wordsCount: c.wordsCount, createdAt: c.createdAt }));
      return send(200, { work: publicWork(work, user, db), chapters });
    }
    if (!user) return send(401, { error: '请先登录' });
    if (work.authorId !== user.id) return send(403, { error: '无权操作该作品' });
    if (method === 'PUT') {
      if (body.title !== undefined) work.title = String(body.title).trim() || work.title;
      if (body.summary !== undefined) work.summary = String(body.summary).trim();
      if (body.category !== undefined && db.categories.find((c) => c.id === body.category)) work.category = body.category;
      if (body.type !== undefined && TYPE_LABELS[body.type]) work.type = body.type;
      if (body.cover !== undefined) work.cover = String(body.cover).trim().slice(0, 500);
      if (body.rating !== undefined && RATINGS.includes(body.rating)) work.rating = body.rating;
      if (body.status !== undefined) work.status = body.status === 'completed' ? 'completed' : 'ongoing';
      if (body.tags !== undefined) {
        work.tags = Array.isArray(body.tags)
          ? body.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 20)
          : String(body.tags || '').split(/[,，\s]+/).map((t) => t.trim()).filter(Boolean).slice(0, 20);
      }
      work.updatedAt = Date.now();
      store.save();
      return send(200, { work: publicWork(work, user, db) });
    }
    if (method === 'DELETE') {
      db.chapters = db.chapters.filter((c) => c.workId !== work.id);
      db.comments = db.comments.filter((c) => c.workId !== work.id);
      db.favorites = db.favorites.filter((f) => f.workId !== work.id);
      if (db.kudos) db.kudos = db.kudos.filter((k) => k.workId !== work.id);
      if (db.notifications) db.notifications = db.notifications.filter((n) => n.payload && n.payload.workId !== work.id);
      db.works = db.works.filter((w) => w.id !== work.id);
      store.save();
      return send(200, { ok: true });
    }
  }

  return send(404, { error: '接口不存在' });
}

function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('403 Forbidden');
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
}

function gracefulExit(code) {
  flushViews(); // 落盘缓冲的浏览数与会话续期
  process.exit(code);
}

process.on('uncaughtException', (e) => {
  logger.error('uncaughtException', e);
  gracefulExit(1); // 由 systemd 自动拉起
});
process.on('unhandledRejection', (e) => {
  logger.error('unhandledRejection', e);
});

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const isApi = pathname.startsWith('/api/');

  // 排障上下文：Token 只取前 8 位，绝不记录完整值
  const tokM = (req.headers['authorization'] || '').match(/^Bearer\s+(.+)$/);
  const tokShort = tokM ? tokM[1].slice(0, 8) : '';
  const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
                || (req.socket && req.socket.remoteAddress) || '-';
  const logAccess = (status) => {
    if (isApi) logger.access(clientIp, req.method, pathname, status, Date.now() - started, tokShort);
  };

  if (isApi) {
    try {
      await handleApi(req, res, pathname, parsed.query);
      logAccess(res.statusCode);
    } catch (e) {
      logger.error(`${req.method} ${pathname}`, e);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      // 生产环境不返回内部细节，只给脱敏提示
      res.end(JSON.stringify(
        IS_PROD
          ? { error: '服务器内部错误' }
          : { error: '服务器内部错误', detail: e.message }
      ));
      logAccess(500);
    }
  } else {
    serveStatic(req, res, pathname);
  }
});

// 启动清理：过期会话 + 超限通知
try {
  store.getDB();
  const r = store.cleanup();
  if (r.expired || r.adopted || r.orphaned) store.save();
} catch (e) {
  logger.error('启动清理失败', e);
}

server.listen(PORT, HOST, () => {
  const msg = `佛尔思和休同人站已启动: http://${HOST}:${PORT} (NODE_ENV=${process.env.NODE_ENV || 'development'})`;
  console.log(msg);
  logger.info(msg);
});

process.on('SIGTERM', () => { logger.info('收到 SIGTERM，优雅退出'); gracefulExit(0); });
process.on('SIGINT', () => { logger.info('收到 SIGINT，优雅退出'); gracefulExit(0); });
