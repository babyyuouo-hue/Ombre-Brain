(function () {
  'use strict';

  const STAR_POSITIONS = [
    [18, 24], [38, 17], [76, 25], [85, 54], [68, 66], [31, 62], [14, 48], [50, 73], [91, 36]
  ];
  const RELATED_ANGLES = [-155, -116, -76, -34, 8, 49, 91, 132];
  const state = {
    buckets: [], letters: [], plans: {active: [], resolved: [], abandoned: []},
    config: {}, status: {}, github: {}, human: '小宇', selectedId: '',
    memoryFilter: 'all', memoryQuery: '', memoryPage: 1, memoryPageSize: 12,
    currentView: 'now', loading: false
  };

  const $ = (id) => document.getElementById(id);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));
  const esc = (value) => String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const pad = (value) => String(value).padStart(2, '0');

  function text(id, value) {
    const el = $(id);
    if (el) el.textContent = value == null ? '' : String(value);
  }

  function showToast(message) {
    const toast = $('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  async function safeJson(response) {
    const raw = await response.text();
    if (!raw.trim()) throw new Error('服务没有返回内容');
    try { return JSON.parse(raw); }
    catch (_) { throw new Error('服务返回了无法识别的内容'); }
  }

  async function authJson(url, options) {
    const settings = Object.assign({credentials: 'same-origin'}, options || {});
    let response = await fetch(url, settings);
    if ([502, 503, 504].includes(response.status)) {
      await new Promise((resolve) => setTimeout(resolve, 900));
      response = await fetch(url, settings);
    }
    if (response.status === 401) {
      showAuth(false);
      throw new Error('登录已经过期');
    }
    const data = await safeJson(response);
    if (!response.ok) throw new Error(data.error || ('HTTP ' + response.status));
    return data;
  }

  function setAuthMessage(message, kind) {
    const el = $('auth-message');
    el.textContent = message || '';
    el.className = 'form-message' + (kind ? ' ' + kind : '');
  }

  function showAuth(setupNeeded) {
    $('auth-gate').hidden = false;
    $('universe-shell').hidden = true;
    $('login-form').hidden = !!setupNeeded;
    $('setup-form').hidden = !setupNeeded;
    text('auth-title', setupNeeded ? '先为宇宙留一把钥匙' : '回到小宇宇宙');
    text('auth-copy', setupNeeded ? '设置完成后，这里只向拿着钥匙的人打开。' : '这里安静地保管着被认真记住的事。');
    setAuthMessage('');
    setTimeout(() => (setupNeeded ? $('setup-password') : $('login-password')).focus(), 60);
  }

  function revealApp() {
    $('auth-gate').hidden = true;
    $('universe-shell').hidden = false;
  }

  async function checkAuth() {
    try {
      const response = await fetch('/auth/status', {cache: 'no-store', credentials: 'same-origin'});
      const data = await safeJson(response);
      if (data.authenticated) {
        revealApp();
        await loadUniverse();
      } else {
        showAuth(!!data.setup_needed);
      }
    } catch (error) {
      showAuth(false);
      setAuthMessage('暂时连不上 OB：' + error.message, 'error');
    }
  }

  async function submitLogin(event) {
    event.preventDefault();
    const password = $('login-password').value;
    setAuthMessage('正在打开……');
    try {
      const response = await fetch('/auth/login', {
        method: 'POST', credentials: 'same-origin', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({password})
      });
      const data = await safeJson(response);
      if (!response.ok) throw new Error(data.error || '密码不对');
      $('login-password').value = '';
      revealApp();
      await loadUniverse();
    } catch (error) { setAuthMessage(error.message, 'error'); }
  }

  async function submitSetup(event) {
    event.preventDefault();
    const password = $('setup-password').value;
    const again = $('setup-password-again').value;
    if (password !== again) return setAuthMessage('两次输入的密码不一样。', 'error');
    if (password.length < 6) return setAuthMessage('密码至少需要 6 位。', 'error');
    setAuthMessage('正在建好入口……');
    try {
      const response = await fetch('/auth/setup', {
        method: 'POST', credentials: 'same-origin', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({password})
      });
      const data = await safeJson(response);
      if (!response.ok) throw new Error(data.error || '设置失败');
      revealApp();
      await loadUniverse();
    } catch (error) { setAuthMessage(error.message, 'error'); }
  }

  async function loadUniverse() {
    if (state.loading) return;
    state.loading = true;
    updateClock();
    renderTinyStars();
    const requests = await Promise.allSettled([
      authJson('/api/buckets?sort=created_desc'), authJson('/api/letters'),
      authJson('/api/plans'), authJson('/api/config'), authJson('/api/status'),
      authJson('/api/github/status'), authJson('/api/settings/human')
    ]);
    const value = (index, fallback) => requests[index].status === 'fulfilled' ? requests[index].value : fallback;
    state.buckets = Array.isArray(value(0, [])) ? value(0, []) : [];
    const letters = value(1, {letters: []});
    state.letters = Array.isArray(letters.letters) ? letters.letters : [];
    state.plans = value(2, state.plans) || state.plans;
    state.config = value(3, {}) || {};
    state.status = value(4, {}) || {};
    state.github = value(5, {}) || {};
    const human = value(6, {});
    state.human = human.human && human.human !== '人类' ? human.human : '小宇';
    const first = starBuckets()[0] || memoryBuckets()[0];
    if (!state.selectedId && first) state.selectedId = first.id;
    renderAll();
    state.loading = false;
    const failed = requests.filter((item) => item.status === 'rejected').length;
    if (failed) showToast('有 ' + failed + ' 项暂时没有连上，其他内容已先打开');
  }

  function beijingParts() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
      weekday: 'long', hour: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date());
    return Object.fromEntries(parts.map((part) => [part.type, part.value]));
  }

  function updateClock() {
    const now = beijingParts();
    const months = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
    text('today-kicker', now.weekday.toUpperCase() + ' · ' + months[Number(now.month) - 1] + ' ' + now.day);
    text('day-number', now.day);
    const hour = Number(now.hour);
    const phrase = hour < 6 ? '夜深了' : hour < 11 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好';
    text('greeting', phrase + '，' + state.human + '。');
    const dateInput = $('letter-date');
    if (dateInput && !dateInput.value) dateInput.value = now.year + '-' + now.month + '-' + now.day;
  }

  function renderAll() {
    updateClock();
    const total = state.buckets.filter((bucket) => !bucket.dont_surface).length;
    text('rail-status-title', '记忆安好');
    text('rail-status-copy', total + ' traces · now');
    $('rail-status-dot').classList.add('ok');
    renderNow(); renderMemories(); renderLetters(); renderSettings();
    const requested = hashView();
    navigate(requested, false);
  }

  function hashView() {
    const hash = location.hash.replace(/^#/, '').toLowerCase();
    return ['now', 'memories', 'letters', 'settings'].includes(hash) ? hash : 'now';
  }

  function navigate(view, updateHash) {
    if (!['now', 'memories', 'letters', 'settings'].includes(view)) view = 'now';
    state.currentView = view;
    $$('.nav-item').forEach((button) => {
      const active = button.dataset.view === view;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    });
    $$('[data-view-panel]').forEach((panel) => {
      const active = panel.dataset.viewPanel === view;
      panel.classList.toggle('active', active); panel.hidden = !active;
    });
    if (updateHash !== false && location.hash !== '#' + view) history.replaceState(null, '', '#' + view);
    window.scrollTo({top: 0, behavior: 'smooth'});
  }

  function domainText(bucket) { return (bucket.domain || []).concat(bucket.tags || []).join(' ').toLowerCase(); }
  function isDiary(bucket) {
    const name = String(bucket.name || '');
    return /日记|diary|journal/i.test(name + ' ' + domainText(bucket)) || /【?20\d{2}年\d{1,2}月\d{1,2}日】?/.test(name);
  }
  function isPlan(bucket) { return bucket.type === 'plan' || /(^|\s)(plan|计划|约定)(\s|$)/i.test(domainText(bucket)); }
  function isLetter(bucket) { return bucket.type === 'letter' || (bucket.domain || []).includes('letter') || (bucket.tags || []).includes('__letter__'); }
  function isArchived(bucket) { return bucket.type === 'archived' || Number(bucket.score || 0) < .3 || bucket.dont_surface; }
  function memoryBuckets() { return state.buckets.filter((bucket) => !isLetter(bucket)); }
  function starBuckets() { return memoryBuckets().filter((bucket) => !isArchived(bucket)).slice(0, 36); }

  function displayDate(value) {
    if (!value) return 'DATE UNKNOWN';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 16).toUpperCase();
    return new Intl.DateTimeFormat('zh-CN', {timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'}).format(date).replace(/\//g, ' · ');
  }

  function renderTinyStars() {
    const root = $('tiny-stars');
    if (!root || root.children.length) return;
    for (let i = 0; i < 58; i += 1) {
      const star = document.createElement('i');
      star.className = 'tiny-star';
      star.style.left = ((i * 37 + 11) % 97) + '%';
      star.style.top = ((i * 53 + 7) % 91) + '%';
      star.style.opacity = String(.12 + ((i * 17) % 48) / 100);
      const size = i % 9 === 0 ? 2 : 1;
      star.style.width = size + 'px'; star.style.height = size + 'px';
      root.appendChild(star);
    }
  }

  function relationScore(center, candidate) {
    const centerTags = new Set((center.tags || []).concat(center.domain || []).map((x) => String(x).toLowerCase()));
    const candidateTags = (candidate.tags || []).concat(candidate.domain || []).map((x) => String(x).toLowerCase());
    let score = candidateTags.reduce((sum, tag) => sum + (centerTags.has(tag) ? 4 : 0), 0);
    if (center.type === candidate.type) score += 1.1;
    if (isDiary(center) === isDiary(candidate)) score += .7;
    score += Math.max(0, 1 - Math.abs(Number(center.valence || .5) - Number(candidate.valence || .5)));
    return score;
  }

  function relatedBuckets(center, excluded) {
    if (!center) return [];
    return starBuckets().filter((bucket) => bucket.id !== center.id && !excluded.has(bucket.id))
      .map((bucket, index) => ({bucket, score: relationScore(center, bucket), index}))
      .sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 8).map((item) => item.bucket);
  }

  function renderNow() {
    const memories = memoryBuckets();
    const diaryCount = memories.filter(isDiary).length;
    const pinnedCount = memories.filter((bucket) => bucket.pinned).length;
    const plans = (state.plans.active || []).length || memories.filter((bucket) => isPlan(bucket) && !bucket.resolved).length;
    text('stat-surfaced', pad(Math.min(9, starBuckets().length)));
    text('stat-diaries', pad(diaryCount)); text('stat-letters', pad(state.letters.length)); text('stat-plans', pad(plans));
    const quoteSource = memories.find((bucket) => /小鱼小鱼快快游/.test(bucket.content_preview || ''));
    if (quoteSource) $('today-quote').innerHTML = esc(quoteSource.content_preview || '').replace(/，/g, '，<br>').slice(0, 90);
    renderStarMap();
  }

  function renderStarMap() {
    const root = $('memory-stars');
    const lineRoot = $('star-lines');
    root.innerHTML = ''; lineRoot.innerHTML = '';
    const candidates = starBuckets();
    if (!candidates.length) {
      updateFocus(null); return;
    }
    let center = candidates.find((bucket) => bucket.id === state.selectedId) || candidates[0];
    state.selectedId = center.id;
    const primary = candidates.slice(0, 9);
    if (!primary.some((bucket) => bucket.id === center.id)) primary[primary.length - 1] = center;
    const positions = new Map();
    let positionIndex = 0;
    primary.forEach((bucket) => {
      if (bucket.id === center.id) positions.set(bucket.id, [54, 41]);
      else positions.set(bucket.id, STAR_POSITIONS[positionIndex++]);
    });
    const excluded = new Set(primary.map((bucket) => bucket.id));
    const related = relatedBuckets(center, excluded);
    const centerPos = positions.get(center.id);
    related.forEach((bucket, index) => {
      const angle = RELATED_ANGLES[index] * Math.PI / 180;
      const radiusX = index % 2 ? 19 : 15;
      const radiusY = index % 2 ? 16 : 12;
      positions.set(bucket.id, [centerPos[0] + Math.cos(angle) * radiusX, centerPos[1] + Math.sin(angle) * radiusY]);
    });
    const mainPath = primary.map((bucket) => positions.get(bucket.id)).filter(Boolean);
    if (mainPath.length > 2) addPath(mainPath.concat([mainPath[0]]));
    related.forEach((bucket) => addPath([centerPos, positions.get(bucket.id)], true));
    primary.forEach((bucket) => root.appendChild(makeStar(bucket, positions.get(bucket.id), false)));
    related.forEach((bucket) => root.appendChild(makeStar(bucket, positions.get(bucket.id), true)));
    updateFocus(center);
  }

  function addPath(points, relation) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', points.map((point, index) => (index ? 'L' : 'M') + point[0] + ' ' + point[1]).join(' '));
    if (relation) path.style.stroke = 'rgba(255,159,189,.13)';
    $('star-lines').appendChild(path);
  }

  function makeStar(bucket, position, related) {
    const button = document.createElement('button');
    const type = isDiary(bucket) ? 'diary' : isPlan(bucket) ? 'plan' : '';
    button.type = 'button';
    button.className = 'memory-star ' + type + (related ? ' related' : '') + (bucket.id === state.selectedId ? ' selected' : '');
    button.style.left = position[0] + '%'; button.style.top = position[1] + '%';
    button.setAttribute('aria-label', '展开相关记忆：' + (bucket.name || '未命名记忆'));
    button.innerHTML = '<span class="star-core"></span><span class="star-label">' + esc(bucket.name || '未命名记忆') + '</span>';
    button.addEventListener('click', () => { state.selectedId = bucket.id; renderStarMap(); });
    return button;
  }

  function updateFocus(bucket) {
    if (!bucket) {
      text('focus-date', '—'); text('focus-title', '等待第一颗星亮起');
      text('focus-preview', '记忆连上以后，会在这里轻轻发光。');
      $('read-focus').disabled = true; return;
    }
    text('focus-date', displayDate(bucket.created)); text('focus-title', bucket.name || '未命名记忆');
    text('focus-preview', bucket.content_preview || bucket.why_remembered || '点一下这颗星，会展开与它有关的记忆。');
    $('focus-mark').className = 'focus-mark' + (isDiary(bucket) ? ' diary' : '');
    $('read-focus').disabled = false;
  }

  function memoryKind(bucket) { return isDiary(bucket) ? 'diary' : isPlan(bucket) ? 'plan' : bucket.type === 'feel' ? 'feel' : 'memory'; }
  function filteredMemories() {
    const query = state.memoryQuery.trim().toLowerCase();
    return memoryBuckets().filter((bucket) => {
      let match = true;
      if (state.memoryFilter === 'diary') match = isDiary(bucket);
      else if (state.memoryFilter === 'plan') match = isPlan(bucket);
      else if (state.memoryFilter === 'pinned') match = !!bucket.pinned;
      else if (state.memoryFilter === 'feel') match = bucket.type === 'feel';
      else if (state.memoryFilter === 'archived') match = isArchived(bucket);
      else match = !isArchived(bucket);
      if (!match || !query) return match;
      const haystack = [bucket.name, bucket.content_preview, ...(bucket.domain || []), ...(bucket.tags || [])].join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }

  function renderMemories() {
    const all = memoryBuckets();
    text('memory-total', pad(all.length));
    const filtered = filteredMemories();
    const limit = state.memoryPage * state.memoryPageSize;
    const shown = filtered.slice(0, limit);
    const grid = $('memory-grid');
    if (!shown.length) grid.innerHTML = '<p class="empty-state">这一片暂时没有星星。换一个筛选看看吧。</p>';
    else grid.innerHTML = shown.map((bucket) => {
      const kind = memoryKind(bucket);
      const labels = (bucket.domain || []).slice(0, 2).map((tag) => '<span class="tag">' + esc(tag) + '</span>').join('');
      return '<button class="memory-card ' + kind + '" type="button" data-bucket-id="' + esc(bucket.id) + '">' +
        '<span class="card-top"><i class="type-dot"></i><span>' + esc(displayDate(bucket.created)) + '</span></span>' +
        '<h3>' + esc(bucket.name || '未命名记忆') + '</h3><p>' + esc(bucket.content_preview || '这颗星把正文藏在里面。') + '</p>' +
        '<footer>' + labels + (bucket.pinned ? '<span class="tag">钉选</span>' : '') + '</footer></button>';
    }).join('');
    $$('.memory-card', grid).forEach((card) => card.addEventListener('click', () => openMemory(card.dataset.bucketId)));
    $('memory-more').hidden = shown.length >= filtered.length;
  }

  async function openMemory(id) {
    const summary = state.buckets.find((bucket) => bucket.id === id);
    openDialog({kicker: isDiary(summary || {}) ? 'DIARY' : isPlan(summary || {}) ? 'PROMISE' : 'MEMORY', title: summary ? summary.name : '一颗记忆', meta: summary ? displayDate(summary.created) : '', body: '正在把正文取回来……'});
    try {
      const detail = await authJson('/api/bucket/' + encodeURIComponent(id));
      const meta = detail.metadata || {};
      text('dialog-title', meta.name || (summary && summary.name) || '未命名记忆');
      text('dialog-meta', displayDate(meta.created || (summary && summary.created)) + (meta.domain && meta.domain.length ? ' · ' + meta.domain.join(' / ') : ''));
      text('dialog-body', detail.display_content || detail.content || '这条记忆没有正文。');
    } catch (error) { text('dialog-body', '暂时没有取到正文：' + error.message); }
  }

  function openDialog(data) {
    text('dialog-kicker', data.kicker || 'MEMORY'); text('dialog-title', data.title || '—');
    text('dialog-meta', data.meta || ''); text('dialog-body', data.body || '');
    const dialog = $('detail-dialog');
    if (!dialog.open) dialog.showModal();
  }

  function renderLetters() {
    text('letter-total', pad(state.letters.length));
    const list = $('letter-list');
    if (!state.letters.length) {
      list.innerHTML = '<p class="empty-state">信箱还是空的。第一封信也会是一颗很亮的星。</p>'; return;
    }
    list.innerHTML = state.letters.map((letter) => {
      const fromUser = letter.author === 'user';
      const who = letter.writer_name || (fromUser ? (letter.user_name || state.human) : letter.author || state.config.ai_name || '哥哥');
      const title = letter.locked ? '一封还没到打开时间的信' : (letter.title || '没有标题的信');
      const preview = letter.locked ? '这封信尚未向你开放。' : (letter.content || '').replace(/\s+/g, ' ').slice(0, 90);
      return '<button class="letter-card ' + (fromUser ? 'from-user' : 'from-ai') + '" type="button" data-letter-id="' + esc(letter.id) + '">' +
        '<span class="letter-seal">' + (letter.locked ? '⌁' : '✦') + '</span><span class="letter-copy"><span>' + esc(who) + ' · ' + esc(letter.date || '') + '</span><h3>' + esc(title) + '</h3><p>' + esc(preview) + '</p></span><span class="letter-arrow">→</span></button>';
    }).join('');
    $$('.letter-card', list).forEach((card) => card.addEventListener('click', () => openLetter(card.dataset.letterId)));
  }

  function openLetter(id) {
    const letter = state.letters.find((item) => item.id === id);
    if (!letter) return;
    const fromUser = letter.author === 'user';
    const who = letter.writer_name || (fromUser ? (letter.user_name || state.human) : letter.author || state.config.ai_name || '哥哥');
    openDialog({kicker: 'LETTER · ' + who, title: letter.locked ? '一封上锁的信' : (letter.title || '没有标题的信'), meta: letter.date + (letter.lock_type !== 'none' ? ' · ' + letter.lock_type : ''), body: letter.locked ? '这封信尚未向你开放。' : (letter.content || '')});
  }

  async function submitLetter(event) {
    event.preventDefault();
    const message = $('letter-message');
    const content = $('letter-content').value.trim();
    const lockType = $('letter-lock').value;
    if (!content) { message.textContent = '还没有写正文呀。'; message.className = 'form-message error'; return; }
    const body = {author: 'user', user_name: state.human, title: $('letter-title').value.trim(), date: $('letter-date').value, content, lock_type: lockType};
    if (lockType === 'timed') {
      if (!$('letter-unlock').value) { message.textContent = '要先选一个解锁时间。'; message.className = 'form-message error'; return; }
      body.unlock_date = new Date($('letter-unlock').value).toISOString();
    }
    message.textContent = '正在把信放进宇宙……'; message.className = 'form-message';
    try {
      await authJson('/api/letter', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
      $('letter-content').value = ''; $('letter-title').value = ''; $('letter-lock').value = 'none'; $('unlock-row').hidden = true;
      const data = await authJson('/api/letters'); state.letters = data.letters || [];
      renderLetters(); renderNow();
      message.textContent = '信已经好好收下了。'; message.className = 'form-message success';
    } catch (error) { message.textContent = error.message; message.className = 'form-message error'; }
  }

  function renderSettings() {
    const publicUrl = (state.config.deployment && (state.config.deployment.public_url_effective || state.config.deployment.public_url)) || location.origin;
    const mcpUrl = String(publicUrl).replace(/\/$/, '') + '/mcp';
    text('mcp-url', mcpUrl); text('mcp-auth-mode', state.config.mcp_auth_mode_effective || state.config.mcp_auth_mode || 'OAuth');
    text('mcp-summary', state.config.mcp_require_auth === false ? '当前允许直接连接；地址可复制到支持 MCP 的客户端。' : '连接受到鉴权保护，复制地址后按客户端提示完成授权。');
    const github = state.github;
    text('github-summary', github.configured ? ('已连接 ' + (github.repo || 'GitHub 仓库') + (github.last_sync ? '，上次同步 ' + displayDate(github.last_sync) : '。')) : '还没有启用云端备份；本地记忆不受影响。');
    text('system-version', state.status.version || '—');
    text('system-buckets', (state.status.buckets && state.status.buckets.total) != null ? state.status.buckets.total : state.buckets.length);
    text('system-embedding', state.status.embedding_enabled ? '已开启' : '未开启');
    text('system-engine', state.status.decay_engine === 'running' ? '正在运行' : (state.status.decay_engine || '—'));
    $('github-sync').disabled = !github.configured;
  }

  async function syncGithub() {
    const message = $('github-message');
    if (!state.github.configured) { message.textContent = '先到完整设置里连接 GitHub。'; return; }
    $('github-sync').disabled = true; message.textContent = '正在同步……';
    try {
      const data = await authJson('/api/github/sync', {method: 'POST'});
      message.textContent = '同步完成，上传了 ' + (data.uploaded || 0) + ' 个文件。';
      state.github = await authJson('/api/github/status'); renderSettings();
    } catch (error) { message.textContent = '同步失败：' + error.message; }
    $('github-sync').disabled = false;
  }

  async function copyMcp() {
    const value = $('mcp-url').textContent;
    try { await navigator.clipboard.writeText(value); showToast('MCP 地址复制好了'); }
    catch (_) {
      const input = document.createElement('textarea'); input.value = value; document.body.appendChild(input); input.select();
      document.execCommand('copy'); input.remove(); showToast('MCP 地址复制好了');
    }
  }

  async function logout() {
    try { await fetch('/auth/logout', {method: 'POST', credentials: 'same-origin'}); }
    finally { showAuth(false); }
  }

  function bindEvents() {
    $('login-form').addEventListener('submit', submitLogin);
    $('setup-form').addEventListener('submit', submitSetup);
    $$('.nav-item').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.view)));
    $$('[data-go]').forEach((button) => button.addEventListener('click', () => {
      if (button.dataset.memoryFilter) {
        state.memoryFilter = button.dataset.memoryFilter; state.memoryPage = 1;
        $$('#memory-filters button').forEach((item) => item.classList.toggle('active', item.dataset.filter === state.memoryFilter));
        renderMemories();
      }
      navigate(button.dataset.go);
    }));
    $('next-star').addEventListener('click', () => {
      const stars = starBuckets(); if (!stars.length) return;
      const index = Math.max(0, stars.findIndex((bucket) => bucket.id === state.selectedId));
      state.selectedId = stars[(index + 1) % stars.length].id; renderStarMap();
    });
    $('read-focus').addEventListener('click', () => { if (state.selectedId) openMemory(state.selectedId); });
    $('jellyfish').addEventListener('click', () => {
      const awake = $('jellyfish').classList.toggle('awake');
      text('jelly-copy', awake ? '被小宇发现啦' : '在星海里打瞌睡');
      if (awake) showToast('小水母晃了晃触手 ૮ .  ̫ . ა');
    });
    $$('#memory-filters button').forEach((button) => button.addEventListener('click', () => {
      state.memoryFilter = button.dataset.filter; state.memoryPage = 1;
      $$('#memory-filters button').forEach((item) => item.classList.toggle('active', item === button)); renderMemories();
    }));
    $('memory-search').addEventListener('input', (event) => { state.memoryQuery = event.target.value; state.memoryPage = 1; renderMemories(); });
    $('memory-more').addEventListener('click', () => { state.memoryPage += 1; renderMemories(); });
    $('refresh-letters').addEventListener('click', async () => { const data = await authJson('/api/letters'); state.letters = data.letters || []; renderLetters(); showToast('信箱已经刷新'); });
    $('letter-lock').addEventListener('change', () => { $('unlock-row').hidden = $('letter-lock').value !== 'timed'; });
    $('letter-form').addEventListener('submit', submitLetter);
    $('copy-mcp').addEventListener('click', copyMcp); $('github-sync').addEventListener('click', syncGithub); $('logout-button').addEventListener('click', logout);
    $('dialog-close').addEventListener('click', () => $('detail-dialog').close());
    $('detail-dialog').addEventListener('click', (event) => { if (event.target === $('detail-dialog')) $('detail-dialog').close(); });
    window.addEventListener('hashchange', () => navigate(hashView(), false));
  }

  document.addEventListener('DOMContentLoaded', () => { bindEvents(); checkAuth(); });
})();
