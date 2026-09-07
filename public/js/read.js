(async function () {
  await initPage('');
  // 阅读进度条（固定顶部细线，随滚动推进）
  const readProgress = document.createElement('div');
  readProgress.className = 'read-progress';
  readProgress.id = 'readProgress';
  document.body.appendChild(readProgress);
  function updateReadProgress() {
    const h = document.documentElement.scrollHeight - window.innerHeight;
    const p = h > 0 ? Math.min(100, Math.max(0, (window.scrollY / h) * 100)) : 0;
    readProgress.style.width = p + '%';
  }
  window.addEventListener('scroll', updateReadProgress, { passive: true });
  window.addEventListener('resize', updateReadProgress);

  const url = new URLSearchParams(location.search);
  const workId = url.get('work');
  let chapterId = url.get('chapter');
  const root = document.getElementById('readContent');
  const toolbar = document.getElementById('readToolbar');
  const navEl = document.getElementById('readNav');

  if (!workId) { root.innerHTML = '<p class="empty">缺少作品参数</p>'; return; }

  let work, chapters, current;

  function applyFont() {
    const f = parseInt(localStorage.getItem('fh_readfont') || '18', 10);
    document.documentElement.style.setProperty('--read-font', f + 'px');
  }

  async function loadWork() {
    const data = await API.get('/works/' + workId);
    work = data.work;
    chapters = data.chapters;
    if (!chapterId || !chapters.find((c) => c.id === chapterId)) {
      chapterId = chapters[0] && chapters[0].id;
    }
  }

  async function renderChapter() {
    if (!chapterId) { root.innerHTML = '<p class="empty">该作品暂无章节</p>'; return; }
    const data = await API.get('/chapters/' + chapterId);
    current = data.chapter;
    const idx = chapters.findIndex((c) => c.id === chapterId);
    const prev = chapters[idx - 1];
    const next = chapters[idx + 1];

    root.innerHTML = `
      <h1 class="rc-title">${escapeHtml(current.title)}</h1>
      <div class="rc-text page-content">${renderContent(current.content)}</div>`;

    navEl.innerHTML = `
      <a class="${prev ? '' : 'disabled'}" href="${prev ? '/read.html?work=' + workId + '&chapter=' + prev.id : '#'}">‹ 上一章</a>
      <a class="${next ? '' : 'disabled'}" href="${next ? '/read.html?work=' + workId + '&chapter=' + next.id : '#'}">下一章 ›</a>`;

    renderToolbar(idx);
    applyFont();
    window.scrollTo({ top: 0 });
    updateReadProgress();
  }

  function renderToolbar(idx) {
    toolbar.innerHTML = `
      <a class="btn btn-ghost btn-sm" href="/work.html?id=${workId}">目录</a>
      <div class="rt-title">
        <span>${escapeHtml(work.title)}</span>
        <a class="rt-author" href="/author.html?id=${work.authorId}">${escapeHtml(work.authorName)}</a>
      </div>
      <span class="spacer" style="flex:1"></span>
      <select id="jumpSel" title="跳转章节">
        ${chapters.map((c, i) => `<option value="${c.id}" ${i === idx ? 'selected' : ''}>第${c.order}章 ${escapeHtml(c.title)}</option>`).join('')}
      </select>
      <button class="theme-btn" onclick="toggleTheme()" title="切换主题" aria-label="切换主题">${ICON.moon}${ICON.sun}</button>
      <button class="btn btn-ghost btn-sm" id="fontDec">A-</button>
      <button class="btn btn-ghost btn-sm" id="fontInc">A+</button>`;
    document.getElementById('jumpSel').onchange = (e) => {
      chapterId = e.target.value;
      renderChapter();
    };
    document.getElementById('fontDec').onclick = () => {
      const f = Math.max(14, parseInt(localStorage.getItem('fh_readfont') || '18', 10) - 2);
      localStorage.setItem('fh_readfont', f); applyFont();
    };
    document.getElementById('fontInc').onclick = () => {
      const f = Math.min(28, parseInt(localStorage.getItem('fh_readfont') || '18', 10) + 2);
      localStorage.setItem('fh_readfont', f); applyFont();
    };
  }

  try {
    await loadWork();
    if ((work.rating === 'M' || work.rating === 'E') && localStorage.getItem('fh_age_ok') !== '1') {
      const ok = await ensureAgeConfirmed();
      if (!ok) {
        root.innerHTML = '<div class="age-gate-note"><span class="gate-mark">成熟向内容</span>本作需确认年满 18 岁后方可阅读。<div style="margin-top:var(--s-4)"><a class="btn btn-primary btn-sm" href="/work.html?id=' + workId + '">返回作品页</a></div></div>';
        toolbar.innerHTML = '';
        navEl.innerHTML = '';
        return;
      }
    }
    await renderChapter();
  } catch (e) {
    root.innerHTML = '<p class="empty">' + escapeHtml(e.message || '加载失败') + '</p>';
  }
})();
