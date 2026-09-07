(async function () {
  try {
    await initPage('dash');
    if (location.protocol === 'file:') {
      document.getElementById('dashRoot').innerHTML = `<div class="panel" style="text-align:center;padding:48px 24px">
        <h2 style="margin-top:0">页面加载失败</h2>
        <p>当前通过本地文件打开 dashboard.html，无法连接后台 API。</p>
        <p style="margin:16px 0">请先运行 <code style="background:var(--card-bg);padding:2px 6px;border-radius:4px">node server.js</code>，然后通过服务器地址访问。</p>
        <a class="btn btn-primary" href="http://localhost:3001/dashboard.html">访问 http://localhost:3001</a>
      </div>`;
      return;
    }
    if (!requireLogin()) return;

  const TYPES = { novel: '小说', short: '短篇', setting: '设定' };
  const RATING_LABELS = { G: 'G 全年龄', T: 'T 青少年', M: 'M 成熟', E: 'E 限制级' };
  function typeOptions(sel) {
    return Object.entries(TYPES).map(([id, name]) => `<option value="${id}" ${id === sel ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('');
  }
  function ratingOptions(sel) {
    return Object.entries(RATING_LABELS).map(([id, name]) => `<option value="${id}" ${id === sel ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('');
  }
  function milestoneHint(stats) {
    const hints = [];
    if (stats.works >= 1) hints.push('已发布首部作品');
    if (stats.words >= 1000) hints.push('累计字数破千');
    if (stats.views >= 100) hints.push('总阅读破百');
    if (stats.favorites >= 10) hints.push('总收藏破十');
    if (stats.kudos >= 10) hints.push('总 Kudos 破十');
    return hints.length ? `<div class="milestones">${hints.map((h) => `<span class="milestone">${h}</span>`).join('')}</div>` : '';
  }

  const root = document.getElementById('dashRoot');
  let activeTab = 'works';
  let editingWorkId = null;
  let editingChapterId = null;

  function tabsHtml() {
    return `<div class="tabs">
      <button class="${activeTab === 'works' ? 'active' : ''}" data-tab="works">我的作品</button>
      <button class="${activeTab === 'new' ? 'active' : ''}" data-tab="new">新建作品</button>
      <button class="${activeTab === 'edit' ? 'active' : ''}" data-tab="edit" style="${activeTab === 'edit' ? '' : 'display:none'}">编辑作品</button>
      <button class="${activeTab === 'fav' ? 'active' : ''}" data-tab="fav">我的收藏</button>
      ${CURRENT_USER && CURRENT_USER.role === 'admin' ? `<button class="${activeTab === 'pages' ? 'active' : ''}" data-tab="pages">站点内容</button>` : ''}
    </div>`;
  }

  function bindTabs() {
    root.querySelectorAll('.tabs button[data-tab]').forEach((b) => {
      b.onclick = () => { activeTab = b.dataset.tab; render(); };
    });
  }

  function render() {
    root.innerHTML = tabsHtml() + `<div id="dashBody"></div>`;
    bindTabs();
    const body = document.getElementById('dashBody');
    if (activeTab === 'works') renderWorks(body);
    else if (activeTab === 'new') renderNew(body);
    else if (activeTab === 'edit') renderEdit(body, editingWorkId);
    else if (activeTab === 'fav') renderFav(body);
    else if (activeTab === 'pages') renderPages(body);
  }

  /* ---------- 站点内容编辑（角色志 / 关于本站），仅管理员 ---------- */
  let pageKey = 'characters';
  let pageDraft = null;

  function insertAtCursor(el, text) {
    const s = el.selectionStart || 0;
    const e = el.selectionEnd || 0;
    el.value = el.value.slice(0, s) + text + el.value.slice(e);
    el.focus();
    el.selectionStart = el.selectionEnd = s + text.length;
  }

  async function renderPages(body) {
    if (!CURRENT_USER || CURRENT_USER.role !== 'admin') {
      body.innerHTML = '<div class="panel"><p class="empty">仅管理员可编辑站点页面。</p></div>';
      return;
    }
    body.innerHTML = '<p class="empty">加载中…</p>';
    try {
      const { page } = await API.get('/pages/' + pageKey);
      pageDraft = page;
      renderPageEditor(body);
    } catch (e) {
      body.innerHTML = '<div class="panel"><p class="empty">加载失败：' + escapeHtml(e.message || '') + '</p></div>';
    }
  }

  function renderPageEditor(body) {
    body.innerHTML = `
      <div class="panel">
        <h2 style="margin-top:0">站点内容编辑</h2>
        <p class="muted" style="font-size:13px">此处内容面向全站公开展示。请保持<b>客观中立</b>，用于收录与说明，避免个人观点表述。</p>
        <div class="field">
          <label>编辑页面</label>
          <select id="pageKeySel">
            <option value="characters" ${pageKey === 'characters' ? 'selected' : ''}>角色志</option>
            <option value="about" ${pageKey === 'about' ? 'selected' : ''}>关于本站</option>
          </select>
        </div>
        <div class="field"><label>标题</label><input id="pageTitle" value="${escapeHtml(pageDraft.title || '')}" /></div>
        <div class="field"><label>副标题</label><input id="pageSubtitle" value="${escapeHtml(pageDraft.subtitle || '')}" /></div>
        <div class="field">
          <label>正文</label>
          <textarea id="pageContent" rows="18" style="min-height:300px;font-family:ui-monospace,Menlo,Consolas,monospace">${escapeHtml(pageDraft.content || '')}</textarea>
          <p class="muted" style="font-size:12px;margin-top:6px">
            语法：<code>![说明](图片地址)</code> 图片 · <code>@video(视频链接)</code> 视频 · <code>@tags:标签1,标签2</code> 标签云 · <code>## 标题</code> · <code>**加粗**</code> · <code>[文字](/路径)</code>
          </p>
        </div>
        <div class="form-actions">
          <button class="btn btn-ghost" id="btnInsImg">插入图片</button>
          <button class="btn btn-ghost" id="btnInsVideo">插入视频</button>
          <button class="btn btn-ghost" id="btnInsTags">插入标签云</button>
          <button class="btn btn-primary" id="btnSavePage">保存</button>
        </div>
        <div style="margin-top:20px">
          <label>实时预览</label>
          <div class="panel page-content" id="pagePreview">${renderContent(pageDraft.content || '')}</div>
        </div>
      </div>`;
    bindPageEditor(body);
  }

  function bindPageEditor(body) {
    const ta = body.querySelector('#pageContent');
    const prev = body.querySelector('#pagePreview');
    const sel = body.querySelector('#pageKeySel');

    sel.onchange = () => { pageKey = sel.value; render(); };
    ta.oninput = () => { prev.innerHTML = renderContent(ta.value); };

    // 图片上传（base64 → 服务端存盘）
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
    fileInput.onchange = async () => {
      const f = fileInput.files && fileInput.files[0];
      if (!f) return;
      if (f.size > 5 * 1024 * 1024) { toast('图片不能超过 5MB'); fileInput.value = ''; return; }
      try {
        const dataUrl = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result);
          r.onerror = rej;
          r.readAsDataURL(f);
        });
        const r = await API.post('/upload', { data: dataUrl, name: f.name, type: f.type });
        insertAtCursor(ta, '\n![' + (f.name || '图片') + '](' + r.url + ')\n');
        prev.innerHTML = renderContent(ta.value);
        toast('图片已上传');
      } catch (e) {
        toast('上传失败：' + (e.message || '未知错误'));
      }
      fileInput.value = '';
    };

    body.querySelector('#btnInsImg').onclick = () => fileInput.click();
    body.querySelector('#btnInsVideo').onclick = () => {
      const u = prompt('粘贴视频链接（B站 / YouTube / 直链）：', 'https://');
      if (u) { insertAtCursor(ta, '\n@video(' + u + ')\n'); prev.innerHTML = renderContent(ta.value); }
    };
    body.querySelector('#btnInsTags').onclick = () => {
      insertAtCursor(ta, '\n@tags:标签1,标签2,标签3\n');
      prev.innerHTML = renderContent(ta.value);
    };
    body.querySelector('#btnSavePage').onclick = async () => {
      try {
        await API.put('/pages/' + pageKey, {
          title: body.querySelector('#pageTitle').value,
          subtitle: body.querySelector('#pageSubtitle').value,
          content: ta.value
        });
        toast('已保存');
      } catch (e) {
        toast('保存失败：' + (e.message || '未知错误'));
      }
    };
  }

  async function renderWorks(body) {
    body.innerHTML = '<p class="empty">加载中…</p>';
    try {
      const data = await API.get('/me/works');
      const stats = data.items.reduce((s, w) => {
        s.works += 1; s.words += w.wordsCount || 0; s.views += w.views || 0;
        s.favorites += w.favoritesCount || 0; s.kudos += w.kudosCount || 0; s.comments += w.commentsCount || 0;
        return s;
      }, { works: 0, words: 0, views: 0, favorites: 0, kudos: 0, comments: 0 });
      if (!data.items.length) {
        body.innerHTML = `<div class="panel"><p class="empty">你还没有作品，点击「新建作品」开始创作吧。</p></div>`;
        return;
      }
      body.innerHTML = `<div class="panel">
        <div class="dash-stats">
          <div><b>${stats.works}</b>作品</div>
          <div><b>${stats.words}</b>字数</div>
          <div><b>${stats.views}</b>阅读</div>
          <div><b>${stats.favorites}</b>收藏</div>
          <div><b>${stats.kudos}</b>Kudos</div>
          <div><b>${stats.comments}</b>评论</div>
        </div>
        ${milestoneHint(stats)}
      </div>
      <div class="panel"><table class="dash-table">
        <thead><tr><th>标题</th><th>类型</th><th>分级</th><th>状态</th><th>章节</th><th>收藏 / Kudos</th><th>操作</th></tr></thead>
        <tbody>${data.items.map((w) => `
          <tr>
            <td data-label="标题">${escapeHtml(w.title)}</td>
            <td data-label="类型">${escapeHtml(w.typeName || w.categoryName)}</td>
            <td data-label="分级">${w.rating}</td>
            <td data-label="状态">${w.status === 'completed' ? '完结' : '连载'}</td>
            <td data-label="章节">${w.chaptersCount}</td>
            <td data-label="收藏 / Kudos">${w.favoritesCount} / ${w.kudosCount || 0}</td>
            <td data-label="操作"><div class="dash-actions">
              <button class="btn btn-ghost btn-sm" data-edit="${w.id}">编辑</button>
              <button class="btn btn-danger btn-sm" data-del="${w.id}">删除</button>
            </div></td>
          </tr>`).join('')}
        </tbody></table></div>`;
      body.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => {
        editingWorkId = b.dataset.edit; activeTab = 'edit'; render();
      });
      body.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
        if (!confirm('确定删除该作品及其所有章节、评论？此操作不可恢复。')) return;
        try { await API.del('/works/' + b.dataset.del); toast('已删除', 'success'); render(); }
        catch (e) { toast(e.message || '删除失败', 'error'); }
      });
    } catch (e) { body.innerHTML = '<p class="empty">' + escapeHtml(e.message) + '</p>'; }
  }

  function renderNew(body) {
    body.innerHTML = `<div class="panel">
      <h2 style="margin-top:0">新建作品</h2>
      <form id="newForm">
        <div class="form-row"><label>标题 *</label><input type="text" id="nTitle" required placeholder="给你的作品起一个吸引人的标题" /></div>
        <div class="form-row"><label>作品类型</label><select id="nType">${typeOptions('novel')}</select></div>
        <div class="form-row"><label>内容分级</label><select id="nRating">${ratingOptions('G')}</select><small class="form-tip">成熟/限制级内容默认对未成年读者隐藏</small></div>
        <div class="form-row"><label>简介</label><textarea id="nSummary" placeholder="一句话介绍你的作品…" rows="3"></textarea></div>
        <div class="form-row"><label>标签（空格或逗号分隔）</label><input type="text" id="nTags" placeholder="日常 治愈 温柔 佛尔思" /></div>
        <div class="form-row"><label>封面（可选）</label>
          <img id="nCoverPrev" class="cover-prev" alt="封面预览" style="display:none">
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <input type="file" id="nCoverFile" accept="image/*" hidden>
            <button type="button" class="btn btn-ghost btn-sm" id="nCoverUp">上传图片</button>
            <input type="text" id="nCoverUrl" placeholder="或粘贴封面图片 URL" style="flex:1;min-width:180px">
          </div>
          <small class="form-tip">上传本地图片（≤5MB）或填写图片直链，作为作品卡片与详情页封面。</small>
        </div>
        <div class="form-row"><label>状态</label>
          <select id="nStatus"><option value="ongoing">连载中</option><option value="completed">已完结</option></select>
        </div>
        <div class="form-tip">创建后作品将自动归入「佛休」主分类，作者署名默认为你的用户名，可在个人资料中修改简介。</div>
        <button class="btn btn-primary" type="submit">创建并添加章节</button>
      </form></div>`;
    const nCoverFile = document.getElementById('nCoverFile');
    document.getElementById('nCoverUp').onclick = () => nCoverFile.click();
    nCoverFile.onchange = async () => {
      const f = nCoverFile.files && nCoverFile.files[0];
      if (!f) return;
      if (f.size > 5 * 1024 * 1024) { toast('图片不能超过 5MB'); nCoverFile.value = ''; return; }
      try {
        const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
        const up = await API.post('/upload', { data: dataUrl, name: f.name, type: f.type });
        nCoverUrl.value = up.url;
        nCoverPrev.src = up.url; nCoverPrev.style.display = 'block';
        toast('封面上传成功');
      } catch (e) { toast('上传失败：' + (e.message || '未知错误')); }
      nCoverFile.value = '';
    };
    document.getElementById('newForm').onsubmit = async (e) => {
      e.preventDefault();
      try {
        const r = await API.post('/works', {
          title: nTitle.value, type: nType.value, rating: nRating.value,
          summary: nSummary.value, tags: nTags.value, status: nStatus.value,
          cover: (nCoverUrl.value || '').trim()
        });
        toast('创建成功，现在添加章节吧', 'success');
        editingWorkId = r.work.id; activeTab = 'edit'; render();
      } catch (err) { toast(err.message || '创建失败', 'error'); }
    };
  }

  async function renderEdit(body, id) {
    if (!id) { activeTab = 'works'; render(); return; }
    body.innerHTML = '<p class="empty">加载中…</p>';
    let data;
    try { data = await API.get('/works/' + id); } catch (e) { body.innerHTML = '<p class="empty">' + escapeHtml(e.message) + '</p>'; return; }
    const w = data.work;

    body.innerHTML = `
      <div class="work-edit-head">
        <h2 style="margin:0">编辑：《${escapeHtml(w.title)}》</h2>
        <a class="btn btn-ghost btn-sm" href="/work.html?id=${w.id}">查看前台</a>
      </div>
      <div class="panel" style="margin-bottom:24px">
        <form id="editForm">
          <div class="form-row"><label>标题 *</label><input type="text" id="eTitle" value="${escapeHtml(w.title)}" required /></div>
          <div class="form-row"><label>作品类型</label><select id="eType">${typeOptions(w.type || 'novel')}</select></div>
          <div class="form-row"><label>内容分级</label><select id="eRating">${ratingOptions(w.rating)}</select></div>
          <div class="form-row"><label>简介</label><textarea id="eSummary" rows="3">${escapeHtml(w.summary)}</textarea></div>
          <div class="form-row"><label>标签（空格或逗号分隔）</label><input type="text" id="eTags" value="${escapeHtml(w.tags.join(' '))}" /></div>
          <div class="form-row"><label>封面（可选）</label>
            <img id="eCoverPrev" class="cover-prev" alt="封面预览" ${w.cover ? `src="${safeUrl(w.cover)}" style="display:block"` : 'style="display:none"'}>
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
              <input type="file" id="eCoverFile" accept="image/*" hidden>
              <button type="button" class="btn btn-ghost btn-sm" id="eCoverUp">上传图片</button>
              <input type="text" id="eCoverUrl" value="${escapeHtml(w.cover || '')}" placeholder="或粘贴封面图片 URL" style="flex:1;min-width:180px">
            </div>
            <small class="form-tip">上传本地图片（≤5MB）或填写图片直链，作为作品卡片与详情页封面。</small>
          </div>
          <div class="form-row"><label>状态</label>
            <select id="eStatus"><option value="ongoing" ${w.status === 'ongoing' ? 'selected' : ''}>连载中</option><option value="completed" ${w.status === 'completed' ? 'selected' : ''}>已完结</option></select>
          </div>
          <button class="btn btn-primary" type="submit">保存作品信息</button>
        </form>
      </div>

      <div class="section-head"><h2>章节管理（${data.chapters.length}）</h2></div>
      <div class="chapter-list" id="chList">
        ${data.chapters.map((c) => `
          <div class="chapter-item" data-cid="${c.id}">
            <span class="c-title">第${c.order}章 ${escapeHtml(c.title)}</span>
            <div class="dash-actions">
              <label class="order-label">顺序 <input type="number" class="order-input" data-cid="${c.id}" value="${c.order}" style="width:60px"></label>
              <button class="btn btn-ghost btn-sm" data-cedit="${c.id}">编辑</button>
              <button class="btn btn-danger btn-sm" data-cdel="${c.id}">删</button>
            </div>
          </div>`).join('') || '<p class="empty">还没有章节</p>'}
      </div>

      <div class="chapter-editor" id="chEditor" style="margin-top:18px">
        <div class="ce-head">
          <input type="text" id="chTitle" placeholder="章节标题" />
          <input type="number" id="chOrder" placeholder="顺序" style="width:100px" />
        </div>
        <textarea id="chContent" placeholder="在此撰写章节正文…" rows="12"></textarea>
        <div class="ce-meta"><span id="chWords">0</span> 字 · 自动保存草稿到本地</div>
        <div style="margin-top:10px;display:flex;gap:8px">
          <button class="btn btn-primary btn-sm" id="chSave">保存章节</button>
          <button class="btn btn-ghost btn-sm" id="chCancel" style="display:none">取消编辑</button>
        </div>
      </div>`;

    document.getElementById('editForm').onsubmit = async (e) => {
      e.preventDefault();
      try {
        await API.put('/works/' + id, {
          title: eTitle.value, type: eType.value, rating: eRating.value,
          summary: eSummary.value, tags: eTags.value, status: eStatus.value
        });
        toast('已保存', 'success');
      } catch (err) { toast(err.message || '保存失败', 'error'); }
    };

    const chTitle = document.getElementById('chTitle');
    const chOrder = document.getElementById('chOrder');
    const chContent = document.getElementById('chContent');
    const chSave = document.getElementById('chSave');
    const chCancel = document.getElementById('chCancel');

    function resetCh() {
      editingChapterId = null; chTitle.value = ''; chContent.value = ''; chOrder.value = '';
      chCancel.style.display = 'none'; chSave.textContent = '保存章节';
      updateWords();
    }
    chCancel.onclick = resetCh;

    function updateWords() {
      const wc = (chContent.value || '').replace(/\s/g, '').length;
      document.getElementById('chWords').textContent = wc;
    }
    chContent.oninput = () => { updateWords(); localStorage.setItem('dash_draft_' + id, JSON.stringify({ title: chTitle.value, content: chContent.value, order: chOrder.value })); };
    chTitle.oninput = () => localStorage.setItem('dash_draft_' + id, JSON.stringify({ title: chTitle.value, content: chContent.value, order: chOrder.value }));
    chOrder.oninput = () => localStorage.setItem('dash_draft_' + id, JSON.stringify({ title: chTitle.value, content: chContent.value, order: chOrder.value }));

    // 加载本地草稿（仅新建章节时）
    const draft = !editingChapterId && localStorage.getItem('dash_draft_' + id);
    if (draft) {
      try {
        const d = JSON.parse(draft);
        if (chTitle.value === '') chTitle.value = d.title || '';
        if (chContent.value === '') chContent.value = d.content || '';
        if (chOrder.value === '') chOrder.value = d.order || '';
      } catch (e) {}
    }
    updateWords();

    chSave.onclick = async () => {
      const title = chTitle.value.trim();
      if (!title) { toast('请填写章节标题', 'error'); return; }
      try {
        if (editingChapterId) {
          await API.put('/chapters/' + editingChapterId, { title, content: chContent.value, order: chOrder.value });
          toast('章节已更新', 'success');
        } else {
          await API.post('/works/' + id + '/chapters', { title, content: chContent.value, order: chOrder.value });
          toast('章节已发布', 'success');
        }
        localStorage.removeItem('dash_draft_' + id);
        resetCh();
        renderEdit(body, id);
      } catch (err) { toast(err.message || '保存失败', 'error'); }
    };

    body.querySelectorAll('.order-input').forEach((inp) => {
      inp.onchange = async () => {
        try {
          await API.put('/chapters/' + inp.dataset.cid, { order: inp.value });
          toast('顺序已更新', 'success');
          renderEdit(body, id);
        } catch (e) { toast(e.message || '更新失败', 'error'); }
      };
    });

    body.querySelectorAll('[data-cedit]').forEach((b) => b.onclick = async () => {
      const c = (await API.get('/chapters/' + b.dataset.cedit)).chapter;
      editingChapterId = c.id; chTitle.value = c.title; chContent.value = c.content; chOrder.value = c.order;
      chCancel.style.display = ''; chSave.textContent = '保存修改';
      document.getElementById('chEditor').scrollIntoView({ behavior: 'smooth' });
    });
    body.querySelectorAll('[data-cdel]').forEach((b) => b.onclick = async () => {
      if (!confirm('删除该章节？')) return;
      try { await API.del('/chapters/' + b.dataset.cdel); toast('已删除', 'success'); renderEdit(body, id); }
      catch (e) { toast(e.message || '删除失败', 'error'); }
    });
  }

  async function renderFav(body) {
    body.innerHTML = '<p class="empty">加载中…</p>';
    try {
      const data = await API.get('/favorites');
      body.innerHTML = `<div class="grid">${data.items.map(workCard).join('')}</div>` || '<p class="empty">还没有收藏任何作品</p>';
    } catch (e) { body.innerHTML = '<p class="empty">' + escapeHtml(e.message) + '</p>'; }
  }

    render();
  } catch (e) {
    const root = document.getElementById('dashRoot');
    if (root) {
      root.innerHTML = `<div class="panel" style="text-align:center;padding:48px 24px">
        <h2 style="margin-top:0">页面加载失败</h2>
        <p>${escapeHtml(e.message || '无法连接到服务器')}</p>
        <p style="margin:16px 0">请先运行 <code style="background:var(--card-bg);padding:2px 6px;border-radius:4px">node server.js</code>，然后通过服务器地址访问。</p>
        <a class="btn btn-primary" href="http://localhost:3001/dashboard.html">访问 http://localhost:3001</a>
      </div>`;
    }
  }
})();
