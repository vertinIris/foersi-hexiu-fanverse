(async function () {
  await initPage('');
  if (!requireLogin()) return;
  const root = document.getElementById('notifyRoot');

  function text(n) {
    const p = n.payload || {};
    switch (n.type) {
      case 'comment': return `<b>${escapeHtml(p.userName)}</b> 评论了你的作品《${escapeHtml(p.workTitle)}》`;
      case 'favorite': return `<b>${escapeHtml(p.userName)}</b> 收藏了你的作品《${escapeHtml(p.workTitle)}》`;
      case 'kudos': return `<b>${escapeHtml(p.userName)}</b> 给了《${escapeHtml(p.workTitle)}》一个 Kudos`;
      case 'follow': return `<b>${escapeHtml(p.userName)}</b> 关注了你`;
      default: return '你收到一条新通知';
    }
  }
  function link(n) {
    const p = n.payload || {};
    if (p.workId) return '/work.html?id=' + p.workId;
    if (p.userId) return '/author.html?id=' + p.userId;
    return '#';
  }

  async function load() {
    try {
      const r = await API.get('/notifications');
      if (!r.notifications.length) {
        root.innerHTML = `<div class="panel"><p class="empty">暂无通知。当有读者评论、收藏、Kudos 或关注你时，会出现在这里。</p></div>`;
        return;
      }
      root.innerHTML = `<div class="panel">
        <div class="section-head"><h2>通知中心</h2><button class="btn btn-ghost btn-sm" id="readAll">全部标为已读</button></div>
        <div class="notify-list">
          ${r.notifications.map((n) => `
            <a class="notify-item ${n.read ? 'read' : ''}" href="${link(n)}">
              <div class="notify-dot"></div>
              <div class="notify-body">${text(n)}</div>
              <div class="notify-time">${timeAgo(n.createdAt)}</div>
            </a>
          `).join('')}
        </div>
      </div>`;
      document.getElementById('readAll').onclick = async () => {
        try { await API.post('/notifications/read-all'); toast('已全部标为已读', 'success'); load(); }
        catch (e) { toast(e.message || '操作失败', 'error'); }
      };
    } catch (e) { root.innerHTML = '<p class="empty">' + escapeHtml(e.message || '加载失败') + '</p>'; }
  }

  load();
})();
