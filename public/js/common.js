// 公共脚本：API 客户端、鉴权状态、导航渲染、通用工具。全局可用。
const API = {
  async req(method, path, body) {
    if (location.protocol === 'file:') {
      throw new Error('当前通过 file:// 打开，无法调用 API。请先启动服务器，通过 http://localhost:3000 或 http://localhost:3001 访问。');
    }
    const headers = { 'Content-Type': 'application/json' };
    const token = localStorage.getItem('fh_token');
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const res = await fetch('/api' + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    let data = {};
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) {
      const err = new Error(data.error || '请求失败');
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  },
  get(p) { return this.req('GET', p); },
  post(p, b) { return this.req('POST', p, b); },
  put(p, b) { return this.req('PUT', p, b); },
  del(p, b) { return this.req('DELETE', p, b); }
};

// ---- 内容分级 ----
const RATINGS = ['G', 'T', 'M', 'E'];
const RATING_LABELS = { G: '全年龄', T: '青少年', M: '成熟', E: '限制级' };
const RATING_CLASS = { G: 'g', T: 't', M: 'm', E: 'e' };
const TYPE_LABELS = { novel: '小说', short: '短篇', setting: '设定' };
const SITE_TITLE = '佛尔思 · 同人创作平台';

// 线性图标：以 SVG 替代 emoji，保持视觉克制统一
const ICON = {
  bell: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
  moon: '<svg class="icon i-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  sun: '<svg class="icon i-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  heart: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l8.8 8.8 8.8-8.8a5.5 5.5 0 0 0 0-7.8z"/></svg>',
  heartOn: '<svg class="icon icon-fill" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l8.8 8.8 8.8-8.8a5.5 5.5 0 0 0 0-7.8z"/></svg>',
  star: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/></svg>',
  starOn: '<svg class="icon icon-fill" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/></svg>'
};
function typeBadge(type) { return `<span class="type-tag">${escapeHtml(TYPE_LABELS[type] || type)}</span>`; }
function authorLink(w) { return `<a class="author-link" href="/author.html?id=${w.authorId}">${escapeHtml(w.authorName)}</a>`; }
function authorAvatar(name) {
  const h = String(name).split('').reduce((a, c) => ((a * 31 + c.charCodeAt(0)) >>> 0), 0);
  const colors = ['#3a5a40','#6d597a','#264653','#7f5539','#3d405b','#588157','#b56576','#2a9d8f'];
  const c = colors[h % colors.length];
  const t = escapeHtml(name.slice(0, 1));
  return `<span class="author-avatar" style="background:${c}">${t}</span>`;
}
function ratingBadge(rating) {
  const r = RATINGS.includes(rating) ? rating : 'G';
  if (r === 'G' || r === 'T') return '';
  return `<span class="rating-tag" title="内容分级：${RATING_LABELS[r]}">${RATING_LABELS[r]}</span>`;
}
// 年龄确认：返回 Promise<boolean>。已确认（localStorage fh_age_ok）直接通过；否则弹窗确认。
function ensureAgeConfirmed() {
  return new Promise((resolve) => {
    if (localStorage.getItem('fh_age_ok') === '1') return resolve(true);
    let box = document.getElementById('ageGate');
    if (!box) {
      box = document.createElement('div');
      box.id = 'ageGate';
      box.className = 'modal-mask';
      box.innerHTML = `
        <div class="modal age-modal">
          <h3>年龄确认</h3>
          <p>本站含「成熟 / 限制级」同人内容。根据相关规定，进入前需确认你已年满 18 周岁，并自愿浏览成人向创作。</p>
          <p class="age-warn">若你未满 18 岁，请仅浏览「全年龄 / 青少年」分区。</p>
          <div class="modal-actions">
            <button class="btn btn-ghost" id="ageNo">我未满 18 岁</button>
            <button class="btn btn-primary" id="ageYes">我已满 18 岁，进入</button>
          </div>
        </div>`;
      document.body.appendChild(box);
    }
    box.style.display = 'flex';
    const yes = document.getElementById('ageYes');
    const no = document.getElementById('ageNo');
    const cleanup = () => { box.style.display = 'none'; yes.onclick = null; no.onclick = null; };
    yes.onclick = () => { localStorage.setItem('fh_age_ok', '1'); cleanup(); resolve(true); };
    no.onclick = () => { cleanup(); resolve(false); };
  });
}

let CURRENT_USER = null;
async function loadUser() {
  const token = localStorage.getItem('fh_token');
  if (!token) { CURRENT_USER = null; return null; }
  try {
    const r = await API.get('/me');
    CURRENT_USER = r.user;
    return CURRENT_USER;
  } catch (e) {
    localStorage.removeItem('fh_token');
    CURRENT_USER = null;
    return null;
  }
}
function requireLogin() {
  if (!CURRENT_USER) { location.href = '/auth.html?next=' + encodeURIComponent(location.pathname + location.search); return false; }
  return true;
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const p = (n) => (n < 10 ? '0' + n : '' + n);
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/* ---------- 多媒体内容渲染 ----------
   先整体转义再转换，杜绝 XSS。支持语法：
   ![说明](/uploads/x.png)     图片      @video(https://...)  视频
   @tags:标签1,标签2           标签云    ## 小标题            **加粗**
   [文字](/path)               链接      空行分段
------------------------------------- */
function safeUrl(u) {
  const s = String(u || '').trim();
  // 仅允许站内相对路径与 http(s)，阻断 javascript: / data: 等协议
  return /^(https?:\/\/|\/|\.\/)/i.test(s) ? s : '';
}

function videoEmbed(url) {
  const u = safeUrl(url);
  if (!u) return '';
  let m = u.match(/bilibili\.com\/video\/(BV[0-9A-Za-z]+)/);
  if (m) {
    return '<div class="video-wrap"><iframe src="https://player.bilibili.com/player.html?bvid=' +
      m[1] + '&high_quality=1" scrolling="no" frameborder="0" allowfullscreen loading="lazy"></iframe></div>';
  }
  m = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([0-9A-Za-z_-]{6,})/);
  if (m) {
    return '<div class="video-wrap"><iframe src="https://www.youtube.com/embed/' + m[1] +
      '" frameborder="0" allow="encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>';
  }
  return '<div class="video-wrap"><video src="' + u + '" controls preload="metadata"></video></div>';
}

function renderContent(text) {
  if (!text) return '';
  const lines = escapeHtml(text).split('\n');
  const out = [];
  let para = [];
  const flush = () => {
    if (para.length) { out.push('<p>' + para.join('<br>') + '</p>'); para = []; }
  };

  for (let raw of lines) {
    const line = raw.trim();

    if (line.startsWith('@tags:')) {
      flush();
      const tags = line.slice(6).split(',').map((t) => t.trim()).filter(Boolean);
      out.push('<div class="tagcloud">' + tags.map((t) =>
        '<a href="/browse.html?tag=' + encodeURIComponent(t) + '">' + t + '</a>').join('') + '</div>');
      continue;
    }
    const vm = line.match(/^@video\(([^)]+)\)$/);
    if (vm) {
      flush();
      out.push(videoEmbed(vm[1]) || '<p class="muted">（无法识别的视频链接）</p>');
      continue;
    }
    const im = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (im) {
      flush();
      const src = safeUrl(im[2]);
      if (src) out.push('<figure class="content-figure"><img src="' + src + '" alt="' + im[1] + '" loading="lazy"></figure>');
      continue;
    }
    if (line.startsWith('## ')) { flush(); out.push('<h2>' + line.slice(3) + '</h2>'); continue; }
    if (line.startsWith('### ')) { flush(); out.push('<h3>' + line.slice(4) + '</h3>'); continue; }
    if (!line) { flush(); continue; }

    let html = line
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (s, alt, u) => {
        const src = safeUrl(u);
        return src ? '<img class="inline-img" src="' + src + '" alt="' + alt + '" loading="lazy">' : '';
      })
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (s, t, u) => {
        const href = safeUrl(u);
        return href ? '<a href="' + href + '">' + t + '</a>' : t;
      })
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    para.push(html);
  }
  flush();
  return out.join('');
}
function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const m = 60000, h = 3600000, d = 86400000;
  if (diff < m) return '刚刚';
  if (diff < h) return Math.floor(diff / m) + ' 分钟前';
  if (diff < d) return Math.floor(diff / h) + ' 小时前';
  if (diff < 30 * d) return Math.floor(diff / d) + ' 天前';
  return formatDate(ts);
}

