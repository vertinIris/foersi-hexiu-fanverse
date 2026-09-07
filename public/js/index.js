(async function () {
  await initPage('home');

  try {
    const [popular, featured] = await Promise.all([
      API.get('/works?sort=popular&pageSize=4'),
      API.get('/works?q=佛尔思&sort=popular&pageSize=4')
    ]);

    const typeDefs = [
      ['novel', '小说'], ['short', '短篇'], ['setting', '设定']
    ];
    document.getElementById('typeChips').innerHTML =
      `<a class="chip" href="/browse.html">全部</a>` +
      typeDefs.map(([id, name]) => `<a class="chip" href="/browse.html?type=${id}">${escapeHtml(name)}</a>`).join('');

    document.getElementById('featuredGrid').innerHTML = featured.items.length
      ? featured.items.map(workCard).join('') : '<p class="empty">暂无精选</p>';
    document.getElementById('popularGrid').innerHTML = popular.items.length
      ? popular.items.map(workCard).join('') : '<p class="empty">暂无作品</p>';
  } catch (e) {
    toast(e.message || '加载失败', 'error');
  }
})();