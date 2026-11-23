/* OrchardTube Studio — кабинет автора (по образцу YouTube Studio) */
(function () {
  const { $, $$, esc, api, toast, num, date, initials } = Panel;
  let me = null;           // ответ /api/me
  let videosCache = null;  // список видео студии
  let categories = [];

  const VIS = { public: 'Открытый доступ', unlisted: 'Доступ по ссылке', private: 'Ограниченный доступ' };
  const ic = (n, cls) => `<svg class="ic ${cls || ''}"><use href="#i-${n}"/></svg>`;

  /* ---------- каркас ---------- */
  function shell() {
    const ch = me.channel;
    $('#app').innerHTML = `
      <header class="p-top">
        <button class="p-icon" id="menuBtn" aria-label="Меню">${ic('menu')}</button>
        <a class="p-logo" href="/studio"><span class="p-logo-mark">${ic('play')}</span><span>Orchard<span style="color:var(--orange)">Tube</span> <small>Студия</small></span></a>
        <form class="p-search" id="qForm">${ic('search', 'ic-s')}<input id="q" placeholder="Поиск по каналу" autocomplete="off"></form>
        <div class="p-right">
          <button class="btn" id="createBtn">${ic('plus', 'ic-s')}Создать</button>
          <button class="p-icon" id="themeBtn" aria-label="Сменить тему">${ic('moon')}</button>
          <button class="p-avatar" id="avaBtn" aria-label="Аккаунт">${me.user.picture ? `<img src="${esc(me.user.picture)}" alt="" referrerpolicy="no-referrer">` : esc(ch.avatar)}</button>
        </div>
      </header>
      <aside class="p-side" id="side">
        <div class="chan-box"><div class="chan-ava" style="background:${esc(ch.color)}">${esc(ch.avatar)}</div><div class="cl">Ваш канал</div><div class="cn">${esc(ch.name)}</div></div>
        <a class="nav-item" data-nav="dashboard" href="#/dashboard">${ic('dash')}<span>Панель управления</span></a>
        <a class="nav-item" data-nav="content" href="#/content">${ic('content')}<span>Контент</span></a>
        <a class="nav-item" data-nav="analytics" href="#/analytics">${ic('chart')}<span>Аналитика</span></a>
        <a class="nav-item" data-nav="comments" href="#/comments">${ic('comment')}<span>Комментарии</span></a>
        <div class="nav-sep"></div>
        <a class="nav-item" data-nav="settings" href="#/settings">${ic('gear')}<span>Настройки</span></a>
        <a class="nav-item dim" href="/#/channel/${esc(ch.id)}">${ic('back')}<span>Перейти на канал</span></a>
        <a class="nav-item dim" href="/">${ic('play')}<span>На главную</span></a>
        ${['moderator', 'admin', 'owner'].includes(me.role) ? `<a class="nav-item dim" href="/admin">${ic('shield')}<span>Админ-панель</span></a>` : ''}
      </aside>
      <main class="p-main"><div class="p-page" id="page"></div></main>`;
    $('#themeBtn').addEventListener('click', Panel.toggleTheme);
    $('#createBtn').addEventListener('click', openUpload);
    $('#qForm').addEventListener('submit', (e) => { e.preventDefault(); sessionStorage.setItem('st.q', $('#q').value.trim()); location.hash = '#/content'; route(); });
    $('#menuBtn').addEventListener('click', () => { $('#side').classList.toggle('mini'); });
    $('#avaBtn').addEventListener('click', (e) => {
      const pop = Panel.popover(e.currentTarget, `
        <div class="pop-head"><span class="p-avatar">${esc(ch.avatar)}</span><div><b>${esc(ch.name)}</b><div style="color:var(--fg-dim);font-size:12px">${esc(me.user.email)}</div></div></div><hr>
        <a class="it" href="/">${ic('play', 'ic-s')}Вернуться на OrchardTube</a>
        <button class="it" data-a="theme">${ic('moon', 'ic-s')}Сменить тему</button>
        <button class="it" data-a="out">${ic('close', 'ic-s')}Выйти</button>`);
      pop.addEventListener('click', async (ev) => {
        const a = ev.target.closest('[data-a]'); if (!a) return;
        pop.close();
        if (a.dataset.a === 'theme') Panel.toggleTheme();
        if (a.dataset.a === 'out') { try { await api('/api/auth/logout', { method: 'POST' }); } catch (e) { /* пусто */ } location.href = '/'; }
      });
    });
  }

  function gate(title, text, btn) {
    document.title = 'Студия OrchardTube';
    $('#app').innerHTML = `<div class="gate"><h1>${esc(title)}</h1><p>${esc(text)}</p><a class="btn btn-orange" href="/">${esc(btn || 'На главную')}</a></div>`;
  }

  /* ---------- маршрутизация ---------- */
  function setNav(k) { $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === k)); }

  function route() {
    if (!me || !me.channel) return;
    const h = (location.hash || '#/dashboard').replace(/^#\/?/, '');
    const [name, arg] = h.split('/');
    window.scrollTo(0, 0);
    if (name === 'content') { setNav('content'); return pageContent(); }
    if (name === 'video' && arg) { setNav('content'); return pageVideo(arg); }
    if (name === 'analytics') { setNav('analytics'); return pageAnalytics(); }
    if (name === 'comments') { setNav('comments'); return pageComments(); }
    if (name === 'settings') { setNav('settings'); return pageSettings(); }
    setNav('dashboard'); return pageDashboard();
  }

  const loading = () => { $('#page').innerHTML = '<div class="empty">Загрузка…</div>'; };
  const fail = (e) => { $('#page').innerHTML = `<div class="empty">${esc(e.message)}</div>`; };

  const thumbHtml = (v) => `<div class="thumb">${v.thumb ? `<img src="${esc(v.thumb)}" alt="" loading="lazy">` : `<div style="width:100%;height:100%;background:linear-gradient(135deg,${esc(v.g1)},${esc(v.g2)});display:grid;place-items:center;font-size:28px">${esc(v.emoji || '🎬')}</div>`}${v.duration ? `<span class="dur">${esc(v.duration)}</span>` : ''}</div>`;

  /* ---------- Панель управления ---------- */
  async function pageDashboard() {
    document.title = 'Панель управления — Студия OrchardTube';
    loading();
    let d; try { d = await api('/api/studio/overview'); } catch (e) { return fail(e); }
    const l = d.latest;
    const latest = l
      ? `<div class="latest">${thumbHtml(l)}<div><b>${esc(l.title)}</b><div class="sub">${esc(l.ago)} · ${esc(VIS[l.visibility])}</div></div>
         <div class="mini-metrics"><div><b>${num(l.views)}</b><span>Просмотры</span></div><div><b>${num(l.commentsCount)}</b><span>Комментарии</span></div><div><b>${num(l.likes)}</b><span>Оценки «Нравится»</span></div></div>
         <div><a class="btn btn-sm" href="#/video/${esc(l.id)}">Изменить</a> <a class="btn btn-sm" href="#/analytics">Аналитика</a></div></div>`
      : `<div class="empty"><div class="empty-art">${ic('upload')}</div>Вы ещё не загружали видео.<br><br><button class="btn btn-primary" id="dUp">Загрузить видео</button></div>`;
    const top = d.top.filter((v) => v.views > 0 || v.total > 0).length
      ? `<div class="mini-list">${d.top.map((v) => `<div class="mini-vid" data-id="${esc(v.id)}"><div class="thumb">${v.thumb ? `<img src="${esc(v.thumb)}" alt="">` : ''}</div><div class="t">${esc(v.title)}</div><div class="n">${num(v.views)}</div></div>`).join('')}</div>`
      : '<div class="sub">Пока нет данных о просмотрах.</div>';
    const cms = d.comments.length
      ? `<div class="mini-list">${d.comments.map((c) => `<div><b style="font-size:13px">${esc(c.author)}</b> <span class="date-sub">${esc(c.ago)}</span><div style="font-size:13px">${esc(c.text.slice(0, 140))}</div><div class="date-sub">${esc(c.videoTitle)}</div></div>`).join('')}</div><p><a class="link-btn" href="#/comments">Все комментарии</a></p>`
      : '<div class="sub">Комментариев пока нет.</div>';
    $('#page').innerHTML = `
      <h1 class="p-title">Панель управления канала</h1>
      <div class="cards">
        <div class="card"><h3>Последнее видео</h3>${latest}</div>
        <div class="card"><h3>Аналитика канала</h3>
          <div class="sub">Подписчиков</div><p class="stat-big">${num(d.channel.subsNum)}</p>
          <div class="sub">${d.period.subs >= 0 ? '+' : ''}${d.period.subs} за 28 дней</div>
          <h4>Сводка · 28 дней</h4>
          <div class="stat-row"><span>Просмотры</span><span>${num(d.period.views)}</span></div>
          <div class="stat-row"><span>Видео</span><span>${num(d.totals.videos)}</span></div>
          <div class="stat-row"><span>Оценки «Нравится»</span><span>${num(d.totals.likes)}</span></div>
          <h4>Лучшие видео</h4>${top}
          <p><a class="link-btn" href="#/analytics">Перейти к аналитике</a></p></div>
        <div class="card"><h3>Последние комментарии</h3>${cms}</div>
      </div>`;
    const up = $('#dUp'); if (up) up.addEventListener('click', openUpload);
    $$('.mini-vid').forEach((r) => r.addEventListener('click', () => { location.hash = '#/video/' + r.dataset.id; }));
  }

  /* ---------- Контент ---------- */
  let contentTab = 'all';
  async function pageContent() {
    document.title = 'Контент — Студия OrchardTube';
    loading();
    try { const r = await api('/api/studio/videos'); videosCache = r.videos; categories = r.categories; } catch (e) { return fail(e); }
    const q0 = sessionStorage.getItem('st.q') || ''; sessionStorage.removeItem('st.q');
    $('#page').innerHTML = `
      <h1 class="p-title">Контент канала</h1>
      <div class="tabs" id="cTabs"><button class="tab" data-t="all">Видео</button><button class="tab" data-t="public">Открытые</button><button class="tab" data-t="unlisted">По ссылке</button><button class="tab" data-t="private">Ограниченные</button></div>
      <div class="filter-row">${ic('search', 'ic-s')}<input type="text" id="cQ" placeholder="Фильтр по названию" value="${esc(q0)}"><span style="flex:1"></span><button class="btn btn-sm btn-danger" id="bulkDel" hidden>Удалить выбранные</button></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th class="chk"><input type="checkbox" id="all"></th><th>Видео</th><th>Доступ</th><th>Дата</th><th class="num">Просмотры</th><th class="num">Комментарии</th><th class="num">«Нравится»</th></tr></thead><tbody id="cBody"></tbody></table></div>
      <div class="pager" id="cCount"></div>`;
    const draw = () => {
      const q = $('#cQ').value.trim().toLowerCase();
      const list = videosCache.filter((v) => (contentTab === 'all' || v.visibility === contentTab) && (!q || v.title.toLowerCase().includes(q)));
      $$('#cTabs .tab').forEach((t) => t.classList.toggle('active', t.dataset.t === contentTab));
      $('#cBody').innerHTML = list.length ? list.map((v) => `
        <tr data-id="${esc(v.id)}"><td class="chk"><input type="checkbox" class="sel" value="${esc(v.id)}"></td>
        <td><div class="vcell">${thumbHtml(v)}<div><a class="vt" href="#/video/${esc(v.id)}">${esc(v.title)}</a><div class="vd">${esc(v.desc || 'Добавить описание')}</div>
          <div class="acts"><a class="p-icon" title="Сведения" href="#/video/${esc(v.id)}">${ic('edit')}</a><a class="p-icon" title="Комментарии" href="#/comments">${ic('comment')}</a><a class="p-icon" title="Смотреть на OrchardTube" href="/#/watch/${esc(v.id)}">${ic('eye')}</a><button class="p-icon del" title="Удалить" data-id="${esc(v.id)}">${ic('trash')}</button></div></div></div></td>
        <td><span class="vis ${esc(v.visibility)}"><i></i>${esc(VIS[v.visibility])}</span></td>
        <td>${date(v.at)}<div class="date-sub">Опубликовано</div></td>
        <td class="num">${num(v.views)}</td><td class="num">${num(v.commentsCount)}</td><td class="num">${num(v.likes)}</td></tr>`).join('')
        : `<tr><td colspan="7"><div class="empty"><div class="empty-art">${ic('content')}</div>${videosCache.length ? 'Ничего не найдено' : 'Здесь пока пусто. Загрузите первое видео.'}<br><br>${videosCache.length ? '' : '<button class="btn btn-primary" id="eUp">Загрузить видео</button>'}</div></td></tr>`;
      $('#cCount').textContent = `Видео: ${list.length} из ${videosCache.length}`;
      const e = $('#eUp'); if (e) e.addEventListener('click', openUpload);
      $('#all').checked = false; $('#bulkDel').hidden = true;
    };
    draw();
    $('#cTabs').addEventListener('click', (e) => { const t = e.target.closest('.tab'); if (t) { contentTab = t.dataset.t; draw(); } });
    $('#cQ').addEventListener('input', draw);
    const sync = () => { const n = $$('.sel:checked').length; $('#bulkDel').hidden = !n; $('#bulkDel').textContent = `Удалить выбранные (${n})`; };
    $('#cBody').addEventListener('change', sync);
    $('#all').addEventListener('change', (e) => { $$('.sel').forEach((c) => { c.checked = e.target.checked; }); sync(); });
    const del = async (ids) => {
      if (!(await Panel.confirm('Удалить навсегда?', ids.length === 1 ? 'Видео, его комментарии и оценки будут удалены без возможности восстановления.' : `Будет удалено видео: ${ids.length}. Это действие необратимо.`, 'Удалить'))) return;
      for (const id of ids) { try { await api('/api/videos/' + id, { method: 'DELETE' }); } catch (e) { toast(e.message); } }
      toast('Удалено'); pageContent();
    };
    $('#cBody').addEventListener('click', (e) => { const b = e.target.closest('.del'); if (b) del([b.dataset.id]); });
    $('#bulkDel').addEventListener('click', () => del($$('.sel:checked').map((c) => c.value)));
  }

  /* ---------- Редактирование видео ---------- */
  async function pageVideo(id) {
    loading();
    let v;
    try { const r = await api('/api/studio/videos'); categories = r.categories; videosCache = r.videos; v = r.videos.find((x) => x.id === id); } catch (e) { return fail(e); }
    if (!v) { $('#page').innerHTML = '<div class="empty">Видео не найдено.</div>'; return; }
    document.title = 'Сведения о видео — Студия OrchardTube';
    const cats = categories.concat(['Все']);
    const url = location.origin + '/#/watch/' + v.id;
    $('#page').innerHTML = `
      <p><a class="link-btn" href="#/content">← Контент</a></p>
      <h1 class="p-title">Сведения о видео</h1>
      <div class="edit-grid"><div>
        <div class="field"><label for="vT">Название (обязательно)</label><input id="vT" maxlength="120" value="${esc(v.title)}"><span class="cnt" id="tc"></span></div>
        <div class="field"><label for="vD">Описание</label><textarea id="vD" maxlength="5000" placeholder="Расскажите зрителям о своём видео">${esc(v.desc)}</textarea><span class="cnt" id="dc"></span></div>
        <div class="section-t">Значок</div><div class="hint">Выберите или загрузите картинку, которая даёт представление о содержании видео. JPG, PNG или WebP до 2 МБ.</div>
        <div class="thumb-pick"><div id="thHolder">${thumbHtml({ ...v, duration: '' })}</div><button type="button" class="thumb-up" id="thUp">${ic('upload')}Загрузить значок</button><input type="file" id="thFile" accept="image/jpeg,image/png,image/webp" hidden></div>
        <div class="section-t">Категория</div><div class="field" style="max-width:300px;margin-top:8px"><select id="vC">${cats.map((c) => `<option ${c === v.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
        <div class="section-t">Доступ</div><div class="field" style="max-width:300px;margin-top:8px"><select id="vV">${Object.keys(VIS).map((k) => `<option value="${k}" ${k === v.visibility ? 'selected' : ''}>${VIS[k]}</option>`).join('')}</select></div>
        <div class="hint" id="vHint"></div>
        <div class="save-bar"><button class="btn btn-danger" id="vDel" style="margin-right:auto">Удалить видео</button><a class="btn" href="#/content">Отмена</a><button class="btn btn-primary" id="vSave" disabled>Сохранить</button></div>
      </div>
      <aside class="preview"><video src="${esc(v.media)}" controls preload="metadata" ${v.thumb ? `poster="${esc(v.thumb)}"` : ''}></video>
        <div class="pb"><small>Ссылка на видео</small><a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a><small style="margin-top:12px">Название файла</small>${esc(v.title)}<small style="margin-top:12px">Статистика</small>${num(v.views)} просм. · ${num(v.likes)} «Нравится» · ${num(v.commentsCount)} комм.</div></aside></div>`;
    const hints = { public: 'Видео видят все: оно появляется в ленте и поиске.', unlisted: 'Видео доступно всем, у кого есть ссылка, но не показывается в ленте и поиске.', private: 'Видео видите только вы (и модераторы сайта).' };
    const upd = () => { $('#tc').textContent = $('#vT').value.length + '/120'; $('#dc').textContent = $('#vD').value.length + '/5000'; $('#vHint').textContent = hints[$('#vV').value]; };
    upd();
    const dirty = () => { $('#vSave').disabled = !(($('#vT').value.trim() && $('#vT').value !== v.title) || $('#vD').value !== v.desc || $('#vC').value !== v.category || $('#vV').value !== v.visibility); };
    ['vT', 'vD', 'vC', 'vV'].forEach((i) => $('#' + i).addEventListener('input', () => { upd(); dirty(); }));
    $('#vSave').addEventListener('click', async () => {
      const b = $('#vSave'); b.disabled = true;
      try {
        const r = await api('/api/videos/' + id, { method: 'PATCH', json: { title: $('#vT').value, desc: $('#vD').value, category: $('#vC').value, visibility: $('#vV').value } });
        Object.assign(v, r.video, { commentsCount: v.commentsCount }); toast('Изменения сохранены'); dirty();
      } catch (e) { toast(e.message); b.disabled = false; }
    });
    $('#thUp').addEventListener('click', () => $('#thFile').click());
    $('#thFile').addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      if (f.size > 2 * 1024 * 1024) return toast('Файл больше 2 МБ');
      const fd = new FormData(); fd.append('thumb', f);
      try { const r = await api('/api/videos/' + id + '/thumbnail', { method: 'POST', body: fd }); v.thumb = r.video.thumb; $('#thHolder').innerHTML = thumbHtml({ ...v, duration: '' }); $('.preview video').poster = v.thumb; toast('Значок обновлён'); }
      catch (err) { toast(err.message); }
    });
    $('#vDel').addEventListener('click', async () => {
      if (!(await Panel.confirm('Удалить навсегда?', 'Видео, его комментарии и оценки будут удалены без возможности восстановления.', 'Удалить'))) return;
      try { await api('/api/videos/' + id, { method: 'DELETE' }); toast('Видео удалено'); location.hash = '#/content'; } catch (e) { toast(e.message); }
    });
  }

  /* ---------- Аналитика ---------- */
  let anDays = 28, anMetric = 'views';
  async function pageAnalytics() {
    document.title = 'Аналитика — Студия OrchardTube';
    loading();
    let d; try { d = await api('/api/studio/analytics?days=' + anDays); } catch (e) { return fail(e); }
    const labels = { views: 'Просмотры', subs: 'Новые подписчики', likes: 'Оценки «Нравится»' };
    const tot = { views: d.totals.views, subs: d.totals.subs, likes: d.totals.likes };
    $('#page').innerHTML = `
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap"><h1 class="p-title" style="margin:0">Аналитика канала</h1><span style="flex:1"></span>
        <select class="inp" id="anD" style="width:auto"><option value="7">Последние 7 дней</option><option value="28">Последние 28 дней</option><option value="90">Последние 90 дней</option><option value="365">Последние 365 дней</option></select></div>
      <div class="tabs" style="margin-top:16px"><button class="tab active">Обзор</button></div>
      <div class="metric-tabs" style="border-top:0;border-radius:0">${['views', 'subs', 'likes'].map((k) => `<button class="metric-tab ${k === anMetric ? 'active' : ''}" data-k="${k}"><div class="l">${labels[k]}</div><div class="v">${num(tot[k])}</div></button>`).join('')}</div>
      <div class="chart-card" id="chartBox"></div>
      <h3 style="margin:32px 0 12px;font-weight:500">Видео за период</h3>
      <div class="tbl-wrap" style="border-top:1px solid var(--line);border-radius:8px"><table class="tbl"><thead><tr><th>Видео</th><th class="num">Просмотры за период</th><th class="num">Всего просмотров</th><th class="num">«Нравится»</th><th class="num">Комментарии</th></tr></thead><tbody>${d.videos.length ? d.videos.map((v) => `<tr><td><div class="vcell" style="min-width:260px">${thumbHtml({ thumb: v.thumb, g1: '#444', g2: '#222', duration: '' })}<a class="vt" href="#/video/${esc(v.id)}">${esc(v.title)}</a></div></td><td class="num">${num(v.views)}</td><td class="num">${num(v.total)}</td><td class="num">${num(v.likes)}</td><td class="num">${num(v.comments)}</td></tr>`).join('') : '<tr><td colspan="5"><div class="empty">Нет видео</div></td></tr>'}</tbody></table></div>`;
    $('#anD').value = String(d.days);
    const draw = () => { Panel.chart($('#chartBox'), d.series, anMetric === 'likes' ? 'views' : anMetric, labels[anMetric === 'likes' ? 'views' : anMetric]); };
    // «Нравится» по дням не копим — для этой вкладки показываем просмотры, а итог за период берём из базы
    if (anMetric === 'likes') $('#chartBox').innerHTML = `<div class="empty">График по дням для оценок не ведётся. За период: <b>${num(d.totals.likes)}</b></div>`; else draw();
    $('#anD').addEventListener('change', (e) => { anDays = Number(e.target.value); pageAnalytics(); });
    $$('.metric-tab').forEach((b) => b.addEventListener('click', () => { anMetric = b.dataset.k; $$('.metric-tab').forEach((x) => x.classList.toggle('active', x === b)); if (anMetric === 'likes') $('#chartBox').innerHTML = `<div class="empty">График по дням для оценок не ведётся. За период: <b>${num(d.totals.likes)}</b></div>`; else draw(); }));
  }

  /* ---------- Комментарии ---------- */
  async function pageComments() {
    document.title = 'Комментарии — Студия OrchardTube';
    loading();
    let list; try { list = (await api('/api/studio/comments')).comments; } catch (e) { return fail(e); }
    $('#page').innerHTML = `<h1 class="p-title">Комментарии на канале</h1><div class="tabs"><button class="tab active">Опубликованные</button></div>
      <div class="list-card">${list.length ? list.map((c) => `<div class="cm" data-id="${esc(c.id)}"><div class="ava" style="background:${esc(c.color)}">${esc(c.avatar)}</div><div><div class="who">${esc(c.author)}<small>${esc(c.ago)}</small></div><div class="txt">${esc(c.text)}</div><div class="on">К видео: <a href="/#/watch/${esc(c.videoId)}" style="color:var(--blue)">${esc(c.videoTitle)}</a></div></div><button class="p-icon del" title="Удалить" data-id="${esc(c.id)}">${ic('trash')}</button></div>`).join('') : `<div class="empty"><div class="empty-art">${ic('comment')}</div>Комментариев пока нет</div>`}</div>`;
    $$('.cm .del').forEach((b) => b.addEventListener('click', async () => {
      if (!(await Panel.confirm('Удалить комментарий?', 'Он исчезнет у всех зрителей.', 'Удалить'))) return;
      try { await api('/api/comments/' + b.dataset.id, { method: 'DELETE' }); b.closest('.cm').remove(); toast('Комментарий удалён'); } catch (e) { toast(e.message); }
    }));
  }

  /* ---------- Настройки ---------- */
  function pageSettings() {
    document.title = 'Настройки — Студия OrchardTube';
    const ch = me.channel;
    $('#page').innerHTML = `<h1 class="p-title">Настройки</h1><div class="tabs"><button class="tab active">Канал</button></div>
      <div class="card" style="border-radius:0 0 8px 8px;border-top:0;max-width:760px">
        <div class="field"><label for="sN">Название канала</label><input id="sN" maxlength="50" value="${esc(ch.name)}"></div>
        <div class="field"><label>Идентификатор канала</label><input value="${esc(ch.handle)}" disabled></div>
        <div class="field"><label for="sD">Описание канала</label><textarea id="sD" maxlength="1000" placeholder="Расскажите зрителям о канале">${esc(ch.description)}</textarea></div>
        <div class="field"><label>Адрес почты аккаунта</label><input value="${esc(me.user.email)}" disabled></div>
        <button class="btn btn-primary" id="sSave">Опубликовать</button></div>`;
    $('#sSave').addEventListener('click', async () => {
      try {
        const r = await api('/api/channel', { method: 'PATCH', json: { name: $('#sN').value, description: $('#sD').value } });
        me.channel = r.channel; toast('Настройки сохранены'); shell(); setNav('settings'); pageSettings();
      } catch (e) { toast(e.message); }
    });
  }

  /* ---------- Загрузка видео ---------- */
  function probeVideo(file) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const vid = document.createElement('video');
      vid.muted = true; vid.preload = 'metadata'; vid.playsInline = true;
      let done = false;
      const finish = (r) => { if (done) return; done = true; URL.revokeObjectURL(url); resolve(r); };
      const timer = setTimeout(() => finish({ duration: 0, thumb: null }), 6000);
      vid.addEventListener('error', () => { clearTimeout(timer); finish({ duration: 0, thumb: null }); });
      vid.addEventListener('loadedmetadata', () => { const d = isFinite(vid.duration) ? vid.duration : 0; vid.currentTime = d > 2 ? Math.min(1.5, d / 2) : 0; });
      vid.addEventListener('seeked', () => {
        const d = isFinite(vid.duration) ? vid.duration : 0;
        try {
          const c = document.createElement('canvas'); c.width = 640; c.height = 360;
          const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 640, 360);
          const r = Math.min(640 / vid.videoWidth, 360 / vid.videoHeight), w = vid.videoWidth * r, h = vid.videoHeight * r;
          g.drawImage(vid, (640 - w) / 2, (360 - h) / 2, w, h);
          c.toBlob((b) => { clearTimeout(timer); finish({ duration: d, thumb: b }); }, 'image/jpeg', 0.82);
        } catch (e) { clearTimeout(timer); finish({ duration: d, thumb: null }); }
      });
      vid.src = url;
    });
  }
  const durLabel = (s) => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };

  let maxMb = 100;
  function openUpload() {
    const m = Panel.modal('Загрузка видео', `
      <div class="drop" id="drop" tabindex="0" role="button"><div class="empty-art">${ic('upload')}</div><b id="dT">Перетащите видеофайл сюда</b><div id="dH" style="font-size:13px;margin:6px 0 16px">Формат MP4, WebM, MOV и др. До ${maxMb} МБ. Тип доступа выберите ниже.</div><button type="button" class="btn btn-primary">Выбрать файлы</button></div>
      <input type="file" id="uF" accept="video/*" hidden>
      <div id="uForm" hidden style="margin-top:20px">
        <div class="field"><label for="uT">Название (обязательно)</label><input id="uT" maxlength="120"></div>
        <div class="field"><label for="uD">Описание</label><textarea id="uD" maxlength="5000" style="min-height:90px"></textarea></div>
        <div style="display:flex;gap:12px;flex-wrap:wrap"><div class="field" style="flex:1;min-width:160px"><label for="uC">Категория</label><select id="uC">${categories.map((c) => `<option>${esc(c)}</option>`).join('')}</select></div>
        <div class="field" style="flex:1;min-width:160px"><label for="uV">Доступ</label><select id="uV"><option value="public">Открытый доступ</option><option value="unlisted">Доступ по ссылке</option><option value="private">Ограниченный доступ</option></select></div></div>
        <div class="progress" id="uPr" hidden><i id="uBar"></i></div><div class="hint" id="uSt"></div>
      </div>`, `<button class="btn" data-close>Отмена</button><button class="btn btn-primary" id="uGo" disabled>Опубликовать</button>`);
    let file = null, probe = null;
    const drop = $('#drop', m), inp = $('#uF', m);
    const pick = async (f) => {
      if (!f) return;
      if (!/^video\//.test(f.type) && !/\.(mp4|m4v|webm|mkv|mov|avi|ogv|3gp)$/i.test(f.name)) return toast('Нужен видеофайл');
      if (f.size > maxMb * 1048576) return toast(`Файл больше ${maxMb} МБ`);
      file = f; $('#uForm', m).hidden = false; drop.style.padding = '16px'; $('#dT', m).textContent = f.name;
      $('#uT', m).value = f.name.replace(/\.[^.]+$/, ''); $('#uGo', m).disabled = false;
      probe = await probeVideo(f);
      $('#uSt', m).textContent = probe.duration ? 'Длительность: ' + durLabel(probe.duration) : '';
    };
    drop.addEventListener('click', () => inp.click());
    inp.addEventListener('change', () => pick(inp.files[0]));
    ['dragover', 'dragenter'].forEach((e) => drop.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((e) => drop.addEventListener(e, () => drop.classList.remove('over')));
    drop.addEventListener('drop', (ev) => { ev.preventDefault(); pick(ev.dataTransfer.files[0]); });
    $('#uGo', m).addEventListener('click', () => {
      const title = $('#uT', m).value.trim();
      if (!file || !title) return toast('Укажите название');
      const fd = new FormData();
      fd.append('title', title); fd.append('desc', $('#uD', m).value); fd.append('category', $('#uC', m).value); fd.append('visibility', $('#uV', m).value);
      fd.append('duration', probe && probe.duration ? durLabel(probe.duration) : '0:00');
      fd.append('video', file, file.name);
      if (probe && probe.thumb) fd.append('thumb', probe.thumb, 'thumb.jpg');
      $('#uGo', m).disabled = true; $('#uPr', m).hidden = false;
      const x = new XMLHttpRequest();
      x.open('POST', '/api/videos');
      x.upload.onprogress = (e) => { if (e.lengthComputable) { $('#uBar', m).style.width = (e.loaded / e.total) * 100 + '%'; $('#uSt', m).textContent = `Загрузка… ${Math.round((e.loaded / e.total) * 100)}%`; } };
      x.onload = () => {
        let r = {}; try { r = JSON.parse(x.responseText); } catch (e) { /* пусто */ }
        if (x.status === 201) { m.close(); toast('Видео опубликовано'); if ((location.hash || '').startsWith('#/content')) pageContent(); else location.hash = '#/content'; }
        else { $('#uSt', m).textContent = r.message || 'Не удалось загрузить'; $('#uGo', m).disabled = false; $('#uPr', m).hidden = true; }
      };
      x.onerror = () => { $('#uSt', m).textContent = 'Нет связи с сервером'; $('#uGo', m).disabled = false; };
      x.send(fd);
    });
  }

  /* ---------- старт ---------- */
  async function init() {
    $('#app').innerHTML = '<div class="gate"><p>Загрузка студии…</p></div>';
    try {
      const cfg = await api('/api/config'); maxMb = cfg.maxUploadMb || 100;
      me = await api('/api/me');
    } catch (e) { return gate('Студия недоступна', e.message); }
    if (!me || !me.user) return gate('Войдите, чтобы открыть Студию', 'Студия доступна авторам канала. Войдите через Google на главной странице.', 'Перейти на сайт');
    if (me.banned) return gate('Аккаунт заблокирован', me.banned.reason || 'Доступ к Студии закрыт.');
    if (!me.channel) return gate('Сначала создайте канал', 'Создайте канал на главной странице OrchardTube — после этого здесь появится Студия.', 'Создать канал');
    shell();
    window.addEventListener('hashchange', route);
    route();
  }
  init();
})();
