(function () {
  'use strict';

  var universeBuckets = [];
  var selectedBucketId = '';
  var activeHumanName = '小宇';
  var starPositions = [
    [18, 22], [43, 16], [72, 27], [84, 52], [61, 61],
    [29, 57], [12, 72], [47, 76], [77, 78], [91, 30],
    [35, 35], [64, 43]
  ];

  function safe(value) {
    if (typeof window.esc === 'function') return window.esc(String(value == null ? '' : value));
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char];
    });
  }

  function safeAttr(value) {
    if (typeof window.escAttr === 'function') return window.escAttr(String(value == null ? '' : value));
    return safe(value);
  }

  function kindOf(bucket) {
    if (!bucket) return 'memory';
    if (bucket.type === 'letter' || (bucket.domain || []).indexOf('letter') !== -1) return 'letter';
    if (bucket.type === 'plan') return 'promise';
    return 'memory';
  }

  function displayDate(bucket) {
    var raw = bucket && (bucket.created || bucket.last_active) || '';
    if (!raw) return kindOf(bucket) === 'promise' ? 'PLAN · ACTIVE' : 'MEMORY';
    return String(raw).slice(0, 10).replace(/-/g, ' · ');
  }

  function currentHourGreeting(name) {
    var hour = new Date().getHours();
    var greeting = hour < 5 ? '夜深了' : hour < 11 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好';
    return greeting + '，' + (name || '小宇') + '。';
  }

  function englishDate() {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long', month: 'long', day: 'numeric'
    }).format(new Date()).toUpperCase();
  }

  var chromeTitles = {
    list: '记忆。', network: '星空。', breath: '呼吸。', letters: '信件。',
    plan: '约定。', anchors: '锚点。', settings: '设置。', import: '导入。',
    logs: '日志。', faq: '帮助。', about: '关于。'
  };

  window.updateUniverseChrome = function (target) {
    setText('universe-date-kicker', englishDate());
    if (target === 'home') {
      setText('universe-greeting', currentHourGreeting(activeHumanName));
    } else if (chromeTitles[target]) {
      setText('universe-greeting', chromeTitles[target]);
    }
    var menu = document.getElementById('universe-account-menu');
    if (menu) menu.classList.remove('open');
  };

  window.toggleUniverseTools = function () {
    var rail = document.querySelector('.tabs');
    var button = document.getElementById('universe-tools-toggle');
    if (!rail) return;
    rail.classList.toggle('tools-open');
    if (button) {
      button.setAttribute('aria-expanded', rail.classList.contains('tools-open') ? 'true' : 'false');
      var glyph = button.querySelector('b');
      if (glyph) glyph.textContent = rail.classList.contains('tools-open') ? '−' : '＋';
    }
  };

  window.toggleUniverseAccount = function (event) {
    if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
    var menu = document.getElementById('universe-account-menu');
    if (menu) menu.classList.toggle('open');
  };

  window.universeNextMemory = function () {
    var home = document.querySelector('.tab[data-tab="home"]');
    if (home && !home.classList.contains('active')) home.click();
    if (!universeBuckets.length) return;
    var index = universeBuckets.findIndex(function (bucket) { return bucket.id === selectedBucketId; });
    var next = universeBuckets[(index + 1 + universeBuckets.length) % universeBuckets.length];
    window.selectUniverseMemory(next.id);
  };

  function setText(id, text) {
    var node = document.getElementById(id);
    if (node) node.textContent = text;
  }

  function renderDust() {
    var layer = document.getElementById('universe-dust-layer');
    if (!layer || layer.childNodes.length) return;
    for (var i = 0; i < 56; i += 1) {
      var star = document.createElement('i');
      star.className = 'universe-dust';
      star.style.left = ((i * 37 + 11) % 97) + '%';
      star.style.top = ((i * 53 + 7) % 91) + '%';
      star.style.opacity = String(.16 + ((i * 17) % 45) / 100);
      if (i % 7 === 0) { star.style.width = '2px'; star.style.height = '2px'; }
      layer.appendChild(star);
    }
  }

  function chooseHomeBuckets(buckets) {
    return (buckets || [])
      .filter(function (bucket) { return !bucket.dont_surface && bucket.type !== 'archive'; })
      .sort(function (a, b) {
        if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
        var aTime = a.created_epoch_ms || a.last_active_epoch_ms || 0;
        var bTime = b.created_epoch_ms || b.last_active_epoch_ms || 0;
        if (aTime !== bTime) return bTime - aTime;
        return (b.importance || 0) - (a.importance || 0);
      })
      .slice(0, starPositions.length);
  }

  function renderStars() {
    var layer = document.getElementById('universe-stars');
    if (!layer) return;
    if (!universeBuckets.length) {
      layer.innerHTML = '<div style="position:absolute;inset:0;display:grid;place-items:center;color:#74747c;font-size:11px;letter-spacing:.12em;">等待第一颗记忆亮起来</div>';
      renderFocus(null);
      return;
    }
    layer.innerHTML = universeBuckets.map(function (bucket, index) {
      var pos = starPositions[index % starPositions.length];
      var cls = kindOf(bucket);
      var selected = bucket.id === selectedBucketId ? ' selected' : '';
      return '<button class="universe-memory-star ' + cls + selected + '"'
        + ' style="left:' + pos[0] + '%;top:' + pos[1] + '%"'
        + ' data-id="' + safeAttr(bucket.id) + '"'
        + ' onclick="selectUniverseMemory(this.dataset.id)" aria-label="打开记忆：' + safeAttr(bucket.name || '未命名记忆') + '">'
        + '<span class="universe-star-core"></span>'
        + '<span class="universe-star-label">' + safe(bucket.name || '未命名记忆') + '</span>'
        + '</button>';
    }).join('');
    renderFocus(universeBuckets.find(function (bucket) { return bucket.id === selectedBucketId; }) || universeBuckets[0]);
  }

  function renderFocus(bucket) {
    var title = document.getElementById('universe-focus-title');
    var date = document.getElementById('universe-focus-date');
    var copy = document.getElementById('universe-focus-copy');
    var button = document.getElementById('universe-focus-open');
    if (!bucket) {
      if (title) title.textContent = '星海还很安静';
      if (date) date.textContent = 'MEMORY CONSTELLATION';
      if (copy) copy.textContent = '写下第一条记忆后，它会在这里发光。';
      if (button) button.disabled = true;
      return;
    }
    selectedBucketId = bucket.id;
    if (title) title.textContent = bucket.name || '未命名记忆';
    if (date) date.textContent = displayDate(bucket);
    if (copy) copy.textContent = bucket.content_preview || bucket.why_remembered || '这颗记忆正在安静地发光。';
    if (button) button.disabled = false;
  }

  window.selectUniverseMemory = function (id) {
    selectedBucketId = id;
    document.querySelectorAll('.universe-memory-star').forEach(function (node) {
      node.classList.toggle('selected', node.dataset.id === id);
    });
    renderFocus(universeBuckets.find(function (bucket) { return bucket.id === id; }));
  };

  window.openUniverseMemory = function () {
    if (selectedBucketId && typeof window.showDetail === 'function') window.showDetail(selectedBucketId);
  };

  window.universeGo = function (target) {
    var tab = document.querySelector('.tab[data-tab="' + target + '"]');
    if (tab) tab.click();
  };

  window.toggleUniverseJelly = function () {
    var jelly = document.getElementById('universe-jelly');
    if (!jelly) return;
    jelly.classList.toggle('awake');
    var label = jelly.querySelector('em');
    if (label) label.textContent = jelly.classList.contains('awake') ? '被小宇发现啦' : '在星海里打瞌睡';
  };

  window.loadUniverseHome = async function () {
    renderDust();
    var day = new Date();
    setText('universe-day-number', String(day.getDate()).padStart(2, '0'));
    setText('universe-date-line', new Intl.DateTimeFormat('en-US', {weekday:'long', month:'long', day:'numeric'}).format(day).toUpperCase());

    try {
      var responses = await Promise.all([
        authFetch('/api/buckets?sort=created_desc'),
        authFetch('/api/plans'),
        authFetch('/api/letters'),
        authFetch('/api/settings/human')
      ]);
      var bucketData = responses[0] && responses[0].ok ? await responses[0].json() : [];
      var planData = responses[1] && responses[1].ok ? await responses[1].json() : {active:[]};
      var letterData = responses[2] && responses[2].ok ? await responses[2].json() : {letters:[]};
      var humanData = responses[3] && responses[3].ok ? await responses[3].json() : {human:'小宇'};

      var buckets = Array.isArray(bucketData) ? bucketData : [];
      universeBuckets = chooseHomeBuckets(buckets);
      if (!selectedBucketId || !universeBuckets.some(function (bucket) { return bucket.id === selectedBucketId; })) {
        selectedBucketId = universeBuckets.length ? universeBuckets[0].id : '';
      }
      activeHumanName = humanData.human === '人类' ? '小宇' : (humanData.human || '小宇');
      setText('universe-greeting', currentHourGreeting(activeHumanName));
      setText('universe-memory-count', String(buckets.filter(function (b) { return !b.dont_surface; }).length).padStart(2, '0'));
      setText('universe-pin-count', String(buckets.filter(function (b) { return b.pinned; }).length).padStart(2, '0'));
      setText('universe-letter-count', String((letterData.letters || []).length).padStart(2, '0'));
      setText('universe-plan-count', String((planData.active || []).length).padStart(2, '0'));
      setText('universe-rail-count', buckets.length + ' traces · now');
      renderStars();
    } catch (error) {
      var title = document.getElementById('universe-focus-title');
      var copy = document.getElementById('universe-focus-copy');
      if (title) title.textContent = '星图暂时没有连上';
      if (copy) copy.textContent = error && error.message ? error.message : '稍后再试一次。';
    }
  };

  document.addEventListener('DOMContentLoaded', function () {
    renderDust();
    setText('universe-greeting', currentHourGreeting('小宇'));
    var day = new Date();
    setText('universe-date-kicker', englishDate());
    setText('universe-day-number', String(day.getDate()).padStart(2, '0'));
    setText('universe-date-line', new Intl.DateTimeFormat('en-US', {weekday:'long', month:'long', day:'numeric'}).format(day).toUpperCase());
    // checkAuth() starts earlier in the legacy inline script. On a warm cache it
    // can finish before this deferred theme file is evaluated, so refresh the
    // home once more after the complete DOM exists. The call is read-only.
    fetch('/auth/status', {cache:'no-store', credentials:'same-origin'})
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (status) {
        var home = document.querySelector('.tab[data-tab="home"]');
        if (status && status.authenticated && home && home.classList.contains('active')) {
          return window.loadUniverseHome();
        }
        return null;
      })
      .catch(function () { /* Existing auth overlay owns connection errors. */ });

    document.addEventListener('click', function (event) {
      var menu = document.getElementById('universe-account-menu');
      var avatar = document.querySelector('.universe-avatar');
      if (menu && !menu.contains(event.target) && event.target !== avatar) menu.classList.remove('open');
    });
  });
})();
