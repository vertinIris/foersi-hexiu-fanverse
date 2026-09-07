(async function () {
  await initPage('');
  const id = new URLSearchParams(location.search).get('id');
  const root = document.getElementById('authorRoot');
  if (!id) { root.innerHTML = '<p class="empty">缺少作者 ID</p>'; return; }

  try {
    const [profile, worksData] = await Promise.all([
      API.get('/authors/' + id),
      API.get('/works?author=' + id + '&pageSize=48')
    ]);
    const a = profile.author;
    const s = profile.stats;
    const isSelf = CURRENT_USER && CURRENT_USER.id === a.id;

    root.innerHTML = `
      <div class="author-hero">
        <div class="author-hero-avatar">${authorAvatar(a.username)}</div>
        <div class="author-hero-info">
          <h1>${escapeHtml(a.username)} ${isSelf ? '<span class="author-badge">你</span>' : ''}</h1>
          <p class="author-bio">${escapeHtml(a.bio || '这位作者很低调，还没有写简介。')}</p>
          <div class="author-stats-bar">
            <div><b>${s.works}</b>作品</div>
            <div><b>${s.words}</b>字数</div>
            <div><b>${s.views}</b>阅读</div>
            <div><b>${s.favorites}</b>收藏</div>
            <div><b>${s.kudos}</b>Kudos</div>
            <div><b>${s.followers}</b>关注者</div>
          </div>
          ${isSelf ? '' : `<button class="btn btn-primary" id="followBtn">${profile.isFollowing ? '已关注' : '关注作者'}</button>`}
        </div>
      </div>

      <div class="section">
        <div class="section-head"><h2>作品列表</h2></div>
        <div class="grid">${worksData.items.length ? worksData.items.map(workCard).join('') : '<p class="empty">暂无作品</p>'}</div>
      </div>`;

    const btn = document.getElementById('followBtn');
    if (btn) btn.onclick = async () => {
      if (!requireLogin()) return;
      try {
        const r = await API.post('/authors/' + id);
        btn.textContent = r.following ? '已关注' : '关注作者';
        toast(r.following ? '已关注，作者会收到通知' : '已取消关注', 'success');
      } catch (e) { toast(e.message || '操作失败', 'error'); }
    };
  } catch (e) {
    root.innerHTML = '<p class="empty">' + escapeHtml(e.message || '加载失败') + '</p>';
  }
})();
