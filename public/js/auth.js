(async function () {
  await initPage('');
  const next = new URLSearchParams(location.search).get('next') || '/index.html';

  if (CURRENT_USER) { location.href = next; return; }

  const tabLogin = document.getElementById('tabLogin');
  const tabReg = document.getElementById('tabReg');
  const loginForm = document.getElementById('loginForm');
  const regForm = document.getElementById('regForm');

  function switchTab(t) {
    const isLogin = t === 'login';
    tabLogin.classList.toggle('active', isLogin);
    tabReg.classList.toggle('active', !isLogin);
    loginForm.style.display = isLogin ? '' : 'none';
    regForm.style.display = isLogin ? 'none' : '';
  }
  tabLogin.onclick = () => switchTab('login');
  tabReg.onclick = () => switchTab('reg');

  function go(token) {
    localStorage.setItem('fh_token', token);
    location.href = next;
  }

  loginForm.onsubmit = async (e) => {
    e.preventDefault();
    try {
      const r = await API.post('/login', { username: lUser.value.trim(), password: lPass.value });
      toast('登录成功', 'success');
      go(r.token);
    } catch (err) { toast(err.message || '登录失败', 'error'); }
  };

  regForm.onsubmit = async (e) => {
    e.preventDefault();
    try {
      const r = await API.post('/register', {
        username: rUser.value.trim(),
        password: rPass.value,
        email: rEmail.value.trim(),
        bio: rBio.value.trim()
      });
      toast('注册成功，欢迎成为作者！', 'success');
      go(r.token);
    } catch (err) { toast(err.message || '注册失败', 'error'); }
  };
})();