function workCard(w) {
  const statusText = w.status === 'completed' ? '完结' : '连载';
  return `<article class="card" data-id="${w.id}">
    <a class="card-main" href="/work.html?id=${w.id}">
      ${w.cover && safeUrl(w.cover) ? `<img class="work-cover" src="${safeUrl(w.cover)}" alt="${escapeHtml(w.title)}" loading="lazy">` : ''}
      <span class="card-kind">${escapeHtml(TYPE_LABELS[w.type] || '小说')}<span class="sep"></span>${statusText}${ratingBadge(w.rating)}</span>
      <h3 class="card-title">${escapeHtml(w.title)}</h3>
      <p class="card-byline">${authorAvatar(w.authorName)} ${escapeHtml(w.authorName)}</p>
      <p class="card-summary">${escapeHtml(w.summary)}</p>
      <div class="card-tags">${w.tags.slice(0, 3).map((t) => `<a class="tag" href="/browse.html?tag=${encodeURIComponent(t)}">#${escapeHtml(t)}</a>`).join('')}</div>
    </a>
    <div class="card-foot">
      <span>${w.chaptersCount} 章</span>
      <span>${w.views} 阅读</span>
      <span>${w.favoritesCount} 收藏</span>
      <span>${w.kudosCount || 0} Kudos</span>
    </div>
  </article>`;
}

// ---- 导航 ----
function renderNav(active) {
  const user = CURRENT_USER;
  const el = document.getElementById('nav');
  if (!el) return;
  el.innerHTML = `
    <div class="nav-inner">
      <button class="nav-toggle" id="navToggle" aria-label="菜单"><span></span><span></span><span></span></button>
      <a class="brand" href="/index.html">佛尔思<small>同人创作平台</small></a>
      <nav class="nav-links" id="navLinks">
        <a href="/index.html" class="${active === 'home' ? 'active' : ''}">首页</a>
        <a href="/browse.html" class="${active === 'browse' ? 'active' : ''}">书库</a>
        <a href="/characters.html" class="${active === 'chars' ? 'active' : ''}">角色志</a>
        <a href="/about.html" class="${active === 'about' ? 'active' : ''}">关于</a>
        ${user ? `<a href="/dashboard.html" class="${active === 'dash' ? 'active' : ''}">作家后台</a>` : ''}
      </nav>
      <form class="nav-search" onsubmit="return goSearch(event)">
        <input id="navSearch" type="search" placeholder="搜索作品 / 标签 / 作者" />
      </form>
      <div class="nav-user" id="navUser"></div>
      ${user ? `<a class="icon-btn nav-bell" href="/notifications.html" title="通知中心" aria-label="通知中心">${ICON.bell}<span class="bell-count" id="bellCount" style="display:none"></span></a>` : ''}
      <button class="theme-btn" onclick="toggleTheme()" title="切换主题" aria-label="切换主题">${ICON.moon}${ICON.sun}</button>
    </div>`;
  const navUser = document.getElementById('navUser');
  if (user) {
    navUser.innerHTML = `<span class="uname" title="${escapeHtml(user.username)}">${escapeHtml(user.username)}</span><button class="btn btn-ghost btn-sm" onclick="logout()">退出</button>`;
  } else {
    navUser.innerHTML = `<a class="btn btn-primary" href="/auth.html">登录 / 注册</a>`;
  }
  document.getElementById('navToggle').onclick = () =>
    document.getElementById('navLinks').classList.toggle('open');
}
function goSearch(e) {
  e.preventDefault();
  const q = document.getElementById('navSearch').value.trim();
  location.href = '/browse.html?q=' + encodeURIComponent(q);
  return false;
}
async function logout() {
  try { await API.post('/logout'); } catch (e) {}
  localStorage.removeItem('fh_token');
  CURRENT_USER = null;
  location.href = '/index.html';
}

// ---- 主题切换 ----
function initTheme() {
  const t = localStorage.getItem('fh_theme') || 'light';
  document.documentElement.setAttribute('data-theme', t);
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('fh_theme', next);
}

// ---- toast ----
function toast(msg, type) {
  let box = document.getElementById('toast');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toast';
    box.className = 'toast-box';
    document.body.appendChild(box);
  }
  const item = document.createElement('div');
  item.className = 'toast ' + (type || '');
  item.textContent = msg;
  box.appendChild(item);
  setTimeout(() => item.classList.add('show'), 10);
  setTimeout(() => { item.classList.remove('show'); setTimeout(() => item.remove(), 300); }, 2600);
}

function fileProtocolGuard() {
  if (location.protocol !== 'file:') return;
  let box = document.getElementById('fileProtocolBanner');
  if (!box) {
    box = document.createElement('div');
    box.id = 'fileProtocolBanner';
    box.style.cssText = 'position:fixed;top:0;left:0;right:0;background:var(--danger,#c0392b);color:#fff;padding:12px 16px;z-index:9999;text-align:center;font-size:14px;line-height:1.5;';
    box.innerHTML = '当前通过本地文件打开，页面无法连接后台 API。请启动服务器后访问 <a href="http://localhost:3001" style="color:#fff;text-decoration:underline;">http://localhost:3001</a>';
    document.body.appendChild(box);
  }
}

async function loadNotifyCount() {
  if (!CURRENT_USER) return;
  try {
    const r = await API.get('/notifications');
    const el = document.getElementById('bellCount');
    if (el && r.unread > 0) { el.textContent = r.unread > 99 ? '99+' : r.unread; el.style.display = ''; }
  } catch (e) {}
}
async function initPage(active) {
  initTheme();
  try { await loadUser(); } catch (e) { CURRENT_USER = null; }
  renderNav(active);
  fileProtocolGuard();
  loadNotifyCount();
}
