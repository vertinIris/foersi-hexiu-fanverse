(async function () {
  await initPage('browse');
  const params = new URLSearchParams(location.search);
  const state = {
    q: params.get('q') || '',
    type: params.get('type') || '',
    tag: params.get('tag') || '',
    status: params.get('status') || '',
    sort: params.get('sort') || 'newest',
    page: parseInt(params.get('page') || '1', 10)
  };

  const catList = document.getElementById('catList');
  const sideTags = document.getElementById('sideTags');
  const worksGrid = document.getElementById('worksGrid');
  const pagination = document.getElementById('pagination');
  const sortSel = document.getElementById('sortSel');
  const localSearch = document.getElementById('localSearch');

  sortSel.value = state.sort;

  function syncUrl() {
    const p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.type) p.set('type', state.type);
    if (state.tag) p.set('tag', state.tag);
    if (state.status) p.set('status', state.status);
    if (state.sort !== 'newest') p.set('sort', state.sort);
    if (state.page > 1) p.set('page', state.page);
    history.replaceState(null, '', '/browse.html?' + p.toString());
  }

  function highlight() {
    const typeList = document.getElementById('typeList');
    if (typeList) typeList.querySelectorAll('a').forEach((a) => {
      a.classList.toggle('active', a.dataset.type === state.type);
    });
    document.querySelectorAll('#filters [data-status]').forEach((a) => {
      a.classList.toggle('active', a.dataset.status === state.status);
    });
  }

  async function load() {
    syncUrl();
    highlight();
    try {
      const data = await API.get('/works?q=' + encodeURIComponent(state.q) +
        '&type=' + state.type + '&tag=' + encodeURIComponent(state.tag) +
        '&status=' + state.status +
        '&mature=' + (localStorage.getItem('fh_age_ok') === '1' ? '1' : '0') +
        '&sort=' + state.sort +
        '&page=' + state.page + '&pageSize=12');
      worksGrid.innerHTML = data.items.length
        ? data.items.map(workCard).join('')
        : '<p class="empty">没有找到匹配的作品，换个筛选试试？</p>';
      renderPagination(data);
    } catch (e) {
      toast(e.message || '加载失败', 'error');
    }
  }

  function renderPagination(data) {
    if (data.pages <= 1) { pagination.innerHTML = ''; return; }
    let html = '';
    html += `<button ${data.page <= 1 ? 'disabled' : ''} data-page="${data.page - 1}">‹ 上一页</button>`;
    const from = Math.max(1, data.page - 2);
    const to = Math.min(data.pages, data.page + 2);
    for (let i = from; i <= to; i++) {
      html += `<button class="${i === data.page ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }
    html += `<button ${data.page >= data.pages ? 'disabled' : ''} data-page="${data.page + 1}">下一页 ›</button>`;
    pagination.innerHTML = html;
    pagination.querySelectorAll('button[data-page]').forEach((b) => {
      b.onclick = () => { state.page = parseInt(b.dataset.page, 10); window.scrollTo({ top: 0 }); load(); };
    });
  }

  // 标签云
  const tags = await API.get('/tags');
  sideTags.innerHTML = tags.tags.length
    ? tags.tags.map((t) => `<a href="#" data-tag="${escapeHtml(t.name)}">#${escapeHtml(t.name)}</a>`).join('')
    : '<span class="empty">暂无</span>';

  document.getElementById('typeList').querySelectorAll('a').forEach((a) => {
    a.onclick = (e) => { e.preventDefault(); state.type = a.dataset.type; state.page = 1; load(); };
  });
  document.querySelectorAll('#filters [data-status]').forEach((a) => {
    a.onclick = (e) => { e.preventDefault(); state.status = a.dataset.status; state.page = 1; load(); };
  });
  sideTags.querySelectorAll('a[data-tag]').forEach((a) => {
    a.onclick = (e) => { e.preventDefault(); state.tag = a.dataset.tag; state.page = 1; load(); };
  });

  sortSel.onchange = () => { state.sort = sortSel.value; state.page = 1; load(); };
  localSearch.oninput = debounce(() => { state.q = localSearch.value.trim(); state.page = 1; load(); }, 350);

  await load();

  function debounce(fn, ms) {
    let t; return function () { clearTimeout(t); const a = arguments; t = setTimeout(() => fn.apply(null, a), ms); };
  }
})();
