(async function () {
  await initPage('');
  const id = new URLSearchParams(location.search).get('id');
  const root = document.getElementById('workRoot');
  if (!id) { root.innerHTML = '<p class="empty">缺少作品 ID</p>'; return; }

  let work, chapters;

  async function load() {
    try {
      const data = await API.get('/works/' + id);
      work = data.work;
      chapters = data.chapters;
      render();
    } catch (e) {
      root.innerHTML = '<p class="empty">' + escapeHtml(e.message || '加载失败') + '</p>';
    }
  }

  function render() {
    const isAuthor = CURRENT_USER && work.authorId === CURRENT_USER.id;
    const first = chapters[0];
    const readUrl = first ? `/read.html?work=${work.id}&chapter=${first.id}` : '#';
    const matureGated = (work.rating === 'M' || work.rating === 'E') && localStorage.getItem('fh_age_ok') !== '1';
    root.innerHTML = `
      <div class="work-hero">
        <div class="work-cover" aria-hidden="true">${escapeHtml(work.title.slice(0, 1))}</div>
        <div class="work-info">
          <h1>${escapeHtml(work.title)}</h1>
          <div class="work-sub">
            <span>${escapeHtml(work.typeName || work.categoryName)}</span>
            ${ratingBadge(work.rating)}
            <span class="dot"></span>
            <span>${work.status === 'completed' ? '已完结' : '连载中'}</span>
          </div>
          <div class="work-tags">${work.tags.map((t) => `<a class="tag" href="/browse.html?tag=${encodeURIComponent(t)}">#${escapeHtml(t)}</a>`).join('')}</div>
          <div class="author-card-mini">
            ${authorAvatar(work.authorName)}
            <div>
              <div class="author-name">${authorLink(work)} ${isAuthor ? '<span class="author-badge">作者</span>' : ''}</div>
              <div class="author-bio">${escapeHtml(work.authorBio || '这位作者很低调，还没有写简介。')}</div>
            </div>
          </div>
          <p style="color:var(--text-soft);margin:6px 0 0">${escapeHtml(work.summary)}</p>
          <div class="work-actions">
            <a class="btn btn-primary" id="readBtn" href="${readUrl}">${first ? '开始阅读' : '暂无章节'}</a>
            <button class="btn btn-ghost ${work.isFavorited ? 'on' : ''}" id="favBtn">${work.isFavorited ? ICON.heartOn : ICON.heart}${work.isFavorited ? '已收藏' : '收藏'}</button>
            <button class="btn btn-ghost ${work.isKudos ? 'on' : ''}" id="kudosBtn">${work.isKudos ? ICON.starOn : ICON.star}${work.isKudos ? '已 Kudos' : 'Kudos'}</button>
            ${isAuthor ? `<a class="btn btn-ghost" href="/dashboard.html">管理作品</a>` : ''}
          </div>
          <div class="work-stats">
            <div><b>${work.chaptersCount}</b>章节</div>
            <div><b>${work.wordsCount}</b>字数</div>
            <div><b>${work.views}</b>阅读</div>
            <div><b id="favCount">${work.favoritesCount}</b>收藏</div>
            <div><b id="kudosCount">${work.kudosCount || 0}</b>Kudos</div>
            <div><b>${work.commentsCount}</b>评论</div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-head"><h2>章节目录（${chapters.length}）</h2></div>
        <div class="chapter-list">
          ${matureGated
            ? `<div class="age-gate-note"><span class="gate-mark">成熟向内容</span>本作需确认年满 18 岁后方可阅读。<div style="margin-top:var(--s-4)"><button class="btn btn-primary btn-sm" id="ageGateBtn">确认年龄并阅读</button></div></div>`
            : (chapters.map((c) => `
            <a class="chapter-item" href="/read.html?work=${work.id}&chapter=${c.id}">
              <span class="c-title">第${c.order}章 ${escapeHtml(c.title)}</span>
              <span class="c-meta">${c.wordsCount}字</span>
            </a>`).join('') || '<p class="empty">作者还未发布章节</p>')}
        </div>
      </div>

      <div class="section comments">
        <div class="section-head"><h2>评论（${work.commentsCount}）</h2></div>
        <div id="commentArea"></div>
      </div>
    `;
    const ageGateBtn = document.getElementById('ageGateBtn');
    if (ageGateBtn) ageGateBtn.onclick = async () => {
      const ok = await ensureAgeConfirmed();
      if (ok) load();
    };
    const readBtn = document.getElementById('readBtn');
    if (readBtn && first) readBtn.addEventListener('click', async (e) => {
      if ((work.rating === 'M' || work.rating === 'E') && localStorage.getItem('fh_age_ok') !== '1') {
        e.preventDefault();
        const ok = await ensureAgeConfirmed();
        if (ok) location.href = readUrl;
      }
    });
    bindFav();
    bindKudos();
    renderComments();
  }

  function bindKudos() {
    const btn = document.getElementById('kudosBtn');
    if (!btn) return;
    btn.onclick = async () => {
      if (!requireLogin()) return;
      try {
        const r = await API.post('/works/' + work.id + '/kudos');
        work.isKudos = r.kudosed;
        btn.classList.toggle('on', r.kudosed);
        btn.innerHTML = (r.kudosed ? ICON.starOn : ICON.star) + (r.kudosed ? '已 Kudos' : 'Kudos');
        document.getElementById('kudosCount').textContent = r.count;
        toast(r.kudosed ? '已给 Kudos，作者会收到鼓励' : '已取消 Kudos', 'success');
      } catch (e) { toast(e.message || '操作失败', 'error'); }
    };
  }

  function bindFav() {
    const btn = document.getElementById('favBtn');
    if (!btn) return;
    btn.onclick = async () => {
      if (!requireLogin()) return;
      try {
        const r = await API.post('/favorites/' + work.id);
        work.isFavorited = r.favorited;
        btn.classList.toggle('on', r.favorited);
        btn.innerHTML = (r.favorited ? ICON.heartOn : ICON.heart) + (r.favorited ? '已收藏' : '收藏');
        document.getElementById('favCount').textContent = r.count;
        toast(r.favorited ? '已加入收藏' : '已取消收藏', 'success');
      } catch (e) { toast(e.message || '操作失败', 'error'); }
    };
  }

  async function renderComments() {
    const area = document.getElementById('commentArea');
    if (!area) return;
    const data = await API.get('/works/' + work.id + '/comments');
    const list = data.comments.map((c) => {
      const isAuthor = c.userId === work.authorId;
      return `<div class="comment-item ${isAuthor ? 'comment-author' : ''}">
        <div class="comment-avatar">${escapeHtml(c.userName.slice(0, 1))}</div>
        <div class="comment-body">
          <div class="comment-meta"><b>${escapeHtml(c.userName)}</b> ${isAuthor ? '<span class="author-badge">作者</span>' : ''} · ${timeAgo(c.createdAt)}</div>
          <div class="comment-content">${escapeHtml(c.content)}</div>
        </div>
      </div>`;
    }).join('');

    const form = CURRENT_USER
      ? `<form class="comment-form" id="commentForm">
           <textarea id="commentInput" placeholder="说点什么吧…（友善评论）"></textarea>
           <button class="btn btn-primary" type="submit">发表评论</button>
         </form>`
      : `<p class="empty"><a href="/auth.html">登录</a> 后参与评论</p>`;

    area.innerHTML = form + (list || '<p class="empty">还没有评论，来抢沙发～</p>');

    const cf = document.getElementById('commentForm');
    if (cf) cf.onsubmit = async (e) => {
      e.preventDefault();
      const input = document.getElementById('commentInput');
      const content = input.value.trim();
      if (!content) return;
      try {
        await API.post('/works/' + work.id + '/comments', { content });
        input.value = '';
        await load();
        toast('评论成功', 'success');
      } catch (err) { toast(err.message || '评论失败', 'error'); }
    };
  }

  await load();
})();
