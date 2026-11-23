/* =========================================================
   OrchardTube — приложение
   ========================================================= */
(function () {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const main = $('#main');
  const pop = $('#popover');
  const toastEl = $('#toast');
  const backdrop = $('#modalBackdrop');
  const modalEl = $('#modal');

  const CHIP_CATS = ['Все', 'Технологии', 'Музыка', 'Игры', 'Новости', 'Обучение', 'Спорт', 'Дизайн', 'Путешествия', 'Еда', 'Юмор'];

  /* ---------------- состояние ---------------- */
  const KEY = 'orchardtube.v2';

  function loadState() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }

  const saved = loadState();

  // Только то, что живёт в браузере: тема, «смотреть позже», история, дизлайки.
  // Лайки и подписки хранятся на сервере и приходят из /api/me.
  const state = {
    theme: saved.theme || 'dark',
    subs: new Set(),
    likes: new Set(),
    dislikes: new Set(saved.dislikes || []),
    later: new Set(saved.later || []),
    history: Array.isArray(saved.history) ? saved.history : [],
    filter: 'Все',
    hidden: new Set()
  };
  // Данные приходят с сервера
  const VIDEOS = [];
  const CHANNELS = {};
  const commentsCache = {};
  let me = null; // { user, channel, likes, subs } или null, если не вошли
  const api = { online: false, googleClientId: '', maxMb: 0, contact: '' };

  function saveState() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        theme: state.theme,
        dislikes: [...state.dislikes],
        later: [...state.later],
        history: state.history
      }));
    } catch (e) { /* приватный режим — просто живём без сохранения */ }
  }

  /* ---------------- утилиты ---------------- */
  const fmt = (n) => Number(n || 0).toLocaleString('ru-RU');
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const plural = (n, one, few, many) => {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  };

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toastEl.classList.remove('show'), 2400);
  }

  // Видео «по ссылке» и ограниченные не попадают в ленту — подгружаем их отдельно при открытии страницы
  const EXTRA = {};
  const triedVideo = {};
  function byId(id) { return VIDEOS.find((v) => v.id === id) || EXTRA[id]; }

  /* ---------------- серверный API ---------------- */
  async function apiFetch(url, opts = {}, timeout = 15000) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeout);
    try {
      const r = await fetch(url, { ...opts, signal: ctl.signal });
      let data = null;
      try { data = await r.json(); } catch (e) { /* пустой ответ */ }
      return { ok: r.ok, status: r.status, data };
    } finally { clearTimeout(t); }
  }

  const jsonPost = (url, body, method = 'POST', timeout = 15000) =>
    apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }, timeout);

  const initialsOf = (name) => {
    const w = String(name || '?').trim().split(/\s+/).filter(Boolean);
    return ((w[0] ? w[0][0] : '?') + (w.length > 1 ? w[1][0] : '')).toUpperCase().slice(0, 2);
  };

  function applyMe(data) {
    me = data && data.user ? data : null;
    state.likes = new Set(me ? me.likes : []);
    state.subs = new Set(me ? me.subs : []);
    if (me && me.channel) CHANNELS[me.channel.id] = me.channel;
    if (me && me.banned && !applyMe.warned) { applyMe.warned = true; setTimeout(() => toast('Аккаунт заблокирован' + (me.banned.reason ? ': ' + me.banned.reason : '') + '. Загрузка, комментарии и оценки отключены.'), 800); }
  }

  // Бесплатный сервер на Render просыпается до минуты — ждём, но честно показываем это в интерфейсе
  async function loadRemote() {
    try {
      const [cfg, boot, who] = await Promise.all([
        apiFetch('/api/config', {}, 70000),
        apiFetch('/api/bootstrap', {}, 70000),
        apiFetch('/api/me', {}, 70000)
      ]);
      if (!boot.ok || !boot.data || !cfg.data) throw new Error('bad response');
      api.online = true;
      api.googleClientId = cfg.data.googleClientId || '';
      api.maxMb = cfg.data.maxUploadMb || 0;
      api.contact = cfg.data.contactEmail || '';
      VIDEOS.splice(0, VIDEOS.length, ...boot.data.VIDEOS);
      Object.keys(CHANNELS).forEach((k) => delete CHANNELS[k]);
      Object.assign(CHANNELS, boot.data.CHANNELS);
      applyMe(who.data);
    } catch (e) {
      api.online = false;
    }
  }

  function chOf(v) { return CHANNELS[v.channel] || { name: 'Канал удалён', avatar: '?', color: '#777', subs: '0', id: v.channel }; }
  function avatarHtml(ch, size) {
    const st = `background:${ch.color};${size ? `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.36)}px` : ''}`;
    if (ch.avatarUrl) return `<span class="ch-avatar" style="${st}"><img src="${esc(ch.avatarUrl)}" alt="" loading="lazy"></span>`;
    return `<span class="ch-avatar" style="${st}">${esc(ch.avatar)}</span>`;
  }
  function thumbArt(v) {
    if (v.thumb) {
      return `<div class="thumb-art has-img" style="background:linear-gradient(135deg, ${v.g1}, ${v.g2})">
      <img class="thumb-img" src="${esc(v.thumb)}" alt="" loading="lazy">
    </div>`;
    }
    return `<div class="thumb-art" style="background:linear-gradient(135deg, ${v.g1}, ${v.g2})">
      <span class="thumb-emoji">${v.emoji}</span>
      <span class="thumb-brand">OrchardTube</span>
    </div>`;
  }
  function durBadge(v) {
    return `<span class="thumb-duration">${esc(v.duration)}</span>`;
  }
  function progressBar() { return ''; }

  /* ---------------- карточки ---------------- */
  function videoCard(v) {
    if (state.hidden.has(v.id)) return '';
    const ch = chOf(v);
    return `
    <article class="video-card" data-card="${v.id}">
      <a class="thumb" href="#/watch/${v.id}" aria-label="${esc(v.title)}">
        ${thumbArt(v)}
        ${durBadge(v)}
        ${progressBar(v)}
        <div class="thumb-actions">
          <button class="thumb-act" data-act="later" data-id="${v.id}" title="Смотреть позже" aria-label="Смотреть позже"><svg class="ic"><use href="#i-clock"/></svg></button>
          ${me && me.channel && v.channel === me.channel.id ? `<button class="thumb-act thumb-del" data-act="delete" data-id="${v.id}" title="Удалить видео" aria-label="Удалить видео"><svg class="ic"><use href="#i-trash"/></svg></button>` : ''}
        </div>
      </a>
      <div class="card-body">
        <a class="card-avatar" href="#/channel/${v.channel}" aria-label="${esc(ch.name)}">${avatarHtml(ch)}</a>
        <div class="card-text">
          <a class="card-title" href="#/watch/${v.id}">${esc(v.title)}</a>
          <a class="card-channel" href="#/channel/${v.channel}">
            ${esc(ch.name)}
            ${ch.verified ? '<svg class="ic"><use href="#i-verified"/></svg>' : ''}
          </a>
          <div class="card-meta">
            <span>${v.live ? `${v.watching} смотрят` : v.viewsText}</span>
            <span class="dot">●</span>
            <span>${v.ago}</span>
          </div>
        </div>
        <button class="card-more" data-more="${v.id}" aria-label="Действия">
          <svg class="ic"><use href="#i-more"/></svg>
        </button>
      </div>
    </article>`;
  }

  function compactCard(v) {
    return `
    <a class="compact-card" href="#/watch/${v.id}">
      <div class="compact-thumb">
        ${thumbArt(v)}
        ${durBadge(v)}
        ${progressBar(v)}
      </div>
      <div class="compact-info">
        <h3 class="compact-title">${esc(v.title)}</h3>
        <div class="compact-channel">${esc(chOf(v).name)}</div>
        <div class="compact-meta">${v.live ? `${v.watching} смотрят` : v.viewsText} · ${v.ago}</div>
      </div>
    </a>`;
  }

  function rowVideo(v, opts = {}) {
    const ch = chOf(v);
    return `
    <article class="row-video" data-row="${v.id}">
      <a class="row-thumb" href="#/watch/${v.id}">
        ${thumbArt(v)}
        ${durBadge(v)}
        ${progressBar(v)}
      </a>
      <div class="row-body">
        <a href="#/watch/${v.id}"><h3 class="row-title">${esc(v.title)}</h3></a>
        <div class="row-meta">${v.live ? `${v.watching} смотрят` : v.viewsText} · ${v.ago}</div>
        <a class="card-channel" href="#/channel/${v.channel}">${avatarHtml(ch, 24)} ${esc(ch.name)} ${ch.verified ? '<svg class="ic"><use href="#i-verified"/></svg>' : ''}</a>
        <p class="row-desc">${esc(v.desc.split('\n')[0])}</p>
        ${opts.actions ? `<div class="row-actions">${opts.actions}</div>` : ''}
      </div>
    </article>`;
  }


  /* ---------------- поповеры ---------------- */
  function openPopover(anchor, html, align = 'right') {
    pop.hidden = false;
    pop.innerHTML = html;
    const r = anchor.getBoundingClientRect();
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    let left = align === 'right' ? r.right - w : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    let top = r.bottom + 8;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 8);
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }
  function closePopover() { pop.hidden = true; pop.innerHTML = ''; }

  document.addEventListener('click', (e) => {
    if (!pop.hidden && !pop.contains(e.target) && !e.target.closest('[data-keep-popover]')) closePopover();
  });
  window.addEventListener('resize', closePopover);

  // Удаление своего видео (со страницы канала, из «Ваших видео», из меню карточки)
  async function deleteVideo(id) {
    const v = byId(id);
    if (!v || !confirm(`Удалить видео «${v.title}»? Это действие нельзя отменить.`)) return;
    const r = await apiFetch(`/api/videos/${encodeURIComponent(id)}`, { method: 'DELETE' }, 15000).catch(() => null);
    if (!r || !r.ok) { toast((r && r.data && r.data.message) || 'Не удалось удалить видео'); return; }
    const i = VIDEOS.findIndex((x) => x.id === id);
    if (i >= 0) VIDEOS.splice(i, 1);
    delete EXTRA[id];
    if (me && me.channel && CHANNELS[me.channel.id]) CHANNELS[me.channel.id].videoCount = Math.max(0, (CHANNELS[me.channel.id].videoCount || 1) - 1);
    toast('Видео удалено');
    if (parseRoute().parts[0] === 'watch') location.hash = me && me.channel ? '#/channel/' + me.channel.id : '#/'; else render();
  }

  function closeCtx() { const m = document.getElementById('ctxMenu'); if (m) m.remove(); }
  document.addEventListener('mousedown', (e) => { if (!e.target.closest('#ctxMenu')) closeCtx(); });
  window.addEventListener('scroll', closeCtx, true);
  window.addEventListener('blur', closeCtx);

  function openVideoMenu(anchor, id) {
    const v = byId(id);
    if (!v) return;
    openPopover(anchor, `
      <button class="pop-item" data-act="later"><svg class="ic"><use href="#i-clock"/></svg>${state.later.has(id) ? 'Убрать из «Смотреть позже»' : 'Смотреть позже'}</button>
      <button class="pop-item" data-act="share"><svg class="ic"><use href="#i-link"/></svg>Поделиться</button>
      <div class="pop-sep"></div>
      <button class="pop-item" data-act="hide"><svg class="ic"><use href="#i-close"/></svg>Не интересует</button>
      ${me && me.channel && v.channel === me.channel.id ? `<div class="pop-sep"></div><button class="pop-item" data-act="delete" style="color:#ff5a4d"><svg class="ic"><use href="#i-trash"/></svg>Удалить видео</button>` : ''}
    `);
    $$('#popover .pop-item').forEach((b) => b.addEventListener('click', () => {
      const act = b.dataset.act;
      closePopover();
      if (act === 'later') {
        toggleLater(id);
      } else if (act === 'share') {
        copyLink(id);
      } else if (act === 'delete') {
        deleteVideo(id);
      } else if (act === 'hide') {
        state.hidden.add(id);
        const card = $(`[data-card="${id}"]`);
        if (card) { card.style.opacity = '0'; setTimeout(() => card.remove(), 180); }
        toast('Больше не будем рекомендовать это видео');
      }
    }));
  }

  function copyLink(id) {
    const url = location.origin + location.pathname + '#/watch/' + id;
    const done = () => toast('Ссылка скопирована');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done).catch(() => { toast(url); });
    } else {
      toast(url);
    }
  }

  function toggleLater(id) {
    if (state.later.has(id)) {
      state.later.delete(id);
      toast('Удалено из «Смотреть позже»');
    } else {
      state.later.add(id);
      toast('Добавлено в «Смотреть позже»');
    }
    saveState();
    syncLaterButtons(id);
  }

  function syncLaterButtons(id) {
    $$(`[data-act="later"][data-id="${id}"]`).forEach((b) => {
      b.classList.toggle('active', state.later.has(id));
    });
    $$(`[data-watch-later="${id}"]`).forEach((b) => {
      const on = state.later.has(id);
      b.classList.toggle('active', on);
      const t = b.querySelector('span');
      if (t) t.textContent = on ? 'Сохранено' : 'Сохранить';
    });
  }

  /* ---------------- модальные окна ---------------- */
  function openModal(html) {
    modalEl.innerHTML = html;
    backdrop.hidden = false;
    document.body.style.overflow = 'hidden';
    $$('[data-close]', modalEl).forEach((b) => b.addEventListener('click', closeModal));
    const first = modalEl.querySelector('input, textarea, select');
    if (first) setTimeout(() => first.focus(), 60);
  }
  function closeModal() {
    backdrop.hidden = true;
    modalEl.innerHTML = '';
    document.body.style.overflow = '';
  }
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeCtx();
      closePopover();
      if (!backdrop.hidden) closeModal();
      document.body.classList.remove('nav-open');
      return;
    }
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (typing) return;

    if (window.__otPlayerKey && !e.ctrlKey && !e.metaKey && !e.altKey && window.__otPlayerKey(e)) { e.preventDefault(); return; }
    if (e.key === '/') { e.preventDefault(); $('#searchInput').focus(); }
    if (e.key === '?') { e.preventDefault(); openHelp(); }
    if (e.key.toLowerCase() === 't') toggleTheme();
    if (e.key.toLowerCase() === 'k') togglePlay();
    if (e.key === ' ' && $('#player')) { e.preventDefault(); togglePlay(); }
  });

  /* ---------------- тема ---------------- */
  function applyTheme() {
    document.documentElement.dataset.theme = state.theme;
    const icon = $('#themeIcon use');
    if (icon) icon.setAttribute('href', state.theme === 'dark' ? '#i-sun' : '#i-moon');
    const label = $('#themeLabel');
    if (label) label.textContent = state.theme === 'dark' ? 'Светлая тема' : 'Тёмная тема';
  }
  function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    saveState();
    applyTheme();
    toast(state.theme === 'dark' ? 'Тёмная тема включена' : 'Светлая тема включена');
  }

  /* ---------------- сайдбар ---------------- */
  function renderSideChannels() {
    const box = $('#sideChannels');
    if (!box) return;
    const list = [...state.subs].map((id) => CHANNELS[id]).filter(Boolean);
    box.innerHTML = list.map((ch) => `<a class="side-item" href="#/channel/${ch.id}">${avatarHtml(ch)}<span>${esc(ch.name)}</span></a>`).join('');
    $$('.side-subs-only').forEach((el) => { el.hidden = !list.length; });
  }

  /* ---------------- роутер ---------------- */
  function parseRoute() {
    const raw = location.hash.replace(/^#/, '') || '/';
    const qi = raw.indexOf('?');
    const path = qi >= 0 ? raw.slice(0, qi) : raw;
    const qs = qi >= 0 ? raw.slice(qi + 1) : '';
    return { parts: path.split('/').filter(Boolean), params: new URLSearchParams(qs) };
  }

  function setActiveNav(page) {
    $$('.side-item[data-nav]').forEach((a) => {
      a.classList.toggle('active', a.dataset.nav === page);
    });
  }

  /* ---------------- страницы ---------------- */
  function chipsHtml(active) {
    return `<div class="chips-wrap">
      <div class="chips" id="chips">
        ${CHIP_CATS.map((c) => `<button class="chip ${c === active ? 'active' : ''}" data-cat="${c}">${c}</button>`).join('')}
      </div>
    </div>`;
  }

  function gridHtml() {
    if (!VIDEOS.length) {
      return emptyHtml('🍊', 'Пока нет ни одного видео', 'Станьте первым: войдите через Google, создайте канал и загрузите видео.', { label: 'Загрузить видео', id: 'emptyUpload' });
    }
    let list = VIDEOS.filter((v) => !state.hidden.has(v.id));
    if (state.filter !== 'Все') list = list.filter((v) => v.category === state.filter);
    if (!list.length) return emptyHtml('🍊', 'В этой категории пока пусто', 'Попробуйте другую категорию — или загрузите своё видео.', { label: 'Загрузить видео', id: 'emptyUpload' });
    return list.map(videoCard).join('');
  }


  // action: { label, href } — ссылка, либо { label, id } — кнопка, которую привязывает bindPage
  function emptyHtml(emoji, title, text, action) {
    const a = action || { label: 'На главную', href: '#/' };
    return `<div class="empty">
      <div class="empty-emoji">${emoji}</div>
      <h2>${esc(title)}</h2>
      <p>${esc(text)}</p>
      ${a.id ? `<button class="btn btn-primary" id="${a.id}">${esc(a.label)}</button>` : `<a class="btn btn-primary" href="${a.href}">${esc(a.label)}</a>`}
    </div>`;
  }

  const LOGIN_PROMPT = (what) => emptyHtml('🔐', 'Войдите в аккаунт', what, { label: 'Войти через Google', id: 'emptyLogin' });

  function pageHome() {
    return `
      ${chipsHtml(state.filter)}
      <div class="video-grid" id="homeGrid">${gridHtml()}</div>`;
  }


  function pageSubs() {
    if (!me) return LOGIN_PROMPT('Подписывайтесь на каналы — их новые видео появятся здесь.');
    const list = VIDEOS.filter((v) => state.subs.has(v.channel));
    return `
      <div class="page-head">
        <h1>Подписки</h1>
        <p>Свежие видео каналов, на которые вы подписаны.</p>
      </div>
      ${list.length ? `<div class="video-grid">${list.map(videoCard).join('')}</div>` : emptyHtml('🌱', 'Пока нет подписок', 'Подпишитесь на каналы, и здесь появятся их новые видео.')}`;
  }



  function pageHistory() {
    const list = state.history.map(byId).filter(Boolean);
    return `
      <div class="page-head" style="display:flex;align-items:flex-end;gap:16px;flex-wrap:wrap">
        <div style="flex:1"><h1>История</h1><p>${list.length} ${plural(list.length, 'видео', 'видео', 'видео')} в истории просмотров.</p></div>
        ${list.length ? '<button class="btn" id="clearHistory">Очистить историю</button>' : ''}
      </div>
      <div class="list-rows">
        ${list.length ? list.map((v) => rowVideo(v, { actions: `<button class="btn btn-ghost" data-remove-history="${v.id}">Удалить из истории</button>` })).join('') : emptyHtml('🕘', 'История пуста', 'Здесь появятся видео, которые вы смотрели.')}
      </div>`;
  }

  function pageLiked() {
    if (!me) return LOGIN_PROMPT('Лайки привязаны к аккаунту — войдите, чтобы увидеть понравившиеся видео.');
    const list = [...state.likes].map(byId).filter(Boolean);
    return `
      <div class="page-head"><h1>Понравившиеся видео</h1><p>${list.length} ${plural(list.length, 'видео', 'видео', 'видео')}.</p></div>
      ${list.length ? `<div class="video-grid">${list.map(videoCard).join('')}</div>` : emptyHtml('👍', 'Пока ничего нет', 'Ставьте лайки видео — они появятся в этом списке.')}`;
  }

  function pageLater() {
    const list = [...state.later].map(byId).filter(Boolean);
    return `
      <div class="page-head"><h1>Смотреть позже</h1><p>${list.length} ${plural(list.length, 'видео', 'видео', 'видео')} сохранено.</p></div>
      <div class="list-rows">
        ${list.length ? list.map((v) => rowVideo(v, { actions: `<button class="btn btn-ghost" data-remove-later="${v.id}">Удалить</button>` })).join('') : emptyHtml('⏱️', 'Список пуст', 'Сохраняйте видео кнопкой «Смотреть позже», чтобы вернуться к ним.')}
      </div>`;
  }

  function pageMyVideos() {
    if (!me) return LOGIN_PROMPT('Войдите, чтобы создать канал и загружать видео.');
    if (!me.channel) return emptyHtml('📺', 'У вас пока нет канала', 'Создайте канал — это займёт полминуты.', { label: 'Создать канал', id: 'emptyCreateChannel' });
    const list = VIDEOS.filter((v) => v.channel === me.channel.id);
    return `
      <div class="page-head" style="display:flex;align-items:flex-end;gap:16px;flex-wrap:wrap">
        <div style="flex:1"><h1>Ваши видео</h1><p>Контент канала «${esc(me.channel.name)}».</p></div>
        <button class="btn btn-primary" id="uploadBtn2">Загрузить видео</button>
      </div>
      <div class="list-rows">
        ${list.length ? list.map((v) => rowVideo(v, {
          actions: `<span class="chip">${fmt(v.views)} просмотров</span><span class="chip">👍 ${fmt(v.likes || 0)}</span><span class="chip">${esc(v.ago)}</span><button class="chip chip-danger" data-del="${v.id}">Удалить</button>`
        })).join('') : emptyHtml('🎬', 'Вы ещё ничего не загрузили', 'Загрузите первое видео — оно сразу появится на главной.', { label: 'Загрузить видео', id: 'emptyUpload' })}
      </div>`;
  }

  function pageSearch(q) {
    const query = (q || '').trim().toLowerCase();
    let list = VIDEOS.filter((v) => !state.hidden.has(v.id));
    if (query) {
      list = list.filter((v) =>
        v.title.toLowerCase().includes(query) ||
        chOf(v).name.toLowerCase().includes(query) ||
        (v.desc || '').toLowerCase().includes(query) ||
        v.category.toLowerCase().includes(query)
      );
    }
    return `
      ${chipsHtml('Все')}
      <div class="page-head">
        <h1>${query ? `Результаты по запросу «${esc(q)}»` : 'Все видео'}</h1>
        <p>${list.length} ${plural(list.length, 'результат', 'результата', 'результатов')}</p>
      </div>
      <div class="list-rows">
        ${list.length ? list.map((v) => rowVideo(v)).join('') : emptyHtml('🔍', 'Ничего не найдено', 'Попробуйте другой запрос или категорию.')}
      </div>`;
  }

  function carousel(cards) {
    return `<div class="car"><button class="car-btn prev" aria-label="Назад" hidden>&#8249;</button><div class="car-track">${cards}</div><button class="car-btn next" aria-label="Вперёд" hidden>&#8250;</button></div>`;
  }

  function sortVideos(list, sort) {
    const a = list.slice();
    if (sort === 'popular') a.sort((x, y) => (y.views || 0) - (x.views || 0));
    else if (sort === 'old') a.sort((x, y) => new Date(x.at) - new Date(y.at));
    else a.sort((x, y) => new Date(y.at) - new Date(x.at));
    return a;
  }

  function linkHost(u) { try { return new URL(u).host.replace(/^www\./, '') + (new URL(u).pathname.length > 1 ? new URL(u).pathname : ''); } catch (e) { return u; } }

  /* ---------------- правовые страницы ---------------- */
  const LEGAL = {
    about: ['О сервисе', () => `<p>OrchardTube — видеоплатформа, на которой любой человек может войти через аккаунт Google, создать канал, загружать видео, комментировать и подписываться на других авторов.</p>
      <p>Для авторов есть Студия (<a href="/studio">/studio</a>): управление видео, аналитика и комментарии.</p>`],
    privacy: ['Политика конфиденциальности', () => `<h2>Какие данные мы получаем</h2>
      <p>При входе через Google мы получаем имя, адрес электронной почты и фото профиля вашего аккаунта. Пароль от Google нам не передаётся.</p>
      <h2>Зачем они нужны</h2>
      <p>Имя и почта нужны, чтобы создать ваш аккаунт и канал, а также чтобы определить ваши права (например, роль модератора). Адрес почты другим пользователям не показывается.</p>
      <h2>Что видят другие</h2>
      <p>Публично отображаются название и адрес канала, загруженные вами видео, комментарии и число подписчиков. Ваши лайки и подписки видите только вы.</p>
      <h2>Файлы cookie и хранилище браузера</h2>
      <p>Мы используем один служебный файл cookie для входа (сессия) и локальное хранилище браузера для темы, истории просмотров и списка «Смотреть позже». Рекламных и отслеживающих cookie нет.</p>
      <h2>Просмотры</h2>
      <p>Чтобы не накручивать просмотры, сервер кратковременно учитывает IP-адрес в памяти. В базе IP-адреса не хранятся.</p>
      <h2>Удаление данных</h2>
      <p>Вы можете удалить свои видео и комментарии в любой момент. Чтобы удалить аккаунт и канал целиком, свяжитесь с владельцем сайта (раздел «Связаться»).</p>`],
    copyright: ['Авторские права', () => `<h2>Ваш контент</h2>
      <p>Загружая видео, вы подтверждаете, что у вас есть права на это видео, музыку и другие материалы в нём. Права на контент остаются у автора.</p>
      <h2>Чужие материалы</h2>
      <p>Нельзя загружать материалы, на которые у вас нет прав: фильмы, чужие видео, музыку и т.п. без разрешения правообладателя.</p>
      <h2>Как сообщить о нарушении</h2>
      <p>Если вы правообладатель и нашли своё произведение на сайте, напишите владельцу (раздел «Связаться») и укажите: ссылку на видео, ссылку на оригинал или подтверждение прав, ваши контактные данные. Нарушающее видео будет удалено модераторами, а при повторных нарушениях канал может быть заблокирован.</p>`],
    terms: ['Условия использования', () => `<p>Используя OrchardTube, вы соглашаетесь с этими правилами.</p>
      <h2>Нельзя</h2>
      <ul><li>загружать материалы, нарушающие закон или чужие права;</li><li>публиковать спам, оскорбления, угрозы и травлю;</li><li>загружать вредоносные файлы и обманывать пользователей;</li><li>накручивать просмотры, лайки и подписчиков;</li><li>выдавать себя за другого человека или канал.</li></ul>
      <h2>Модерация</h2>
      <p>Модераторы и администраторы могут удалять видео и комментарии, нарушающие правила, и блокировать пользователей. Заблокированный пользователь не может загружать видео, комментировать и ставить оценки, а его видео скрываются.</p>
      <h2>Ответственность</h2>
      <p>Автор отвечает за загруженный им контент. Сервис предоставляется «как есть», без гарантий бесперебойной работы.</p>`],
    contact: ['Связаться', () => `<p>По вопросам работы сайта, удаления аккаунта и нарушений авторских прав напишите владельцу сайта.</p>
      ${api.contact ? `<p><a href="mailto:${esc(api.contact)}">${esc(api.contact)}</a></p>` : '<p>Контактный адрес пока не указан владельцем сайта.</p>'}`]
  };

  function pageLegal(kind) {
    const e = LEGAL[kind] || LEGAL.about;
    return `<div class="legal"><h1>${esc(e[0])}</h1>${e[1]()}<p class="legal-nav">${Object.keys(LEGAL).map((k) => `<a href="#/legal/${k}">${esc(LEGAL[k][0])}</a>`).join('')}</p></div>`;
  }

  function pageChannel(chId, tab) {
    const ch = CHANNELS[chId];
    if (!ch) return emptyHtml('🍊', 'Канал не найден', 'Возможно, ссылка устарела.');
    const { params } = parseRoute();
    const list = VIDEOS.filter((v) => v.channel === chId);
    const isSub = state.subs.has(chId);
    const own = !!(me && me.channel && me.channel.id === chId);
    const activeTab = ['videos', 'about', 'search'].includes(tab) ? tab : 'home';
    const base = '#/channel/' + esc(chId);
    const tabs = [['home', 'Главная', base], ['videos', 'Видео', base + '/videos'], ['about', 'О канале', base + '/about']];
    const links = ch.links || [];
    const q = (params.get('q') || '').trim();
    const sort = ['popular', 'old'].includes(params.get('sort')) ? params.get('sort') : 'new';

    const emptyOwn = () => emptyHtml('🎬', 'Пока нет видео', own ? 'Загрузите первое видео на свой канал.' : 'Канал ещё не загрузил ни одного видео.', own ? { label: 'Загрузить видео', id: 'emptyUpload' } : undefined);

    let content = '';
    if (activeTab === 'home') {
      if (!list.length) content = emptyOwn();
      else {
        const fresh = sortVideos(list, 'new');
        const pop = sortVideos(list, 'popular');
        const featured = fresh[0];
        content = `<div class="chan-cards">
          <section class="ch-sec"><h2 class="ch-sec-title">Для вас</h2>${carousel(fresh.slice(0, 16).map(videoCard).join(''))}</section>
          ${list.length > 3 ? `<section class="ch-sec"><h2 class="ch-sec-title">Популярные видео</h2>${carousel(pop.slice(0, 16).map(videoCard).join(''))}</section>` : ''}
          <section class="ch-sec"><div class="ch-sec-head"><h2 class="ch-sec-title">Видео</h2><a class="ch-sec-more" href="${base}/videos">Смотреть все</a></div>${carousel(fresh.map(videoCard).join(''))}</section>
        </div>`;
        void featured;
      }
    } else if (activeTab === 'videos') {
      const sorted = sortVideos(list, sort);
      content = list.length
        ? `<div class="chips-wrap ch-sort"><div class="chips">${[['new', 'Новые'], ['popular', 'Популярные'], ['old', 'Старые']].map(([k, l]) => `<a class="chip ${k === sort ? 'active' : ''}" href="${base}/videos${k === 'new' ? '' : '?sort=' + k}">${l}</a>`).join('')}</div></div>
           <div class="video-grid chan-cards">${sorted.map(videoCard).join('')}</div>`
        : emptyOwn();
    } else if (activeTab === 'search') {
      const found = q ? list.filter((v) => (v.title + ' ' + (v.desc || '')).toLowerCase().includes(q.toLowerCase())) : [];
      content = !q ? '<p class="muted-note">Введите запрос, чтобы найти видео на этом канале.</p>'
        : found.length ? `<div class="video-grid chan-cards">${found.map(videoCard).join('')}</div>`
        : emptyHtml('🔍', 'Ничего не найдено', 'Попробуйте изменить запрос.');
    } else {
      content = `<div class="channel-about">
        <div class="about-block"><h3>Описание</h3><p>${ch.description ? esc(ch.description) : 'Автор пока ничего не рассказал о канале.'}</p></div>
        ${links.length ? `<div class="about-block"><h3>Ссылки</h3><div class="about-links">${links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer nofollow"><b>${esc(l.title)}</b><span>${esc(linkHost(l.url))}</span></a>`).join('')}</div></div>` : ''}
        <div class="about-block"><h3>Статистика</h3><div class="about-stats">
          <div><b class="ch-subs-count-num">${esc(ch.subs)}</b>подписчиков</div><div><b>${fmt(ch.videoCount)}</b>видео</div><div><b>${fmt(ch.viewsNum)}</b>просмотров</div></div></div>
        <div class="about-block"><h3>Подробности</h3><p>Присоединился: ${esc(ch.joined)}</p></div>
      </div>`;
    }

    const bannerStyle = ch.bannerUrl ? '' : `background:linear-gradient(120deg, ${ch.banner[0]}, ${ch.banner[1]})`;
    const descLine = ch.description ? ch.description.split('\n')[0] : '';
    return `
      <div class="channel-banner ${ch.bannerUrl ? 'has-img' : ''}" style="${bannerStyle}">
        ${ch.bannerUrl ? `<img src="${esc(ch.bannerUrl)}" alt="">` : `<span class="banner-mark">${esc(ch.avatar)}</span>`}
      </div>
      <div class="channel-head">
        ${avatarHtml(ch)}
        <div class="channel-info">
          <h1>${esc(ch.name)}</h1>
          <div class="channel-stats">
            <b>${esc(ch.handle)}</b><span class="dot">●</span>
            <span><span class="ch-subs-count">${esc(ch.subs)} подписчиков</span></span><span class="dot">●</span>
            <span>${fmt(ch.videoCount)} ${plural(ch.videoCount, 'видео', 'видео', 'видео')}</span>
          </div>
          <button class="channel-descline" id="chAbout"><span class="cd-text">${descLine ? esc(descLine) : 'Подробнее о канале'}</span> <b>…ещё</b></button>
          ${links.length ? `<div class="channel-linkline"><a href="${esc(links[0].url)}" target="_blank" rel="noopener noreferrer nofollow">${esc(linkHost(links[0].url))}</a>${links.length > 1 ? ` и <button class="link-more" id="chLinks">ещё ${links.length - 1} ${plural(links.length - 1, 'ссылка', 'ссылки', 'ссылок')}</button>` : ''}</div>` : ''}
          <div class="channel-actions">
            ${own
              ? `<button class="btn" id="chEdit">Настроить вид канала</button><a class="btn" href="/studio#/content">Управление видео</a>`
              : `<button class="subscribe-btn ${isSub ? 'subscribed' : ''}" data-sub="${esc(chId)}">${isSub ? 'Вы подписаны' : 'Подписаться'}</button>`}
          </div>
        </div>
      </div>
      <div class="channel-tabs">
        ${tabs.map(([id, label, href]) => `<a class="channel-tab ${id === activeTab ? 'active' : ''}" href="${href}">${label}</a>`).join('')}
        <form class="chan-search ${activeTab === 'search' ? 'open' : ''}" id="chSearch"><button type="button" class="icon-btn" id="chSearchBtn" aria-label="Поиск по каналу"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg></button><input id="chSearchInp" type="text" placeholder="Поиск по каналу" value="${esc(q)}" autocomplete="off"></form>
      </div>
      ${content}`;
  }

  function openChannelAbout(chId) {
    const ch = CHANNELS[chId];
    if (!ch) return;
    const links = ch.links || [];
    openModal(`
      <div class="modal-head"><div><h2>${esc(ch.name)}</h2></div><button class="icon-btn" data-close aria-label="Закрыть"><svg class="ic"><use href="#i-close"/></svg></button></div>
      <div class="about-modal">
        ${ch.description ? `<p class="am-desc">${esc(ch.description)}</p>` : ''}
        ${links.length ? `<h3>Ссылки</h3>${links.map((l) => `<a class="am-row" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer nofollow"><svg class="ic"><use href="#i-link"/></svg><div><b>${esc(l.title)}</b><span>${esc(linkHost(l.url))}</span></div></a>`).join('')}` : ''}
        <h3>Дополнительная информация</h3>
        <div class="am-row"><svg class="ic"><use href="#i-info"/></svg><div>Дата регистрации: ${esc(ch.joined)}</div></div>
        <div class="am-row"><svg class="ic"><use href="#i-user"/></svg><div>${esc(ch.subs)} подписчиков</div></div>
        <div class="am-row"><svg class="ic"><use href="#i-play"/></svg><div>${fmt(ch.videoCount)} видео</div></div>
        <div class="am-row"><svg class="ic"><use href="#i-eye"/></svg><div>${fmt(ch.viewsNum)} просмотров</div></div>
        <button class="btn" id="amShare"><svg class="ic"><use href="#i-share"/></svg>Поделиться каналом</button>
      </div>`);
    $('#amShare').addEventListener('click', async () => {
      const url = location.origin + '/#/channel/' + ch.id;
      try { await navigator.clipboard.writeText(url); toast('Ссылка на канал скопирована'); } catch (e) { toast(url); }
    });
  }

  function bindCarousels() {
    $$('.car').forEach((car) => {
      const tr = $('.car-track', car), prev = $('.prev', car), next = $('.next', car);
      const upd = () => { prev.hidden = tr.scrollLeft < 8; next.hidden = tr.scrollLeft + tr.clientWidth >= tr.scrollWidth - 8; };
      prev.addEventListener('click', () => tr.scrollBy({ left: -tr.clientWidth * 0.9, behavior: 'smooth' }));
      next.addEventListener('click', () => tr.scrollBy({ left: tr.clientWidth * 0.9, behavior: 'smooth' }));
      tr.addEventListener('scroll', upd, { passive: true });
      upd();
      setTimeout(upd, 200);
    });
  }


  /* ---------------- просмотр ---------------- */
  let player = null;
  let sideFilter = 'all';

  function parseDuration(d) {
    if (!d || d === 'LIVE') return 0;
    const parts = d.split(':').map(Number);
    return parts.reduce((acc, p) => acc * 60 + p, 0);
  }
  function timeText(sec) {
    sec = Math.max(0, Math.floor(sec));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(s).padStart(2, '0');
  }

  function watchSideHtml(v) {
    let list = VIDEOS.filter((x) => x.id !== v.id && !state.hidden.has(x.id));
    if (sideFilter === 'same') list = list.filter((x) => x.channel === v.channel);
    if (sideFilter === 'other') list = list.filter((x) => x.channel !== v.channel);
    return `
      <div class="side-filter-row" id="sideFilters">
        <button class="chip ${sideFilter === 'all' ? 'active' : ''}" data-side="all">Все</button>
        <button class="chip ${sideFilter === 'same' ? 'active' : ''}" data-side="same">От этого канала</button>
        <button class="chip ${sideFilter === 'other' ? 'active' : ''}" data-side="other">Похожие</button>
      </div>
      <div id="sideList">${list.map(compactCard).join('')}</div>`;
  }

  const commentsFor = (v) => commentsCache[v.id] || [];

  function commentsHtml(v) {
    const mine = me ? (me.channel || { avatar: initialsOf(me.user.name), color: '#ff6b00' }) : { avatar: '?', color: '#777' };
    return `
      <div class="comments">
        <div class="comments-head"><h2 id="commentsTitle">Комментарии</h2></div>
        <div class="comment-form">
          ${avatarHtml(mine, 40)}
          <div>
            <textarea class="comment-input" id="commentInput" placeholder="${me ? 'Введите комментарий...' : 'Войдите, чтобы оставить комментарий'}" rows="1" maxlength="1000"></textarea>
            <div class="comment-form-actions">
              <button class="btn btn-ghost" id="commentCancel">Отмена</button>
              <button class="btn btn-primary" id="commentSend">Оставить комментарий</button>
            </div>
          </div>
        </div>
        <div id="commentList"><p class="muted-note">Загружаем комментарии…</p></div>
      </div>`;
  }

  function commentHtml(c) {
    const author = c.channel
      ? `<a class="comment-author" href="#/channel/${esc(c.channel)}">${esc(c.author)}</a>`
      : `<span class="comment-author">${esc(c.author)}</span>`;
    return `
      <div class="comment">
        ${avatarHtml({ avatar: c.avatar, color: c.color }, 40)}
        <div>
          <div class="comment-head">${author}<span class="comment-time">${esc(c.ago)}</span></div>
          <p class="comment-text">${esc(c.text)}</p>
          ${c.canDelete ? `<div class="comment-actions"><button class="comment-reply" data-cdel="${esc(c.id)}">Удалить</button></div>` : ''}
        </div>
      </div>`;
  }

  function pageWatch(id) {
    const v = byId(id);
    if (!v) return emptyHtml('🍊', 'Видео не найдено', 'Возможно, оно было удалено или ссылка неверная.');
    const ch = chOf(v);
    const liked = state.likes.has(v.id);
    const disliked = state.dislikes.has(v.id);
    const likeCount = v.likes || 0;
    const isSub = state.subs.has(v.channel);
    const own = !!(me && me.channel && me.channel.id === v.channel);
    const saved = state.later.has(v.id);

    return `
      <div class="watch">
        <div class="watch-main">
          <div class="player" id="player" data-id="${v.id}">
            <div class="player-art" style="background:linear-gradient(135deg, ${v.g1}, ${v.g2})">
              <video class="player-video" id="realVideo" src="${esc(v.media)}" ${v.thumb ? `poster="${esc(v.thumb)}"` : ''} preload="metadata" playsinline></video>
            </div>
            <span class="player-watermark">OrchardTube</span>
            <div class="player-center">
              <button class="big-play" id="bigPlay" aria-label="Смотреть"><svg class="ic"><use href="#i-play"/></svg></button>
            </div>
            <div class="player-pip-note"><svg class="ic"><use href="#i-pip"/></svg><div>Видео вынесено в отдельное окно</div></div>
            <div class="player-stats" id="pStats" hidden></div>
            <div class="player-controls">
              <div class="pc-bar" id="pcBar">
                <div class="pc-track"><i id="pcFill"></i><b id="pcKnob"></b></div>
              </div>
              <div class="pc-row">
                <div class="pc-pill"><button class="pc-btn" id="pcPlay" data-tip="Смотреть" data-key="K" aria-label="Смотреть"><svg class="ic"><use href="#i-play"/></svg></button></div>
                <div class="pc-pill pc-vol"><button class="pc-btn" id="pcMute" data-tip="Отключение звука" data-key="M" aria-label="Звук"><svg class="ic"><use href="#i-volume"/></svg></button><input class="pc-vol-range" id="pcVol" type="range" min="0" max="1" step="0.02" value="1" aria-label="Громкость"></div>
                <div class="pc-pill pc-timepill"><span class="pc-time" id="pcTime">0:00 / ${esc(v.duration)}</span></div>
                <button class="pc-pill pc-about" id="pcAbout" type="button">В этом видео <svg class="ic"><use href="#i-chevron-right"/></svg></button>
                <span class="pc-spacer"></span>
                <div class="pc-pill">
                  <button class="pc-btn" id="pcSpeed" data-tip="Скорость" aria-label="Скорость"><svg class="ic"><use href="#i-settings"/></svg></button>
                  <button class="pc-btn" id="pcPip" data-tip="Мини-проигрыватель" data-key="I" aria-label="Мини-проигрыватель"><svg class="ic"><use href="#i-pip"/></svg></button>
                  <button class="pc-btn" id="pcFull" data-tip="Во весь экран" data-key="F" aria-label="Полный экран"><svg class="ic"><use href="#i-fullscreen"/></svg></button>
                </div>
              </div>
            </div>
          </div>

          <h1 class="watch-title">${esc(v.title)}</h1>

          <div class="watch-actions-row">
            <div class="watch-channel">
              <a href="#/channel/${v.channel}">${avatarHtml(ch, 40)}</a>
              <div>
                <a class="wc-name" href="#/channel/${v.channel}">${esc(ch.name)}</a>
                <div class="wc-subs">${esc(ch.subs)} подписчиков</div>
              </div>
              ${own ? '' : `<button class="subscribe-btn ${isSub ? 'subscribed' : ''}" data-sub="${esc(v.channel)}">
                ${isSub ? 'Вы подписаны' : 'Подписаться'}
              </button>`}
            </div>

            <div class="action-group">
              <button class="action-btn ${liked ? 'active' : ''}" id="likeBtn">
                <svg class="ic"><use href="#i-thumb-up"/></svg><span id="likeCount">${fmt(likeCount)}</span>
              </button>
              <div class="action-sep"></div>
              <button class="action-btn ${disliked ? 'active' : ''}" id="dislikeBtn" aria-label="Не понравилось">
                <svg class="ic"><use href="#i-thumb-down"/></svg>
              </button>
            </div>

            <div class="action-group">
              <button class="action-btn" id="shareBtn"><svg class="ic"><use href="#i-share"/></svg><span>Поделиться</span></button>
            </div>

            <div class="action-group">
              <button class="action-btn ${saved ? 'active' : ''}" id="laterBtn" data-watch-later="${v.id}">
                <svg class="ic"><use href="#i-save"/></svg><span>${saved ? 'Сохранено' : 'Сохранить'}</span>
              </button>
            </div>

            <div class="action-group">
              <button class="action-btn" id="watchMore" aria-label="Ещё"><svg class="ic"><use href="#i-more"/></svg></button>
            </div>
          </div>

          <div class="watch-desc collapsed" id="watchDesc">
            <div class="desc-meta">
              <span>${esc(v.viewsText)}</span>
              <span>${v.ago}</span>
              <span>#${esc(v.category.toLowerCase().replace(/\s+/g, ''))}</span>
            </div>
            <div class="desc-text">${esc(v.desc)}</div>
            <span class="desc-toggle">...ещё</span>
          </div>

          ${commentsHtml(v)}
        </div>

        <aside class="watch-side" id="watchSide">
          ${watchSideHtml(v)}
        </aside>
      </div>`;
  }


  /* ---------------- инициализация плеера ---------------- */
  let activeVideo = null;

  function stopPlayer() {
    window.__otPlayerKey = null;
    closeCtx();
    if (player && player.timer) clearInterval(player.timer);
    player = null;
    // убранный из DOM <video> может продолжать играть звук — останавливаем явно
    if (activeVideo) { try { activeVideo.pause(); activeVideo.removeAttribute('src'); activeVideo.load(); } catch (e) { /* noop */ } }
    activeVideo = null;
  }

  function recordHistory(v) {
    state.history = [v.id, ...state.history.filter((x) => x !== v.id)].slice(0, 40);
    saveState();
  }

  // Плеер для загруженных видео: настоящий <video>, те же кастомные контролы
  function initRealPlayer(v, el, vid) {
    activeVideo = vid;
    player = { id: v.id, real: true, timer: null, get playing() { return !vid.paused; } };
    const fill = $('#pcFill');
    const knob = $('#pcKnob');
    const timeEl = $('#pcTime');
    let counted = false;

    const total = () => (isFinite(vid.duration) ? vid.duration : 0);
    function paint() {
      const d = total();
      const p = d ? (vid.currentTime / d) * 100 : 0;
      fill.style.width = p + '%';
      knob.style.left = p + '%';
      timeEl.textContent = timeText(Math.floor(vid.currentTime)) + ' / ' + (d ? timeText(Math.round(d)) : v.duration);
    }
    paint();

    const setPlaying = (on) => { if (on) { const r = vid.play(); if (r && r.catch) r.catch(() => toast('Не удалось воспроизвести видео')); } else vid.pause(); };
    window.__otSetPlaying = setPlaying;

    vid.addEventListener('play', () => {
      el.classList.add('is-playing');
      $('#pcPlay use').setAttribute('href', '#i-pause');
      if (!counted) {
        counted = true;
        jsonPost(`/api/videos/${encodeURIComponent(v.id)}/view`, {}, 'POST', 8000).then((r) => {
          if (r && r.data && r.data.views != null) {
            v.views = r.data.views;
            v.viewsText = r.data.viewsText;
            const first = $('.desc-meta span');
            if (first) first.textContent = v.viewsText;
          }
        }).catch(() => {});
      }
    });
    vid.addEventListener('pause', () => {
      el.classList.remove('is-playing');
      $('#pcPlay use').setAttribute('href', '#i-play');
    });
    vid.addEventListener('ended', () => { el.classList.remove('is-playing'); $('#pcPlay use').setAttribute('href', '#i-play'); });
    vid.addEventListener('timeupdate', paint);
    vid.addEventListener('loadedmetadata', paint);
    vid.addEventListener('error', () => toast('Видео недоступно'));

    $('#bigPlay').addEventListener('click', () => setPlaying(true));
    $('#pcPlay').addEventListener('click', () => setPlaying(vid.paused));
    vid.addEventListener('click', () => setPlaying(vid.paused));

    $('#pcBar').addEventListener('click', (e) => {
      const d = total();
      if (!d) return;
      const r = e.currentTarget.getBoundingClientRect();
      vid.currentTime = d * Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      paint();
    });

    $('#pcMute').addEventListener('click', () => { vid.muted = !vid.muted; if (!vid.muted && vid.volume === 0) vid.volume = 0.5; });

    $('#pcFull').addEventListener('click', () => {
      try {
        if (document.fullscreenElement) document.exitFullscreen();
        else el.requestFullscreen && el.requestFullscreen();
      } catch (err) { toast('Полноэкранный режим недоступен'); }
    });

    /* --- громкость, скорость, мини-проигрыватель, повтор --- */
    const muteBtn = $('#pcMute'), volEl = $('#pcVol');
    const syncVol = () => {
      const off = vid.muted || vid.volume === 0;
      muteBtn.querySelector('use').setAttribute('href', off ? '#i-volume-off' : '#i-volume');
      muteBtn.dataset.tip = off ? 'Включение звука' : 'Отключение звука';
      volEl.value = off ? 0 : vid.volume;
      volEl.style.setProperty('--v', (off ? 0 : vid.volume) * 100 + '%');
    };
    $('#pcMute').addEventListener('click', syncVol);
    vid.addEventListener('volumechange', syncVol);
    volEl.addEventListener('input', () => { vid.muted = false; vid.volume = Number(volEl.value); syncVol(); });
    syncVol();
    const syncPlayTip = () => { const b = $('#pcPlay'); if (b) b.dataset.tip = vid.paused ? 'Смотреть' : 'Пауза'; };
    vid.addEventListener('play', syncPlayTip); vid.addEventListener('pause', syncPlayTip);

    const goPip = async () => {
      try {
        if (document.pictureInPictureElement) await document.exitPictureInPicture();
        else if (document.pictureInPictureEnabled && !vid.disablePictureInPicture) await vid.requestPictureInPicture();
        else toast('Мини-проигрыватель не поддерживается этим браузером');
      } catch (err) { toast('Не удалось открыть мини-проигрыватель'); }
    };
    vid.addEventListener('enterpictureinpicture', () => el.classList.add('is-pip'));
    vid.addEventListener('leavepictureinpicture', () => el.classList.remove('is-pip'));
    $('#pcPip').addEventListener('click', goPip);
    $('.player-pip-note', el).addEventListener('click', goPip);

    $('#pcSpeed').addEventListener('click', (e) => {
      e.stopPropagation();
      openPopover(e.currentTarget, `<div class="pop-head-t" style="padding:8px 14px;font-weight:600;font-size:13px;color:var(--fg-dim)">Скорость воспроизведения</div>${[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => `<button class="pop-item" data-rate="${r}">${vid.playbackRate === r ? '<svg class="ic"><use href="#i-check"/></svg>' : '<span style="width:24px"></span>'}${r === 1 ? 'Обычная' : r + '×'}</button>`).join('')}`);
      $$('#popover [data-rate]').forEach((b) => b.addEventListener('click', () => { vid.playbackRate = Number(b.dataset.rate); closePopover(); toast('Скорость: ' + (vid.playbackRate === 1 ? 'обычная' : vid.playbackRate + '×')); }));
    });

    $('#pcAbout').addEventListener('click', () => {
      const d = $('#watchDesc');
      if (!d) return;
      d.classList.remove('collapsed');
      d.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    // старт с нужной секунды: #/watch/ID?t=42
    const t0 = Number(parseRoute().params.get('t'));
    if (t0 > 0) vid.addEventListener('loadedmetadata', () => { try { vid.currentTime = t0; } catch (e) { /* noop */ } }, { once: true });

    /* --- меню по правой кнопке --- */
    const watchUrl = (withTime) => location.origin + '/#/watch/' + v.id + (withTime ? '?t=' + Math.floor(vid.currentTime) : '');
    const copyText = async (text, okMsg) => {
      try { await navigator.clipboard.writeText(text); toast(okMsg); }
      catch (e) {
        const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); toast(okMsg); } catch (e2) { toast(text); }
        ta.remove();
      }
    };
    const debugInfo = () => {
      const q = vid.getVideoPlaybackQuality ? vid.getVideoPlaybackQuality() : {};
      const buf = vid.buffered.length ? vid.buffered.end(vid.buffered.length - 1) : 0;
      return {
        videoId: v.id, url: watchUrl(false), media: v.media,
        currentTime: +vid.currentTime.toFixed(2), duration: total(), paused: vid.paused, ended: vid.ended, loop: vid.loop,
        readyState: vid.readyState, networkState: vid.networkState, error: vid.error ? { code: vid.error.code, message: vid.error.message } : null,
        resolution: vid.videoWidth + 'x' + vid.videoHeight, volume: +vid.volume.toFixed(2), muted: vid.muted, playbackRate: vid.playbackRate,
        bufferedUntil: +buf.toFixed(2), droppedFrames: q.droppedVideoFrames || 0, totalFrames: q.totalVideoFrames || 0,
        viewport: window.innerWidth + 'x' + window.innerHeight, userAgent: navigator.userAgent, time: new Date().toISOString()
      };
    };
    let statsTimer = null;
    const statsBox = $('#pStats');
    const renderStats = () => {
      const q = vid.getVideoPlaybackQuality ? vid.getVideoPlaybackQuality() : {};
      const buf = vid.buffered.length ? Math.max(0, vid.buffered.end(vid.buffered.length - 1) - vid.currentTime) : 0;
      const r = player && player.id === v.id ? el.getBoundingClientRect() : { width: 0, height: 0 };
      const rows = [
        ['ID видео', v.id], ['Окно / экран', Math.round(r.width) + 'x' + Math.round(r.height) + ' / ' + screen.width + 'x' + screen.height],
        ['Разрешение', (vid.videoWidth || 0) + 'x' + (vid.videoHeight || 0)], ['Громкость', Math.round((vid.muted ? 0 : vid.volume) * 100) + '%'],
        ['Скорость', vid.playbackRate + '×'], ['Пропущено кадров', (q.droppedVideoFrames || 0) + ' из ' + (q.totalVideoFrames || 0)],
        ['Буфер', buf.toFixed(2) + ' с'], ['Состояние', ['нет данных', 'метаданные', 'текущий кадр', 'есть данные', 'можно играть'][vid.readyState] + (vid.paused ? ', пауза' : ', идёт')],
        ['Сеть', ['пусто', 'ожидание', 'загрузка', 'нет источника'][vid.networkState]]
      ];
      statsBox.innerHTML = '<button class="ps-x" aria-label="Закрыть">×</button>' + rows.map(([k, val]) => `<div><span>${esc(k)}</span><b>${esc(String(val))}</b></div>`).join('');
      $('.ps-x', statsBox).onclick = () => toggleStats(false);
    };
    function toggleStats(on) {
      clearInterval(statsTimer);
      statsBox.hidden = !on;
      if (on) { renderStats(); statsTimer = setInterval(() => { if (!document.body.contains(statsBox)) clearInterval(statsTimer); else renderStats(); }, 500); }
    }

    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      closePopover();
      closeCtx();
      const m = document.createElement('div');
      m.className = 'ctx-menu';
      m.id = 'ctxMenu';
      const items = [
        ['loop', 'loop', 'Повтор', vid.loop], ['pip', 'pip', 'Мини-проигрыватель'], ['url', 'link', 'Копировать URL видео'],
        ['urlt', 'link', 'Копировать URL видео с привязкой ко времени'], ['html', 'code', 'Копировать HTML-код'],
        ['debug', 'bug', 'Скопировать данные для отладки'], ['fix', 'help', 'Решить проблему с воспроизведением'], ['stats', 'info', 'Статистика для сисадминов']
      ];
      m.innerHTML = items.map(([k, ic, label, on]) => `<button data-k="${k}"><svg class="ic"><use href="#i-${ic}"/></svg><span>${label}</span>${on ? '<svg class="ic ctx-ok"><use href="#i-check"/></svg>' : ''}</button>`).join('');
      document.body.appendChild(m);
      const w = m.offsetWidth, h = m.offsetHeight;
      m.style.left = Math.max(8, Math.min(e.clientX, window.innerWidth - w - 8)) + 'px';
      m.style.top = Math.max(8, Math.min(e.clientY, window.innerHeight - h - 8)) + 'px';
      m.addEventListener('contextmenu', (ev) => ev.preventDefault());
      m.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-k]');
        if (!b) return;
        closeCtx();
        const k = b.dataset.k;
        if (k === 'loop') { vid.loop = !vid.loop; toast(vid.loop ? 'Повтор включён' : 'Повтор выключен'); }
        else if (k === 'pip') goPip();
        else if (k === 'url') copyText(watchUrl(false), 'Ссылка на видео скопирована');
        else if (k === 'urlt') copyText(watchUrl(true), 'Ссылка с привязкой ко времени скопирована');
        else if (k === 'html') copyText(`<iframe width="560" height="315" src="${location.origin}/embed/${v.id}" title="${esc(v.title)}" frameborder="0" allow="fullscreen; picture-in-picture" allowfullscreen></iframe>`, 'HTML-код скопирован');
        else if (k === 'debug') copyText(JSON.stringify(debugInfo(), null, 2), 'Данные для отладки скопированы');
        else if (k === 'stats') toggleStats(statsBox.hidden);
        else if (k === 'fix') {
          openModal(`
            <div class="modal-head"><div><h2>Проблемы с воспроизведением</h2><p>Попробуйте по порядку — обычно помогает первое или второе.</p></div>
              <button class="icon-btn" data-close aria-label="Закрыть"><svg class="ic"><use href="#i-close"/></svg></button></div>
            <ol class="fix-list"><li>Нажмите «Перезагрузить видео» ниже.</li><li>Обновите страницу (Ctrl+F5).</li><li>Проверьте интернет-соединение: бесплатный сервер после простоя «просыпается» до минуты.</li><li>Отключите расширения браузера, которые блокируют медиа.</li><li>Если видео в формате MKV/AVI/MOV, браузер может его не поддерживать — лучше загружать MP4 (H.264) или WebM.</li></ol>
            <div class="modal-actions"><button class="btn" data-close>Закрыть</button><button class="btn btn-primary" id="fixReload">Перезагрузить видео</button></div>`);
          $('#fixReload').addEventListener('click', () => {
            const t = vid.currentTime, was = !vid.paused;
            closeModal();
            vid.load();
            vid.addEventListener('loadedmetadata', () => { try { vid.currentTime = t; } catch (e) { /* noop */ } if (was) vid.play().catch(() => {}); }, { once: true });
            toast('Видео перезагружается…');
          });
        }
      });
    });

    // горячие клавиши плеера (M — звук, F — экран, I — мини-плеер, ←/→ — перемотка)
    window.__otPlayerKey = (e) => {
      const k = e.key.toLowerCase();
      if (k === 'm') { vid.muted = !vid.muted; return true; }
      if (k === 'f') { $('#pcFull').click(); return true; }
      if (k === 'i') { goPip(); return true; }
      if (e.key === 'ArrowLeft') { vid.currentTime = Math.max(0, vid.currentTime - 5); return true; }
      if (e.key === 'ArrowRight') { vid.currentTime = Math.min(total() || 1e9, vid.currentTime + 5); return true; }
      return false;
    };

    // Автозапуск при открытии. Браузеры запрещают звук без нажатия на странице:
    // тогда включаем без звука (как на YouTube) и подсказываем, как включить звук.
    const tryAutoplay = () => {
      if (vid.ended || !document.body.contains(vid)) return;
      const r = vid.play();
      if (!r || !r.catch) return;
      r.catch(() => {
        if (!document.body.contains(vid)) return;
        vid.muted = true;
        const r2 = vid.play();
        if (r2 && r2.then) r2.then(() => toast('Видео запущено без звука — нажмите на динамик, чтобы включить звук')).catch(() => { /* ждём нажатия на ▶ */ });
      });
    };
    tryAutoplay();

    recordHistory(v);
  }

  function initPlayer(v) {
    stopPlayer();
    const el = $('#player');
    const vid = $('#realVideo');
    if (el && vid) initRealPlayer(v, el, vid);
  }

  function togglePlay() {
    if (window.__otSetPlaying && player) window.__otSetPlaying(!player.playing);
  }

  /* ---------------- привязки ---------------- */
  function bindCards(root) {
    $$('[data-more]', root).forEach((b) => {
      b.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openVideoMenu(b, b.dataset.more);
      });
    });
    $$('.thumb-act', root).forEach((b) => {
      b.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (b.dataset.act === 'delete') deleteVideo(b.dataset.id); else toggleLater(b.dataset.id);
      });
    });
  }

  /* ---------------- автодополнение поиска ---------------- */
  function bindSearchAutocomplete() {
    const input = $('#searchInput');
    if (!input) return;
    let acTimeout = null;
    let acOpen = false;

    function showSuggestions(q) {
      if (!q || q.length < 2) { closeAC(); return; }
      const lower = q.toLowerCase();
      const matches = new Set();
      VIDEOS.forEach((v) => {
        if (v.title.toLowerCase().includes(lower)) matches.add(v.title);
        const ch = chOf(v);
        if (ch && ch.name.toLowerCase().includes(lower)) matches.add(ch.name);
        if (v.category.toLowerCase().includes(lower)) matches.add(v.category);
      });
      const arr = [...matches].slice(0, 8);
      if (!arr.length) { closeAC(); return; }
      const box = $('#searchAC');
      if (!box) return;
      box.innerHTML = arr.map((s) => `<div class="ac-item" data-ac="${esc(s)}">${esc(s)}</div>`).join('');
      box.hidden = false;
      acOpen = true;
      $$('.ac-item', box).forEach((item) => {
        item.addEventListener('click', () => {
          input.value = item.dataset.ac;
          location.hash = '#/search?q=' + encodeURIComponent(input.value);
          closeAC();
        });
      });
    }

    function closeAC() {
      const box = $('#searchAC');
      if (box) box.hidden = true;
      acOpen = false;
    }

    input.addEventListener('input', () => {
      clearTimeout(acTimeout);
      acTimeout = setTimeout(() => showSuggestions(input.value.trim()), 250);
    });

    input.addEventListener('focus', () => {
      if (input.value.trim().length >= 2) showSuggestions(input.value.trim());
    });

    document.addEventListener('click', (e) => {
      if (acOpen && !e.target.closest('.search') && !e.target.closest('#searchAC')) closeAC();
    });
  }

  function bindChips() {
    $$('#chips .chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        state.filter = chip.dataset.cat;
        $$('#chips .chip').forEach((c) => c.classList.toggle('active', c.dataset.cat === state.filter));
        const grid = $('#homeGrid');
        if (grid) { grid.innerHTML = gridHtml(); bindCards(grid); }
      });
    });
  }

  function bindSubscribe() {
    $$('[data-sub]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!requireLogin('Войдите через Google, чтобы подписываться на каналы.')) return;
        const id = btn.dataset.sub;
        const ch = CHANNELS[id];
        const want = !state.subs.has(id);
        const r = await jsonPost(`/api/channels/${encodeURIComponent(id)}/subscribe`, { on: want }, 'POST', 10000).catch(() => null);
        if (!r || !r.ok || !r.data) { toast((r && r.data && r.data.message) || 'Не удалось выполнить действие'); return; }
        if (want) state.subs.add(id); else state.subs.delete(id);
        ch.subs = r.data.subs;
        ch.subsNum = r.data.subsNum;
        toast(want ? `Вы подписались на ${ch.name}` : `Вы отписались от ${ch.name}`);
        renderSideChannels();
        $$(`[data-sub="${id}"]`).forEach((b) => {
          b.classList.toggle('subscribed', want);
          b.textContent = want ? 'Вы подписаны' : 'Подписаться';
        });
        $$('.wc-subs').forEach((el) => { el.textContent = `${ch.subs} подписчиков`; });
        $$('.ch-subs-count').forEach((el) => { el.textContent = `${ch.subs} подписчиков`; });
      });
    });
  }

  function bindWatch(v) {
    const likeBtn = $('#likeBtn');
    const dislikeBtn = $('#dislikeBtn');

    likeBtn.addEventListener('click', async () => {
      if (!requireLogin('Войдите через Google, чтобы ставить лайки.')) return;
      const want = !state.likes.has(v.id);
      const r = await jsonPost(`/api/videos/${encodeURIComponent(v.id)}/like`, { on: want }, 'POST', 10000).catch(() => null);
      if (!r || !r.ok || !r.data) { toast('Не удалось поставить лайк'); return; }
      if (want) { state.likes.add(v.id); state.dislikes.delete(v.id); } else state.likes.delete(v.id);
      v.likes = r.data.likes;
      saveState();
      likeBtn.classList.toggle('active', want);
      dislikeBtn.classList.remove('active');
      $('#likeCount').textContent = fmt(v.likes);
      toast(want ? 'Лайк поставлен' : 'Лайк убран');
    });

    dislikeBtn.addEventListener('click', async () => {
      const on = state.dislikes.has(v.id);
      if (!on && state.likes.has(v.id)) {
        const r = await jsonPost(`/api/videos/${encodeURIComponent(v.id)}/like`, { on: false }, 'POST', 10000).catch(() => null);
        if (r && r.ok && r.data) { state.likes.delete(v.id); v.likes = r.data.likes; $('#likeCount').textContent = fmt(v.likes); }
      }
      if (on) state.dislikes.delete(v.id); else state.dislikes.add(v.id);
      saveState();
      dislikeBtn.classList.toggle('active', !on);
      likeBtn.classList.toggle('active', state.likes.has(v.id));
    });

    $('#shareBtn').addEventListener('click', () => copyLink(v.id));
    $('#laterBtn').addEventListener('click', () => toggleLater(v.id));
    $('#watchMore').addEventListener('click', (e) => openVideoMenu(e.currentTarget, v.id));

    const desc = $('#watchDesc');
    desc.addEventListener('click', (e) => {
      if (e.target.closest('.desc-toggle')) {
        desc.classList.toggle('collapsed');
        $('.desc-toggle', desc).textContent = desc.classList.contains('collapsed') ? '...ещё' : 'Свернуть';
      }
    });

    // комментарии
    const input = $('#commentInput');
    let sending = false;
    const send = async () => {
      if (!requireLogin('Войдите через Google, чтобы писать комментарии.')) return;
      const text = input.value.trim();
      if (!text) { input.focus(); return; }
      if (sending) return;
      sending = true;
      try {
        const r = await jsonPost(`/api/videos/${encodeURIComponent(v.id)}/comments`, { text }, 'POST', 10000);
        if (!r.ok || !r.data || !r.data.comment) throw new Error((r.data && r.data.message) || 'Не удалось отправить комментарий');
        commentsCache[v.id] = [r.data.comment, ...commentsFor(v)];
        input.value = '';
        input.style.height = 'auto';
        renderComments(v);
      } catch (e) {
        toast(e.message);
      } finally { sending = false; }
    };
    $('#commentSend').addEventListener('click', send);
    $('#commentCancel').addEventListener('click', () => { input.value = ''; });
    input.addEventListener('focus', () => { if (!me) { input.blur(); openLogin('Войдите через Google, чтобы писать комментарии.'); } });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 160) + 'px';
    });
    loadComments(v);

    bindSideFilters(v);
    initPlayer(v);
  }

  function bindSideFilters(v) {
    $$('#sideFilters .chip').forEach((c) => {
      c.addEventListener('click', () => {
        sideFilter = c.dataset.side;
        const side = $('#watchSide');
        if (!side) return;
        side.innerHTML = watchSideHtml(v);
        bindSideFilters(v);
      });
    });
  }

  function renderComments(v) {
    const list = $('#commentList');
    if (!list) return;
    const all = commentsFor(v);
    list.innerHTML = all.length ? all.map(commentHtml).join('') : '<p class="muted-note">Пока нет комментариев. Будьте первым!</p>';
    const head = $('#commentsTitle');
    if (head) head.textContent = `${all.length} ${plural(all.length, 'комментарий', 'комментария', 'комментариев')}`;
    bindCommentActions(v);
  }

  async function loadComments(v) {
    try {
      const r = await apiFetch(`/api/videos/${encodeURIComponent(v.id)}/comments`, {}, 15000);
      if (!r.ok || !r.data) throw new Error('bad response');
      commentsCache[v.id] = r.data.comments;
      renderComments(v);
    } catch (e) {
      const list = $('#commentList');
      if (list) list.innerHTML = '<p class="muted-note">Не удалось загрузить комментарии.</p>';
    }
  }

  function bindCommentActions(v) {
    $$('[data-cdel]').forEach((b) => {
      b.addEventListener('click', async () => {
        if (!confirm('Удалить комментарий?')) return;
        const r = await apiFetch(`/api/comments/${encodeURIComponent(b.dataset.cdel)}`, { method: 'DELETE' }, 10000).catch(() => null);
        if (!r || !r.ok) { toast('Не удалось удалить комментарий'); return; }
        commentsCache[v.id] = commentsFor(v).filter((c) => c.id !== b.dataset.cdel);
        renderComments(v);
      });
    });
  }

  function bindPage(page, parts) {
    bindCards();
    bindChips();
    bindSubscribe();

    if (page === 'watch') {
      const v = byId(parts[1]);
      if (v) bindWatch(v);
    }

    if (page === 'channel') {
      const chId = parts[1];
      const ab = $('#chAbout'); if (ab) ab.addEventListener('click', () => openChannelAbout(chId));
      const lk = $('#chLinks'); if (lk) lk.addEventListener('click', () => openChannelAbout(chId));
      bindCarousels();
      const sf = $('#chSearch');
      if (sf) {
        const inp = $('#chSearchInp');
        $('#chSearchBtn').addEventListener('click', () => { sf.classList.add('open'); inp.focus(); });
        sf.addEventListener('submit', (e) => { e.preventDefault(); location.hash = '#/channel/' + chId + '/search?q=' + encodeURIComponent(inp.value.trim()); });
        if (sf.classList.contains('open') && !inp.value) setTimeout(() => inp.focus(), 0);
      }
      const edit = $('#chEdit');
      if (edit) edit.addEventListener('click', () => openChannelModal('edit'));
      const up = $('#chUpload');
      if (up) up.addEventListener('click', openUpload);
    }

    [['emptyLogin', () => openLogin()], ['emptyCreateChannel', () => openChannelModal('create')], ['emptyUpload', openUpload]].forEach(([id, fn]) => {
      const b = $('#' + id);
      if (b) b.addEventListener('click', fn);
    });

    const clear = $('#clearHistory');
    if (clear) clear.addEventListener('click', () => {
      state.history = [];
      saveState();
      render();
      toast('История очищена');
    });

    $$('[data-remove-history]').forEach((b) => {
      b.addEventListener('click', () => {
        state.history = state.history.filter((x) => x !== b.dataset.removeHistory);
        saveState();
        render();
      });
    });

    $$('[data-remove-later]').forEach((b) => {
      b.addEventListener('click', () => {
        state.later.delete(b.dataset.removeLater);
        saveState();
        render();
        toast('Удалено из «Смотреть позже»');
      });
    });

    const upload2 = $('#uploadBtn2');
    if (upload2) upload2.addEventListener('click', openUpload);
    $$('[data-del]').forEach((btn) => btn.addEventListener('click', () => deleteVideo(btn.dataset.del)));
  }

  /* ---------------- рендер ---------------- */
  // Любая ошибка при отрисовке страницы не должна оставлять белый экран
  function render() {
    try { renderPage(); } catch (e) {
      console.error('[render]', e);
      main.innerHTML = '<div class="empty"><div class="empty-emoji">⚠️</div><h2>Что-то пошло не так</h2><p>Страница не отобразилась. Попробуйте обновить её.</p><button class="btn btn-primary" onclick="location.reload()">Обновить страницу</button> <a class="btn" href="#/">На главную</a></div>';
    }
  }
  function renderPage() {
    closePopover();
    closeModal();
    stopPlayer();
    document.body.classList.remove('nav-open');

    const { parts, params } = parseRoute();
    const page = parts[0] || 'home';
    let html = '';

    if (page === 'watch' && parts[1] && !byId(parts[1]) && api.online && !triedVideo[parts[1]]) {
      triedVideo[parts[1]] = true;
      main.innerHTML = '<p class="muted-note" style="padding:48px 24px;text-align:center">Загружаем видео…</p>';
      apiFetch('/api/videos/' + encodeURIComponent(parts[1]), {}, 15000).then((r) => {
        if (r && r.ok && r.data && r.data.video) {
          EXTRA[r.data.video.id] = r.data.video;
          if (r.data.channel) CHANNELS[r.data.channel.id] = r.data.channel;
        }
      }).catch(() => null).then(() => { if (location.hash.indexOf('#/watch/' + parts[1]) === 0) render(); });
      return;
    }

    switch (page) {
      case 'watch': html = pageWatch(parts[1]); break;
      case 'legal': html = pageLegal(parts[1]); break;
      case 'subs': html = pageSubs(); break;
      case 'history': html = pageHistory(); break;
      case 'liked': html = pageLiked(); break;
      case 'watch-later': html = pageLater(); break;
      case 'my-videos': html = pageMyVideos(); break;
      case 'search': html = pageSearch(params.get('q') || ''); break;
      case 'channel': html = pageChannel(parts[1], parts[2]); break;
      default: html = pageHome();
    }

    main.innerHTML = html;
    window.scrollTo(0, 0);

    if (page === 'search') {
      $('#searchInput').value = params.get('q') || '';
    }
    setActiveNav(page === 'watch' ? '' : page);
    bindPage(page, parts);
  }

  /* ---------------- верхняя панель ---------------- */
  function initTopbar() {
    $('#searchForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const q = $('#searchInput').value.trim();
      if (q) location.hash = '#/search?q=' + encodeURIComponent(q);
      else location.hash = '#/';
      $('#searchInput').blur();
    });

    $('#menuBtn').addEventListener('click', () => {
      if (window.innerWidth <= 1312) {
        document.body.classList.toggle('nav-open');
      } else {
        document.body.classList.toggle('mini');
      }
    });

    $('#scrim').addEventListener('click', () => document.body.classList.remove('nav-open'));

    $('#createBtn').addEventListener('click', () => openUpload());

    $('#loginBtn').addEventListener('click', () => openLogin());

    $('#bellBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      openPopover(e.currentTarget, `
        <div class="pop-head"><div class="ph-name">Уведомления</div></div>
        <div class="pop-sep"></div>
        <div class="pop-item" style="cursor:default;color:var(--fg-dim)">Пока нет уведомлений</div>
      `, 'right');
    });

    $('#avatarBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      if (!me) return;
      const name = me.channel ? me.channel.name : me.user.name;
      openPopover(e.currentTarget, `
        <div class="pop-head">
          <span class="avatar-btn">${esc(me.channel ? me.channel.avatar : initialsOf(me.user.name))}</span>
          <div><div class="ph-name">${esc(name)}</div><div class="ph-mail">${esc(me.user.email)}</div></div>
        </div>
        <div class="pop-sep"></div>
        ${me.channel
          ? `<a class="pop-item" href="#/channel/${esc(me.channel.id)}"><svg class="ic"><use href="#i-user"/></svg>Ваш канал</a>
             <a class="pop-item" href="/studio"><svg class="ic"><use href="#i-settings"/></svg>Студия OrchardTube</a>
             <button class="pop-item" id="popEditCh"><svg class="ic"><use href="#i-settings"/></svg>Настроить канал</button>`
          : `<button class="pop-item" id="popCreateCh"><svg class="ic"><use href="#i-plus"/></svg>Создать канал</button>`}
        ${['moderator', 'admin', 'owner'].includes(me.role) ? `<a class="pop-item" href="/admin"><svg class="ic"><use href="#i-settings"/></svg>Админ-панель</a>` : ''}
        <button class="pop-item" id="popTheme"><svg class="ic"><use href="#i-moon"/></svg>Сменить тему</button>
        <div class="pop-sep"></div>
        <button class="pop-item" id="popLogout"><svg class="ic"><use href="#i-close"/></svg>Выйти</button>
      `);
      const on = (id, fn) => { const b = $('#' + id); if (b) b.addEventListener('click', () => { closePopover(); fn(); }); };
      on('popTheme', toggleTheme);
      on('popEditCh', () => openChannelModal('edit'));
      on('popCreateCh', () => openChannelModal('create'));
      on('popLogout', logout);
    });

    $('#settingsBtn').addEventListener('click', openSettings);
    $('#helpBtn').addEventListener('click', openHelp);
    $('#themeBtn').addEventListener('click', toggleTheme);

    bindSearchAutocomplete();
  }

  /* ---------------- модалки ---------------- */
  // Достаём длительность и кадр-превью из выбранного файла (всё в браузере, без ffmpeg)
  function probeVideo(file) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const vid = document.createElement('video');
      vid.muted = true; vid.preload = 'metadata'; vid.playsInline = true;
      let done = false;
      const finish = (res) => { if (done) return; done = true; URL.revokeObjectURL(url); resolve(res); };
      const timer = setTimeout(() => finish({ duration: 0, thumb: null }), 6000);
      vid.addEventListener('error', () => { clearTimeout(timer); finish({ duration: 0, thumb: null }); });
      vid.addEventListener('loadedmetadata', () => {
        const d = isFinite(vid.duration) ? vid.duration : 0;
        vid.currentTime = d > 2 ? Math.min(1.5, d / 2) : 0;
      });
      vid.addEventListener('seeked', () => {
        const d = isFinite(vid.duration) ? vid.duration : 0;
        try {
          const c = document.createElement('canvas');
          c.width = 640; c.height = 360;
          const g = c.getContext('2d');
          g.fillStyle = '#000'; g.fillRect(0, 0, 640, 360);
          const r = Math.min(640 / vid.videoWidth, 360 / vid.videoHeight);
          const w = vid.videoWidth * r, h = vid.videoHeight * r;
          g.drawImage(vid, (640 - w) / 2, (360 - h) / 2, w, h);
          c.toBlob((blob) => { clearTimeout(timer); finish({ duration: d, thumb: blob }); }, 'image/jpeg', 0.82);
        } catch (e) { clearTimeout(timer); finish({ duration: d, thumb: null }); }
      });
      vid.src = url;
    });
  }

  function durationLabel(sec) {
    sec = Math.max(0, Math.round(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
  }

  const fileSize = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' МБ' : Math.max(1, Math.round(n / 1024)) + ' КБ');

  function openUpload() {
    if (!requireChannel()) return;
    const canUpload = true;
    const cats = CHIP_CATS.filter((c) => c !== 'Все' && c !== 'Прямые трансляции');
    openModal(`
      <div class="modal-head">
        <div><h2>Загрузить видео</h2><p>Поделитесь моментом с миром — или хотя бы с садом.</p></div>
        <button class="icon-btn" data-close aria-label="Закрыть"><svg class="ic"><use href="#i-close"/></svg></button>
      </div>
      <form id="uploadForm">
        <div class="upload-drop" id="dropZone" tabindex="0" role="button">
          <svg class="ic"><use href="#i-upload"/></svg>
          <b id="dropTitle">Перетащите видео сюда</b>
          <span style="font-size:13px" id="dropHint">или нажмите, чтобы выбрать файл${api.maxMb ? ` (до ${api.maxMb} МБ)` : ''}</span>
        </div>
        <input type="file" id="upFile" accept="video/*" hidden>
        <div class="form-row" style="margin-top:16px">
          <label class="form-label" for="upTitle">Название</label>
          <input class="form-input" id="upTitle" maxlength="120" placeholder="Например: Мой первый влог в саду" required>
        </div>
        <div class="form-row">
          <label class="form-label" for="upDesc">Описание</label>
          <textarea class="form-textarea" id="upDesc" maxlength="5000" placeholder="Расскажите, о чём видео"></textarea>
        </div>
        <div class="form-row">
          <label class="form-label" for="upCat">Категория</label>
          <select class="form-select" id="upCat">${cats.map((c) => `<option>${esc(c)}</option>`).join('')}</select>
        </div>
        <div class="upload-progress" id="upProgress" hidden><i id="upBar"></i></div>
        <div class="modal-actions">
          <button type="button" class="btn" data-close>Отмена</button>
          <button type="submit" class="btn btn-primary" id="upSubmit" ${canUpload ? '' : 'disabled'}>Опубликовать</button>
        </div>
      </form>
    `);

    const drop = $('#dropZone');
    const input = $('#upFile');
    const submit = $('#upSubmit');
    let chosen = null;   // { file, duration, thumb }
    let xhr = null;

    async function choose(file) {
      if (!file) return;
      if (!/^video\//.test(file.type) && !/\.(mp4|m4v|webm|mkv|mov|avi|ogv|3gp)$/i.test(file.name)) { toast('Выберите видеофайл'); return; }
      if (api.maxMb && file.size > api.maxMb * 1048576) { toast(`Файл больше ${api.maxMb} МБ`); return; }
      $('#dropTitle').textContent = file.name;
      $('#dropHint').textContent = `${fileSize(file.size)} · читаем метаданные…`;
      drop.classList.add('has-file');
      const meta = await probeVideo(file);
      chosen = { file, duration: meta.duration, thumb: meta.thumb };
      $('#dropHint').textContent = `${fileSize(file.size)}${meta.duration ? ' · ' + durationLabel(meta.duration) : ''}`;
      const t = $('#upTitle');
      if (!t.value) t.value = file.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ');
    }

    drop.addEventListener('click', () => { if (canUpload) input.click(); });
    drop.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && canUpload) { e.preventDefault(); input.click(); } });
    input.addEventListener('change', () => choose(input.files[0]));
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('drag'); }));
    drop.addEventListener('drop', (e) => { if (canUpload) choose(e.dataTransfer.files[0]); });

    // закрытие окна во время загрузки отменяет её
    modalEl.addEventListener('click', (e) => { if (xhr && e.target.closest('[data-close]')) xhr.abort(); }, { once: true });

    $('#uploadForm').addEventListener('submit', (e) => {
      e.preventDefault();
      if (!canUpload || xhr) return;
      if (!chosen) { toast('Сначала выберите видеофайл'); return; }

      const fd = new FormData();
      fd.append('title', $('#upTitle').value.trim());
      fd.append('desc', $('#upDesc').value);
      fd.append('category', $('#upCat').value);
      fd.append('duration', durationLabel(chosen.duration));
      if (chosen.thumb) fd.append('thumb', chosen.thumb, 'thumb.jpg');
      fd.append('video', chosen.file, chosen.file.name); // файл — последним

      xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/videos');
      const prog = $('#upProgress'), bar = $('#upBar');
      prog.hidden = false;
      submit.disabled = true;
      xhr.upload.onprogress = (ev) => {
        if (!ev.lengthComputable) return;
        const pct = Math.round((ev.loaded / ev.total) * 100);
        bar.style.width = pct + '%';
        submit.textContent = pct < 100 ? `Загрузка ${pct}%` : 'Сохраняем…';
      };
      const reset = (msg) => {
        xhr = null; prog.hidden = true; bar.style.width = '0'; submit.disabled = false; submit.textContent = 'Опубликовать';
        if (msg) toast(msg);
      };
      xhr.onerror = () => reset('Не удалось связаться с сервером');
      xhr.onabort = () => { xhr = null; };
      xhr.onload = () => {
        let data = null;
        try { data = JSON.parse(xhr.responseText); } catch (err) { /* не JSON */ }
        if (xhr.status === 201 && data && data.video) {
          VIDEOS.unshift(data.video);
          if (me && me.channel && CHANNELS[me.channel.id]) CHANNELS[me.channel.id].videoCount = (CHANNELS[me.channel.id].videoCount || 0) + 1;
          xhr = null;
          closeModal();
          toast('Видео опубликовано');
          location.hash = '#/watch/' + data.video.id;
        } else if (xhr.status === 401) {
          reset('Сессия истекла — войдите снова');
          applyMe(null); renderAuthUI(); renderSideChannels(); openLogin();
        } else if (xhr.status === 403 && data && data.error === 'no-channel') {
          reset('Сначала создайте канал');
          openChannelModal('create');
        } else {
          reset((data && data.message) || 'Не удалось загрузить видео');
        }
      };
      xhr.send(fd);
    });
  }

  function openSettings() {
    openModal(`
      <div class="modal-head">
        <div><h2>Настройки</h2><p>Внешний вид и поведение OrchardTube.</p></div>
        <button class="icon-btn" data-close aria-label="Закрыть"><svg class="ic"><use href="#i-close"/></svg></button>
      </div>
      <div class="form-row">
        <label class="form-label">Тема оформления</label>
        <select class="form-select" id="setTheme">
          <option value="dark" ${state.theme === 'dark' ? 'selected' : ''}>Тёмная (по умолчанию)</option>
          <option value="light" ${state.theme === 'light' ? 'selected' : ''}>Светлая</option>
        </select>
      </div>
      <div class="form-hint">Настройки сохраняются в этом браузере.</div>
      <div class="modal-actions">
        <button class="btn btn-primary" data-close>Готово</button>
      </div>
    `);
    const sel = $('#setTheme');
    sel.addEventListener('change', () => {
      state.theme = sel.value;
      saveState();
      applyTheme();
    });
  }

  function openHelp() {
    openModal(`
      <div class="modal-head">
        <div><h2>Горячие клавиши</h2><p>Всё быстрее, когда руки на клавиатуре.</p></div>
        <button class="icon-btn" data-close aria-label="Закрыть"><svg class="ic"><use href="#i-close"/></svg></button>
      </div>
      <div style="display:grid;gap:10px;font-size:14px">
        ${[['/', 'Перейти к поиску'], ['K / Пробел', 'Пауза или воспроизведение'], ['T', 'Переключить тему'], ['Esc', 'Закрыть окно или меню'], ['?', 'Эта справка']]
          .map(([k, d]) => `<div style="display:flex;justify-content:space-between;gap:16px;padding:9px 12px;background:var(--bg);border-radius:8px">
            <span style="color:var(--fg-dim)">${d}</span><b style="font-family:ui-monospace,monospace">${k}</b></div>`).join('')}
      </div>
      <div class="modal-actions"><button class="btn btn-primary" data-close>Понятно</button></div>
    `);
  }

  /* ---------------- вход через Google и канал ---------------- */
  let gsiPromise = null;
  function loadGsi() {
    if (window.google && window.google.accounts) return Promise.resolve();
    if (!gsiPromise) {
      gsiPromise = new Promise((resolve, reject) => {
        const sc = document.createElement('script');
        sc.src = 'https://accounts.google.com/gsi/client';
        sc.async = true;
        sc.onload = resolve;
        sc.onerror = () => { gsiPromise = null; reject(new Error('gsi')); };
        document.head.appendChild(sc);
      });
    }
    return gsiPromise;
  }

  function renderAuthUI() {
    const login = $('#loginBtn');
    const av = $('#avatarBtn');
    if (!login || !av) return;
    login.hidden = !!me;
    av.hidden = !me;
    if (me) av.textContent = me.channel ? me.channel.avatar : initialsOf(me.user.name);
  }

  function requireLogin(reason) {
    if (me) return true;
    openLogin(reason);
    return false;
  }

  function requireChannel() {
    if (!requireLogin('Войдите через Google, чтобы загружать видео и вести свой канал.')) return false;
    if (!me.channel) { openChannelModal('create'); return false; }
    return true;
  }

  const isTouchDevice = () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (window.matchMedia && matchMedia('(pointer: coarse)').matches);

  function openLogin(reason) {
    openModal(`
      <div class="modal-head">
        <div><h2>Вход в OrchardTube</h2><p>${esc(reason || 'Войдите через аккаунт Google (Gmail): так вы сможете создать свой канал, загружать видео, ставить лайки и писать комментарии.')}</p></div>
        <button class="icon-btn" data-close aria-label="Закрыть"><svg class="ic"><use href="#i-close"/></svg></button>
      </div>
      <div class="gsi-box" id="gsiBtn"></div>
      <div class="form-hint" id="gsiNote">Мы получаем только имя и адрес почты. Пароль от Google нам не передаётся.</div>
    `);
    if (!api.googleClientId) {
      $('#gsiNote').textContent = 'Вход пока не настроен: владельцу сайта нужно задать GOOGLE_CLIENT_ID на сервере.';
      return;
    }
    loadGsi().then(() => {
      const box = $('#gsiBtn');
      if (!box) return; // окно уже закрыли
      // На телефонах всплывающее окно Google часто даёт белый экран — там входим через переход на страницу Google и обратно
      const cfg = { client_id: api.googleClientId, callback: onGoogleCredential };
      if (isTouchDevice()) {
        cfg.ux_mode = 'redirect';
        cfg.login_uri = location.origin + '/api/auth/google/redirect';
        try { sessionStorage.setItem('ot.ret', location.hash || '#/'); } catch (e) { /* noop */ }
      }
      window.google.accounts.id.initialize(cfg);
      window.google.accounts.id.renderButton(box, {
        theme: state.theme === 'dark' ? 'filled_black' : 'outline', size: 'large', text: 'continue_with', shape: 'pill', locale: 'ru', width: 280
      });
    }).catch(() => {
      const n = $('#gsiNote');
      if (n) n.textContent = 'Не удалось загрузить вход Google. Проверьте соединение или отключите блокировщик рекламы.';
    });
  }

  async function onGoogleCredential(resp) {
    try {
      const r = await jsonPost('/api/auth/google', { credential: resp.credential }, 'POST', 20000);
      if (!r.ok || !r.data || !r.data.user) throw new Error((r.data && r.data.message) || 'Не удалось войти');
      applyMe(r.data);
      renderAuthUI();
      renderSideChannels();
      closeModal();
      if (!me.channel) openChannelModal('create');
      else { toast(`С возвращением, ${me.channel.name}!`); render(); }
    } catch (e) {
      toast(e.message);
    }
  }

  async function logout() {
    await jsonPost('/api/auth/logout', {}, 'POST', 8000).catch(() => {});
    applyMe(null);
    renderAuthUI();
    renderSideChannels();
    toast('Вы вышли из аккаунта');
    render();
  }

  function openChannelModal(mode) {
    if (!me) { openLogin(); return; }
    const edit = mode === 'edit' && !!me.channel;
    const ch = edit ? me.channel : { name: me.user.name || '', id: '', description: '' };
    const suggest = String(me.user.email || '').split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 30);
    openModal(`
      <div class="modal-head">
        <div><h2>${edit ? 'Настройки канала' : 'Создайте свой канал'}</h2><p>${edit ? 'Название и описание видят все зрители.' : 'Так вас увидят зрители. Адрес канала потом изменить нельзя.'}</p></div>
        <button class="icon-btn" data-close aria-label="Закрыть"><svg class="ic"><use href="#i-close"/></svg></button>
      </div>
      <form id="chForm">
        ${edit ? `
        <div class="form-row"><label class="form-label">Баннер</label>
          <div class="cs-img"><div class="cs-prev" id="csBanPrev" style="width:186px;height:30px">${ch.bannerUrl ? `<img src="${esc(ch.bannerUrl)}" alt="">` : ''}</div>
          <div class="cs-btns"><button type="button" class="btn" id="csBanUp">Загрузить</button><button type="button" class="btn" id="csBanDel" ${ch.bannerUrl ? '' : 'hidden'}>Удалить</button></div></div>
          <div class="form-hint">Рекомендуем 2048×330 пикселей, JPG, PNG или WebP до 4 МБ.</div></div>
        <div class="form-row"><label class="form-label">Фото профиля</label>
          <div class="cs-img"><div class="cs-prev" id="csAvaPrev" style="width:72px;height:72px;border-radius:50%;background:${esc(ch.color)}">${ch.avatarUrl ? `<img src="${esc(ch.avatarUrl)}" alt="">` : esc(ch.avatar)}</div>
          <div class="cs-btns"><button type="button" class="btn" id="csAvaUp">Загрузить</button><button type="button" class="btn" id="csAvaDel" ${ch.avatarUrl ? '' : 'hidden'}>Удалить</button></div></div>
          <div class="form-hint">Квадратное изображение, до 2 МБ.</div></div>
        <input type="file" id="csFile" accept="image/jpeg,image/png,image/webp" hidden>` : ''}
        <div class="form-row">
          <label class="form-label" for="chName">Название канала</label>
          <input class="form-input" id="chName" maxlength="50" required value="${esc(ch.name)}">
        </div>
        ${edit
          ? `<div class="form-row"><label class="form-label">Адрес канала</label><div class="form-hint">${esc(ch.handle)}</div></div>`
          : `<div class="form-row">
              <label class="form-label" for="chHandle">Адрес канала</label>
              <input class="form-input" id="chHandle" maxlength="30" required pattern="[A-Za-z0-9_]{3,30}" autocomplete="off" value="${esc(suggest.length >= 3 ? suggest : '')}" placeholder="my_channel">
              <div class="form-hint">Латиница, цифры и «_», от 3 до 30 символов. Ссылка: @<span id="chHandlePrev"></span></div>
            </div>`}
        <div class="form-row">
          <label class="form-label" for="chDescr">Описание</label>
          <textarea class="form-textarea" id="chDescr" maxlength="1000" placeholder="О чём ваш канал">${esc(ch.description)}</textarea>
        </div>
        ${edit ? `<div class="form-row"><label class="form-label">Ссылки (до 5)</label>${[0, 1, 2, 3, 4].map((i) => `<div class="cs-link"><input class="form-input" data-lt="${i}" maxlength="30" placeholder="Название" value="${esc((ch.links && ch.links[i] && ch.links[i].title) || '')}"><input class="form-input" data-lu="${i}" maxlength="200" placeholder="https://…" value="${esc((ch.links && ch.links[i] && ch.links[i].url) || '')}"></div>`).join('')}</div>` : ''}
        <div class="modal-actions">
          ${edit ? '<button type="button" class="btn" data-close>Отмена</button>' : ''}
          <button type="submit" class="btn btn-primary" id="chSubmit">${edit ? 'Сохранить' : 'Создать канал'}</button>
        </div>
      </form>
    `);
    const hInput = $('#chHandle');
    if (hInput) {
      const prev = () => { $('#chHandlePrev').textContent = hInput.value.toLowerCase() || '…'; };
      hInput.addEventListener('input', prev);
      prev();
    }
    if (edit) {
      let kind = '';
      const file = $('#csFile');
      const apply = (ch2) => {
        me.channel = ch2; CHANNELS[ch2.id] = ch2; renderAuthUI(); renderSideChannels();
        $('#csBanPrev').innerHTML = ch2.bannerUrl ? `<img src="${esc(ch2.bannerUrl)}?t=${Date.now()}" alt="">` : '';
        $('#csAvaPrev').innerHTML = ch2.avatarUrl ? `<img src="${esc(ch2.avatarUrl)}?t=${Date.now()}" alt="">` : esc(ch2.avatar);
        $('#csBanDel').hidden = !ch2.bannerUrl; $('#csAvaDel').hidden = !ch2.avatarUrl;
      };
      $('#csBanUp').addEventListener('click', () => { kind = 'banner'; file.click(); });
      $('#csAvaUp').addEventListener('click', () => { kind = 'avatar'; file.click(); });
      file.addEventListener('change', async () => {
        const f = file.files[0]; file.value = '';
        if (!f) return;
        if (f.size > (kind === 'banner' ? 4 : 2) * 1048576) { toast('Файл слишком большой'); return; }
        const fd = new FormData(); fd.append('image', f);
        try {
          const r = await fetch('/api/channel/image/' + kind, { method: 'POST', body: fd, credentials: 'same-origin' });
          const d = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(d.message || 'Не удалось загрузить');
          apply(d.channel); toast('Сохранено');
        } catch (err) { toast(err.message); }
      });
      const del = (k) => async () => {
        try { const r = await fetch('/api/channel/image/' + k, { method: 'DELETE', credentials: 'same-origin' }); const d = await r.json(); if (!r.ok) throw new Error(d.message); apply(d.channel); } catch (err) { toast(err.message || 'Ошибка'); }
      };
      $('#csBanDel').addEventListener('click', del('banner'));
      $('#csAvaDel').addEventListener('click', del('avatar'));
    }
    $('#chForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('#chSubmit');
      btn.disabled = true;
      try {
        const body = { name: $('#chName').value.trim(), description: $('#chDescr').value.trim() };
        if (edit) body.links = [0, 1, 2, 3, 4].map((i) => ({ title: $(`[data-lt="${i}"]`).value, url: $(`[data-lu="${i}"]`).value }));
        if (!edit) body.handle = $('#chHandle').value.trim();
        const r = await jsonPost('/api/channel', body, edit ? 'PATCH' : 'POST', 15000);
        if (!r.ok || !r.data || !r.data.channel) throw new Error((r.data && r.data.message) || 'Не удалось сохранить канал');
        me.channel = r.data.channel;
        CHANNELS[me.channel.id] = me.channel;
        renderAuthUI();
        renderSideChannels();
        closeModal();
        toast(edit ? 'Канал обновлён' : 'Канал создан — добро пожаловать!');
        if (edit) render(); else location.hash = '#/channel/' + me.channel.id;
      } catch (err) {
        toast(err.message);
        btn.disabled = false;
      }
    });
  }

  /* ---------------- старт ---------------- */
  let started = false;
  function init() {
    if (started) return;
    started = true;
    applyTheme();
    initTopbar();
    main.innerHTML = '<p class="boot-note">Загружаем OrchardTube…<br><small>Бесплатный сервер может просыпаться до минуты.</small></p>';
    loadRemote().then(() => {
      if (!api.online) {
        main.innerHTML = `<div class="empty"><div class="empty-emoji">🔌</div><h2>Сервер недоступен</h2><p>Не удалось загрузить данные. Проверьте соединение и попробуйте ещё раз.</p><button class="btn btn-primary" onclick="location.reload()">Обновить страницу</button></div>`;
        return;
      }
      renderAuthUI();
      renderSideChannels();
      // возвращение со страницы входа Google (телефоны)
      const lp = new URLSearchParams(location.search).get('login');
      if (lp) {
        let ret = '#/';
        try { ret = sessionStorage.getItem('ot.ret') || '#/'; sessionStorage.removeItem('ot.ret'); } catch (e) { /* noop */ }
        history.replaceState(null, '', '/' + (/^#\//.test(ret) ? ret : '#/'));
      }
      render();
      window.addEventListener('hashchange', render);
      if (lp === 'ok' && me) { if (!me.channel) openChannelModal('create'); else toast(`С возвращением, ${me.channel.name}!`); }
      else if (lp === 'error') toast('Не удалось войти через Google. Попробуйте ещё раз.');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
