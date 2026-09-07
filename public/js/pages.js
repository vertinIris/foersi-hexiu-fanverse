// 站点页面（角色志 / 关于本站）：内容来自服务端 sitePages，创作者可在后台编辑
(async function () {
  const path = location.pathname;
  const key = path.indexOf('characters') >= 0 ? 'characters' : 'about';

  try {
    await initPage(key === 'characters' ? 'chars' : 'about');
  } catch (e) {
    /* 登录态失败不影响内容展示 */
  }

  const root = document.getElementById('pageRoot');
  if (!root) return;

  if (location.protocol === 'file:') {
    root.innerHTML = '<div class="panel"><p>请通过服务器访问本页：</p>' +
      '<p><code>node server.js</code> 然后打开 <code>http://localhost:3001' + path + '</code></p></div>';
    return;
  }

  try {
    const { page } = await API.get('/pages/' + key);
    if (page.title) document.title = page.title + ' · 佛尔思 · 同人创作平台';

    const meta = [];
    if (page.updatedAt) meta.push('最后更新：' + formatDate(page.updatedAt));
    if (page.updatedBy) meta.push('维护者：' + escapeHtml(page.updatedBy));

    root.innerHTML =
      '<div class="section-head">' +
        '<h2>' + escapeHtml(page.title || '') + '</h2>' +
        (page.subtitle ? '<span class="more">' + escapeHtml(page.subtitle) + '</span>' : '') +
      '</div>' +
      '<div class="panel page-content">' + renderContent(page.content) + '</div>' +
      (meta.length ? '<p class="muted" style="margin-top:12px;font-size:13px">' + meta.join(' · ') + '</p>' : '');
  } catch (e) {
    root.innerHTML = '<div class="panel"><p class="muted">内容加载失败，请确认服务已启动。</p></div>';
  }
})();
