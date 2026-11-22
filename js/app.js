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

  const CHIP_CATS = ['Все', 'Технологии', 'Музыка', 'Игры', 'Новости', 'Обучение', 'Спорт', 'Дизайн', 'Путешествия', 'Еда', 'Юмор', 'Прямые трансляции'];

  const PLAYLISTS = [
    { id: 'pl-1', title: 'Смотреть позже', ids: ['react-20', 'cosmos', 'iceland', 'algo'], emoji: '⏱️', g1: '#ffd8a8', g2: '#d9480f', note: 'Приватный плейлист' },
    { id: 'pl-2', title: 'Код и разработка', ids: ['youtube-js', 'react-20', 'algo', 'setup-2026'], emoji: '💻', g1: '#7cb8ff', g2: '#1d4ed8', note: '4 видео' },
    { id: 'pl-3', title: 'Фон для работы', ids: ['lofi-3h', 'dawn-orchard', 'cosmos'], emoji: '🎧', g1: '#a5b4fc', g2: '#3730a3', note: '3 видео' },
    { id: 'pl-4', title: 'Выходные в горах', ids: ['iceland', 'marathon', 'morning-yoga'], emoji: '🏔️', g1: '#a5d8f0', g2: '#075985', note: 'Публичный плейлист' }
  ];

  const NOTIFS = [
    { ch: 'orchardtech', emoji: '💻', title: 'Новое видео: «Как мы построили OrchardTube за выходные»', ago: '2 часа назад' },
    { ch: 'codegarden', emoji: '⚛️', title: 'Премьера через 30 минут: «Пишем свой YouTube на JavaScript»', ago: '5 часов назад' },
    { ch: 'naturevibes', emoji: '🌅', title: 'Добавлено в плейлист «Утро»: рассвет над садами', ago: '1 день назад' }
  ];

  /* ---------------- состояние ---------------- */
  const KEY = 'orchardtube.v1';

  function loadState() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }

  const saved = loadState();

  const state = {
    theme: saved.theme || 'dark',
    subs: new Set(saved.subs || ['orchardtech', 'naturevibes', 'codegarden']),
    likes: new Set(saved.likes || []),
    dislikes: new Set(saved.dislikes || []),
    later: new Set(saved.later || ['react-20', 'cosmos']),
    history: Array.isArray(saved.history) ? saved.history : ['dawn-orchard', 'youtube-js'],
    comments: saved.comments || {},
    premium: saved.premium || null,
    premiumPeriod: saved.premiumPeriod || 'm',
    filter: 'Все',
    hidden: new Set(),
    uploadToken: saved.uploadToken || ''
  };
  // Состояние серверного API: db — работает ли MongoDB, upload — можно ли грузить видео
  const api = { online: false, db: false, upload: false, tokenRequired: false, maxMb: 0 };
  const commentLiked = new Set();

  function saveState() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        theme: state.theme,
        subs: [...state.subs],
        likes: [...state.likes],
        dislikes: [...state.dislikes],
        later: [...state.later],
        history: state.history,
        comments: state.comments,
        premium: state.premium,
        premiumPeriod: state.premiumPeriod,
        uploadToken: state.uploadToken
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

  function byId(id) { return VIDEOS.find((v) => v.id === id); }

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

  // Подтягиваем данные с сервера. Любая ошибка (file://, нет сети, сервер спит) — работаем на data.js
  async function loadRemote() {
    if (!/^https?:$/.test(location.protocol)) return;
    try {
      const h = await apiFetch('/api/health', {}, 4000);
      if (!h.ok || !h.data) return;
      api.online = true;
      api.upload = !!h.data.upload;
      api.tokenRequired = !!h.data.uploadTokenRequired;
      api.maxMb = h.data.maxUploadMb || 0;
      if (h.data.db !== 'mongodb') return; // демо-режим: данные те же, что в data.js
      const b = await apiFetch('/api/bootstrap', {}, 8000);
      if (!b.ok || !b.data || b.data.source !== 'mongodb') return;
      api.db = true;
      // data.js объявляет const-массивы — подменяем содержимое на месте
      VIDEOS.splice(0, VIDEOS.length, ...b.data.VIDEOS);
      SHORTS.splice(0, SHORTS.length, ...b.data.SHORTS);
      COMMENTS.splice(0, COMMENTS.length, ...b.data.COMMENTS);
      Object.keys(CHANNELS).forEach((k) => delete CHANNELS[k]);
      Object.assign(CHANNELS, b.data.CHANNELS);
      // Мой лайк уже учтён в счётчике сервера, а интерфейс прибавляет его сам — вычитаем, чтобы не считать дважды
      VIDEOS.forEach((v) => { if (state.likes.has(v.id) && v.likes > 0) v.likes -= 1; });
    } catch (e) {
      console.warn('[api] недоступен, работаем на демо-данных:', e.message);
    }
  }

  // Отправка счётчиков (лайки/подписки/просмотры) — «выстрелил и забыл», UI от неё не зависит
  function post(url, body) {
    if (!api.db) return;
    apiFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }, 8000).catch(() => {});
  }
  function chOf(v) { return CHANNELS[v.channel]; }
  function avatarHtml(ch, size) {
    return `<span class="ch-avatar" style="background:${ch.color};${size ? `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.36)}px` : ''}">${esc(ch.avatar)}</span>`;
  }
  function thumbArt(v) {
    if (v.thumb) {
      return `<div class="thumb-art has-img" style="background:linear-gradient(135deg, ${v.g1}, ${v.g2})">
      <img class="thumb-img" src="${esc(v.thumb)}" alt="" loading="lazy">`;
    }
    return `<div class="thumb-art" style="background:linear-gradient(135deg, ${v.g1}, ${v.g2})">
      <span class="thumb-emoji">${v.emoji}</span>
      <span class="thumb-brand">OrchardTube</span>
    </div>`;
  }
  function durBadge(v) {
    if (v.live) return `<span class="thumb-duration live">В эфире</span>`;
    return `<span class="thumb-duration">${v.duration}</span>`;
  }
  function progressBar(v) {
    if (!v.watched || !state.history.includes(v.id)) return '';
    return `<div class="thumb-progress"><i style="width:${Math.round(v.watched * 100)}%"></i></div>`;
  }

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
          <button class="thumb-act" data-act="queue" data-id="${v.id}" title="Добавить в очередь" aria-label="Добавить в очередь"><svg class="ic"><use href="#i-save"/></svg></button>
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

  function shortCard(s) {
    return `
    <a class="short-card" href="#/shorts/${s.id}">
      <div class="short-thumb">
        <div class="thumb-art" style="background:linear-gradient(160deg, ${s.g1}, ${s.g2})">
          <span class="thumb-emoji">${s.emoji}</span>
          <span class="thumb-brand">Shorts</span>
        </div>
      </div>
      <div class="short-title">${esc(s.title)}</div>
      <div class="short-meta">${s.views} просмотров</div>
    </a>`;
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

  function openVideoMenu(anchor, id) {
    const v = byId(id);
    if (!v) return;
    openPopover(anchor, `
      <button class="pop-item" data-act="queue"><svg class="ic"><use href="#i-save"/></svg>Добавить в очередь</button>
      <button class="pop-item" data-act="later"><svg class="ic"><use href="#i-clock"/></svg>${state.later.has(id) ? 'Убрать из «Смотреть позже»' : 'Смотреть позже'}</button>
      <button class="pop-item" data-act="share"><svg class="ic"><use href="#i-link"/></svg>Поделиться</button>
      <div class="pop-sep"></div>
      <button class="pop-item" data-act="hide"><svg class="ic"><use href="#i-close"/></svg>Не интересует</button>
      <button class="pop-item" data-act="report"><svg class="ic"><use href="#i-flag"/></svg>Пожаловаться</button>
    `);
    $$('#popover .pop-item').forEach((b) => b.addEventListener('click', () => {
      const act = b.dataset.act;
      closePopover();
      if (act === 'later') {
        toggleLater(id);
      } else if (act === 'share') {
        copyLink(id);
      } else if (act === 'queue') {
        toast('Видео добавлено в очередь');
      } else if (act === 'hide') {
        state.hidden.add(id);
        const card = $(`[data-card="${id}"]`);
        if (card) { card.style.opacity = '0'; setTimeout(() => card.remove(), 180); }
        toast('Больше не будем рекомендовать это видео');
      } else if (act === 'report') {
        toast('Жалоба отправлена на проверку');
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
      closePopover();
      if (!backdrop.hidden) closeModal();
      document.body.classList.remove('nav-open');
      return;
    }
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (typing) return;

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
    box.innerHTML = [...state.subs].map((id) => {
      const ch = CHANNELS[id];
      if (!ch) return '';
      return `<a class="side-item" href="#/channel/${id}">${avatarHtml(ch)}<span>${esc(ch.name)}</span></a>`;
    }).join('');
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
    let list = VIDEOS.filter((v) => !state.hidden.has(v.id));
    if (state.filter !== 'Все') list = list.filter((v) => v.category === state.filter);
    if (!list.length) return emptyHtml('🍊', 'Здесь пока пусто', 'Попробуй выбрать другую категорию — сад ещё растёт.');
    return list.map(videoCard).join('');
  }

  function shortsStrip() {
    return `<section class="shorts-strip" id="shortsStrip">
      <div class="shorts-head">
        <svg class="ic"><use href="#i-shorts"/></svg>
        <h2>Shorts</h2>
        <a class="all" href="#/shorts">Смотреть все</a>
      </div>
      <div class="shorts-row">${SHORTS.map(shortCard).join('')}</div>
    </section>`;
  }

  function emptyHtml(emoji, title, text) {
    return `<div class="empty">
      <div class="empty-emoji">${emoji}</div>
      <h2>${esc(title)}</h2>
      <p>${esc(text)}</p>
      <a class="btn btn-primary" href="#/">На главную</a>
    </div>`;
  }

  function pageHome() {
    return `
      ${chipsHtml(state.filter)}
      <div id="shortsStripWrap">${state.filter === 'Все' ? shortsStrip() : ''}</div>
      <div class="video-grid" id="homeGrid">${gridHtml()}</div>`;
  }

  function pageShorts() {
    return `
      <div class="page-head">
        <h1>Shorts</h1>
        <p>Короткие вертикальные видео — листай и заряжайся.</p>
      </div>
      <div class="shorts-page">${SHORTS.map(shortCard).join('')}</div>`;
  }

  function pageSubs() {
    const list = VIDEOS.filter((v) => state.subs.has(v.channel));
    return `
      <div class="page-head">
        <h1>Подписки</h1>
        <p>Свежие видео каналов, на которые вы подписаны.</p>
      </div>
      ${chipsHtml('Все')}
      ${list.length ? `<div class="video-grid">${list.map(videoCard).join('')}</div>` : emptyHtml('🌱', 'Пока нет подписок', 'Подпишись на каналы, и здесь появятся их новые видео.')}`;
  }

  function pageLibrary() {
    return `
      <div class="page-head"><h1>Библиотека</h1><p>Плейлисты, история и сохранённые видео.</p></div>
      <div class="playlist-grid">
        ${PLAYLISTS.map((p) => {
          const v = byId(p.ids[0]);
          return `<a class="playlist-card" href="#/playlist/${p.id}">
            <div class="playlist-thumb">
              <div class="thumb-art" style="background:linear-gradient(135deg, ${p.g1}, ${p.g2})">
                <span class="thumb-emoji">${p.emoji}</span>
                <span class="thumb-brand">Плейлист</span>
              </div>
              <span class="playlist-stack">${p.ids.length} видео</span>
              <div class="playlist-play"><span><svg class="ic"><use href="#i-play"/></svg></span></div>
            </div>
            <div class="playlist-info">
              <h3>${esc(p.title)}</h3>
              <p>${esc(p.note)} · ${v ? esc(chOf(v).name) : ''}</p>
            </div>
          </a>`;
        }).join('')}
      </div>
      <div class="section-head" style="margin-top:34px"><svg class="ic"><use href="#i-history"/></svg><h2>Недавние</h2></div>
      <div class="list-rows">
        ${state.history.slice(0, 4).map((id) => byId(id)).filter(Boolean).map((v) => rowVideo(v)).join('') || emptyHtml('🕘', 'История пуста', 'Посмотрите что-нибудь — и оно появится здесь.')}
      </div>`;
  }

  function pagePlaylist(plId) {
    const p = PLAYLISTS.find((x) => x.id === plId);
    if (!p) return emptyHtml('🍊', 'Плейлист не найден', 'Возможно, он был удалён.');
    const list = p.ids.map(byId).filter(Boolean);
    return `
      <div class="page-head"><h1>${esc(p.title)}</h1><p>${list.length} ${plural(list.length, 'видео', 'видео', 'видео')} · ${esc(p.note)}</p></div>
      <div class="list-rows">${list.map((v) => rowVideo(v)).join('')}</div>`;
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
    const list = VIDEOS.filter((v) => v.channel === 'orchardtech');
    return `
      <div class="page-head" style="display:flex;align-items:flex-end;gap:16px;flex-wrap:wrap">
        <div style="flex:1"><h1>Ваши видео</h1><p>Контент канала OrchardTech.</p></div>
        <button class="btn btn-primary" id="uploadBtn2">Загрузить видео</button>
      </div>
      <div class="list-rows">
        ${list.map((v) => rowVideo(v, {
          actions: `<span class="chip">${fmt(v.views)} просмотров</span><span class="chip">👍 ${fmt(v.likes || 0)}</span><span class="chip">${v.ago}</span>${v.media && api.upload ? `<button class="chip chip-danger" data-del="${v.id}">Удалить</button>` : ''}`
        })).join('')}
      </div>`;
  }

  function pageSearch(q) {
    const query = (q || '').trim().toLowerCase();
    let list = VIDEOS.filter((v) => !state.hidden.has(v.id));
    if (query) {
      list = list.filter((v) =>
        v.title.toLowerCase().includes(query) ||
        chOf(v).name.toLowerCase().includes(query) ||
        v.desc.toLowerCase().includes(query) ||
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
        ${list.length ? list.map((v) => rowVideo(v)).join('') : emptyHtml('🔍', 'Ничего не найдено', 'Попробуйте другой запрос: например, «код», «музыка» или «путешествия».')}
      </div>`;
  }

  function pageChannel(chId, tab) {
    const ch = CHANNELS[chId];
    if (!ch) return emptyHtml('🍊', 'Канал не найден', 'Возможно, ссылка устарела.');
    const list = VIDEOS.filter((v) => v.channel === chId);
    const isSub = state.subs.has(chId);
    const activeTab = tab || 'videos';

    const tabs = [
      ['videos', 'Видео'],
      ['shorts', 'Shorts'],
      ['playlists', 'Плейлисты'],
      ['about', 'О канале']
    ];

    let content = '';
    if (activeTab === 'videos') {
      content = list.length ? `<div class="video-grid">${list.map(videoCard).join('')}</div>` : emptyHtml('🎬', 'Пока нет видео', 'Канал ещё не загрузил ни одного видео.');
    } else if (activeTab === 'shorts') {
      content = `<div class="shorts-page">${SHORTS.slice(0, 4).map(shortCard).join('')}</div>`;
    } else if (activeTab === 'playlists') {
      content = `<div class="playlist-grid">
        ${PLAYLISTS.slice(0, 3).map((p) => `
          <a class="playlist-card" href="#/playlist/${p.id}">
            <div class="playlist-thumb">
              <div class="thumb-art" style="background:linear-gradient(135deg, ${p.g1}, ${p.g2})">
                <span class="thumb-emoji">${p.emoji}</span><span class="thumb-brand">Плейлист</span>
              </div>
              <span class="playlist-stack">${p.ids.length} видео</span>
            </div>
            <div class="playlist-info"><h3>${esc(p.title)}</h3><p>${esc(p.note)}</p></div>
          </a>`).join('')}
      </div>`;
    } else {
      content = `<div class="channel-about">
        <div class="about-block">
          <h3>Описание</h3>
          <p>${esc(ch.description)}</p>
        </div>
        <div class="about-block">
          <h3>Статистика</h3>
          <div class="about-stats">
            <div><b>${ch.subs}</b>подписчиков</div>
            <div><b>${fmt(ch.videoCount)}</b>видео</div>
            <div><b>${ch.views.replace(' просмотров', '').replace(' просмотра', '')}</b>просмотров</div>
          </div>
        </div>
        <div class="about-block">
          <h3>Подробности</h3>
          <p>Присоединился: ${esc(ch.joined)}
Страна: Россия
Ссылки: orchardtube.example/${esc(ch.handle.replace('@', ''))}</p>
        </div>
      </div>`;
    }

    return `
      <div class="channel-banner" style="background:linear-gradient(120deg, ${ch.banner[0]}, ${ch.banner[1]})">
        <span class="banner-mark">${esc(ch.avatar)}</span>
      </div>
      <div class="channel-head">
        ${avatarHtml(ch)}
        <div class="channel-info">
          <h1>${esc(ch.name)} ${ch.verified ? '<svg class="ic"><use href="#i-verified"/></svg>' : ''}</h1>
          <div class="channel-stats">
            <span>${esc(ch.handle)}</span><span class="dot">●</span>
            <span>${ch.subs} подписчиков</span><span class="dot">●</span>
            <span>${fmt(ch.videoCount)} видео</span>
          </div>
          <div class="channel-desc" id="chDesc">${esc(ch.description)}</div>
          <button class="channel-more" id="chMore">Ещё</button>
          <div class="channel-actions">
            <button class="subscribe-btn ${isSub ? 'subscribed' : ''}" data-sub="${chId}">
              ${isSub ? 'Вы подписаны' : 'Подписаться'}
            </button>
            <button class="btn" id="chJoin">Спонсор</button>
            <button class="btn btn-ghost"><svg class="ic" style="width:20px;height:20px"><use href="#i-share"/></svg></button>
          </div>
        </div>
      </div>
      <div class="channel-tabs">
        ${tabs.map(([id, label]) => `<a class="channel-tab ${id === activeTab ? 'active' : ''}" href="#/channel/${chId}/${id}">${label}</a>`).join('')}
      </div>
      ${content}`;
  }

  function pageSimple(kind) {
    const data = {
      music: {
        emoji: '🎧', title: 'Orchard Music', sub: 'Миллионы треков, подборки под настроение и живые выступления.',
        cta: 'Открыть музыку', g1: '#a5b4fc', g2: '#4338ca'
      },
      kids: {
        emoji: '🧸', title: 'Orchard Детям', sub: 'Безопасный контент, обучающие мультфильмы и родительский контроль.',
        cta: 'Открыть детский режим', g1: '#86efac', g2: '#15803d'
      }
    }[kind] || { emoji: '🍊', title: 'OrchardTube', sub: '', cta: 'На главную', g1: '#ffb347', g2: '#e8590c' };

    return `
      <div style="border-radius:20px;padding:56px 40px;background:linear-gradient(120deg, ${data.g1}, ${data.g2});color:#fff;position:relative;overflow:hidden">
        <div style="position:absolute;right:32px;bottom:-18px;font-size:150px;opacity:.28">${data.emoji}</div>
        <div style="position:relative;max-width:620px">
          <div style="font-size:12px;font-weight:800;letter-spacing:2px;text-transform:uppercase;opacity:.85">OrchardTube</div>
          <h1 style="font-size:38px;margin:10px 0 12px;letter-spacing:-1px">${esc(data.title)}</h1>
          <p style="font-size:16px;line-height:1.6;margin:0 0 24px;opacity:.95">${esc(data.sub)}</p>
          <button class="btn" style="background:#fff;color:#1a1a1a" id="simpleCta">${esc(data.cta)}</button>
        </div>
      </div>
      <div class="section-head" style="margin-top:34px"><svg class="ic"><use href="#i-fire"/></svg><h2>Популярное сейчас</h2></div>
      <div class="video-grid">${VIDEOS.slice(0, 8).map(videoCard).join('')}</div>`;
  }

  /* ---------------- Premium ---------------- */
  const PREMIUM_PERKS = [
    { icon: 'i-play', emoji: '🚫', title: 'Без рекламы', text: 'Смотрите видео без перерывов на рекламу — на всех устройствах, в том числе в фоновом режиме.' },
    { icon: 'i-download', emoji: '⬇️', title: 'Скачивания', text: 'Сохраняйте до 50 видео офлайн: в самолёте, метро или за городом — без интернета.' },
    { icon: 'i-eye', emoji: '🌙', title: 'Фоновое воспроизведение', text: 'Экран погас — звук продолжает играть. Идеально для музыки и подкастов.' },
    { icon: 'i-music', emoji: '🎵', title: 'Orchard Music Premium', text: 'Музыкальный сервис включён: миллионы треков без рекламы и офлайн.' }
  ];

  const PREMIUM_PLANS = [
    { id: 'individual', name: 'Индивидуальный', price: { m: '279 ₽', y: '2 790 ₽' }, per: 'в месяц', best: true, note: 'Для одного аккаунта' },
    { id: 'family', name: 'Семейный', price: { m: '439 ₽', y: '4 390 ₽' }, per: 'в месяц', best: false, note: 'До 5 участников домашнего хозяйства' },
    { id: 'student', name: 'Студенческий', price: { m: '139 ₽', y: '1 390 ₽' }, per: 'в месяц', best: false, note: 'Нужно подтверждение статуса студента' }
  ];

  const PREMIUM_FAQ = [
    ['Отменю в любой момент?', 'Да. Подписку можно отменить в пару кликов в настройках аккаунта — доступ сохранится до конца оплаченного периода.'],
    ['Что входит в семейный план?', 'До 5 участников, каждый со своим аккаунтом, рекомендациями и историей. Все получают преимущества Premium.'],
    ['Есть ли студенческая скидка?', 'Да, скидка около 50%. Статус студента нужно подтверждать каждые 12 месяцев.'],
    ['Работает ли офлайн-режим?', 'Скачанные видео доступны 14 дней без выхода в сеть. После подключения срок обновляется автоматически.']
  ];

  function premiumHeroHtml() {
    const active = !!state.premium;
    return `
      <div class="premium-hero">
        <div class="premium-hero-emoji">🍊</div>
        <div class="premium-hero-badge">OrchardTube</div>
        <h1 class="premium-hero-title">${active ? 'Premium активен 🎉' : 'Premium без рекламы, скачиваний и границ'}</h1>
        <p class="premium-hero-sub">Первые 30 дней бесплатно, потом от 139 ₽/мес. Отменить можно в любой момент.</p>
        <div class="premium-hero-actions">
          <button class="btn premium-cta" id="premiumMainCta">${active ? 'Управление подпиской' : 'Попробовать бесплатно'}</button>
          <span class="premium-hero-note">${active ? 'План: Индивидуальный · следующий платёж 21 дек.' : 'Без автопродления первый месяц'}</span>
        </div>
      </div>`;
  }

  function pagePremium() {
    const period = state.premiumPeriod || 'm';
    return `
      ${premiumHeroHtml()}

      <div class="premium-perks">
        ${PREMIUM_PERKS.map((p) => `
          <div class="premium-perk">
            <span class="premium-perk-emoji">${p.emoji}</span>
            <h3>${esc(p.title)}</h3>
            <p>${esc(p.text)}</p>
          </div>`).join('')}
      </div>

      <div class="premium-plans-head">
        <h2>Выберите план</h2>
        <div class="premium-toggle" id="premiumToggle">
          <button class="premium-period ${period === 'm' ? 'active' : ''}" data-period="m">Помесячно</button>
          <button class="premium-period ${period === 'y' ? 'active' : ''}" data-period="y">Год <b>−17%</b></button>
        </div>
      </div>
      <div class="premium-plans" id="premiumPlans">
        ${PREMIUM_PLANS.map((pl) => `
          <div class="premium-plan ${pl.best ? 'best' : ''}">
            ${pl.best ? '<span class="premium-plan-flag">Популярный</span>' : ''}
            <h3>${esc(pl.name)}</h3>
            <div class="premium-plan-price">${pl.price[period]}<span>${pl.per}</span></div>
            <p>${esc(pl.note)}</p>
            <button class="btn ${pl.best ? 'btn-primary' : ''} premium-plan-cta" data-plan="${pl.id}">
              ${state.premium ? 'Перейти на план' : 'Выбрать'}
            </button>
          </div>`).join('')}
      </div>

      <div class="section-head" style="margin-top:40px"><svg class="ic"><use href="#i-help"/></svg><h2>Частые вопросы</h2></div>
      <div class="premium-faq" id="premiumFaq">
        ${PREMIUM_FAQ.map(([q, a], i) => `
          <details class="premium-faq-item" ${i === 0 ? 'open' : ''}>
            <summary>${esc(q)}<svg class="ic"><use href="#i-chevron-down"/></svg></summary>
            <p>${esc(a)}</p>
          </details>`).join('')}
      </div>

      <div class="section-head" style="margin-top:40px"><svg class="ic"><use href="#i-fire"/></svg><h2>Премиум-контент уже здесь</h2></div>
      <div class="video-grid">${VIDEOS.slice(0, 8).map(videoCard).join('')}</div>`;
  }

  /* ---------------- просмотр ---------------- */
  let player = null;
  let sideFilter = 'all';
  let commentSortMode = 'top';

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

  // Комментарии без videoId — демо-набор для любого видео; с videoId — только для своего
  function commentsFor(v) {
    return (state.comments[v.id] || []).concat(COMMENTS.filter((c) => !c.videoId || c.videoId === v.id));
  }

  function commentsHtml(v) {
    const all = commentsFor(v);
    return `
      <div class="comments">
        <div class="comments-head">
          <h2>${all.length} ${plural(all.length, 'комментарий', 'комментария', 'комментариев')}</h2>
          <div class="comments-sort-group" id="sortGroup">
            <button class="comments-sort active" data-sort="top" id="sortTop"><svg class="ic"><use href="#i-thumb-up"/></svg>Популярные</button>
            <button class="comments-sort" data-sort="new" id="sortNew"><svg class="ic"><use href="#i-history"/></svg>Новые</button>
          </div>
        </div>
        <div class="comment-form">
          ${avatarHtml({ avatar: 'В', color: '#ff6b00' }, 40)}
          <div>
            <textarea class="comment-input" id="commentInput" placeholder="Введите комментарий..." rows="1"></textarea>
            <div class="comment-form-actions">
              <button class="btn btn-ghost" id="commentCancel">Отмена</button>
              <button class="btn btn-primary" id="commentSend">Оставить комментарий</button>
            </div>
          </div>
        </div>
        <div id="commentList">
          ${all.map((c, i) => commentHtml(c, v.id, i)).join('')}
        </div>
      </div>`;
  }

  function commentHtml(c, vid, idx) {
    const key = vid + ':' + idx;
    const liked = commentLiked.has(key);
    return `
      <div class="comment">
        ${avatarHtml({ avatar: c.avatar, color: c.color }, 40)}
        <div>
          <div class="comment-head">
            <span class="comment-author">${esc(c.author)}</span>
            <span class="comment-time">${esc(c.ago)}</span>
            ${c.pinned ? '<span class="pin-tag">Закреплённый комментарий</span>' : ''}
          </div>
          <p class="comment-text">${esc(c.text)}</p>
          <div class="comment-actions">
            <button class="comment-like ${liked ? 'active' : ''}" data-clike="${key}">
              <svg class="ic"><use href="#i-thumb-up"/></svg>${fmt(c.likes + (liked ? 1 : 0))}
            </button>
            <button class="comment-like" data-cdislike="${key}"><svg class="ic"><use href="#i-thumb-down"/></svg></button>
            <button class="comment-reply">Ответить</button>
          </div>
        </div>
      </div>`;
  }

  function pageWatch(id) {
    const v = byId(id);
    if (!v) return emptyHtml('🍊', 'Видео не найдено', 'Возможно, оно было удалено или ссылка неверная.');
    const ch = chOf(v);
    const liked = state.likes.has(v.id);
    const disliked = state.dislikes.has(v.id);
    const likeCount = (v.likes || 0) + (liked ? 1 : 0);
    const isSub = state.subs.has(v.channel);
    const saved = state.later.has(v.id);

    return `
      <div class="watch">
        <div class="watch-main">
          <div class="player" id="player" data-id="${v.id}">
            <div class="player-art" style="background:linear-gradient(135deg, ${v.g1}, ${v.g2})">
              ${v.media
                ? `<video class="player-video" id="realVideo" src="${esc(v.media)}" ${v.thumb ? `poster="${esc(v.thumb)}"` : ''} preload="metadata" playsinline></video>`
                : `<span class="thumb-emoji">${v.emoji}</span>`}
            </div>
            <span class="player-watermark">OrchardTube</span>
            <div class="player-center">
              <button class="big-play" id="bigPlay" aria-label="Смотреть"><svg class="ic"><use href="#i-play"/></svg></button>
            </div>
            <div class="player-controls">
              <div class="pc-bar" id="pcBar">
                <div class="pc-track"><i id="pcFill"></i><b id="pcKnob"></b></div>
              </div>
              <div class="pc-row">
                <button class="pc-btn" id="pcPlay" aria-label="Пауза"><svg class="ic"><use href="#i-play"/></svg></button>
                <button class="pc-btn" id="pcMute" aria-label="Звук"><svg class="ic"><use href="#i-volume"/></svg></button>
                <span class="pc-time" id="pcTime">0:00 / ${v.live ? 'прямой эфир' : v.duration}</span>
                <span class="pc-spacer"></span>
                <button class="quality" id="pcQuality">1080p</button>
                <button class="pc-btn" aria-label="Настройки"><svg class="ic"><use href="#i-settings"/></svg></button>
                <button class="pc-btn" id="pcFull" aria-label="Полный экран"><svg class="ic"><use href="#i-fullscreen"/></svg></button>
              </div>
            </div>
          </div>

          <h1 class="watch-title">${esc(v.title)}</h1>

          <div class="watch-actions-row">
            <div class="watch-channel">
              <a href="#/channel/${v.channel}">${avatarHtml(ch, 40)}</a>
              <div>
                <a class="wc-name" href="#/channel/${v.channel}">${esc(ch.name)} ${ch.verified ? '<svg class="ic"><use href="#i-verified"/></svg>' : ''}</a>
                <div class="wc-subs">${ch.subs} подписчиков</div>
              </div>
              <button class="subscribe-btn ${isSub ? 'subscribed' : ''}" data-sub="${v.channel}">
                ${isSub ? 'Вы подписаны' : 'Подписаться'}
              </button>
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
              <button class="action-btn" id="downloadBtn"><svg class="ic"><use href="#i-download"/></svg><span>Скачать</span></button>
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
              <span>${v.live ? `${v.watching} смотрят сейчас` : v.viewsText}</span>
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

  function pageShortsView(sid) {
    const s = SHORTS.find((x) => x.id === sid) || SHORTS[0];
    const idx = SHORTS.indexOf(s);
    const next = SHORTS[(idx + 1) % SHORTS.length];
    return `
      <div style="display:grid;grid-template-columns:minmax(0,420px) 1fr;gap:32px;align-items:start;max-width:1100px">
        <div>
          <div style="position:relative;aspect-ratio:9/16;border-radius:18px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.45)">
            <div class="thumb-art" style="background:linear-gradient(160deg, ${s.g1}, ${s.g2})">
              <span class="thumb-emoji" style="font-size:96px">${s.emoji}</span>
            </div>
            <div style="position:absolute;left:0;right:0;bottom:0;padding:20px;background:linear-gradient(transparent, rgba(0,0,0,.75));color:#fff;z-index:2">
              <div style="font-weight:700;font-size:17px;margin-bottom:6px">${esc(s.title)}</div>
              <div style="font-size:13px;opacity:.85">${s.views} просмотров</div>
            </div>
            <button class="big-play" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:3" id="shortPlay">
              <svg class="ic"><use href="#i-play"/></svg>
            </button>
          </div>
        </div>
        <div>
          <div class="page-head"><h1>Shorts</h1><p>Вертикальные видео OrchardTube.</p></div>
          <div class="shorts-page" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">
            ${SHORTS.filter((x) => x.id !== s.id).map(shortCard).join('')}
          </div>
          <div style="margin-top:24px">
            <a class="btn btn-primary" href="#/shorts/${next.id}">Следующий Short</a>
          </div>
        </div>
      </div>`;
  }

  /* ---------------- инициализация плеера ---------------- */
  let activeVideo = null;

  function stopPlayer() {
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
    const q = $('#pcQuality');
    if (q) q.hidden = true; // выбор качества не применим к одному файлу
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
      if (!counted) { counted = true; post(`/api/videos/${encodeURIComponent(v.id)}/view`); }
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

    $('#pcMute').addEventListener('click', (e) => {
      vid.muted = !vid.muted;
      e.currentTarget.classList.toggle('active', vid.muted);
      toast(vid.muted ? 'Звук выключен' : 'Звук включён');
    });

    $('#pcFull').addEventListener('click', () => {
      try {
        if (document.fullscreenElement) document.exitFullscreen();
        else el.requestFullscreen && el.requestFullscreen();
      } catch (err) { toast('Полноэкранный режим недоступен'); }
    });

    recordHistory(v);
  }

  function initPlayer(v) {
    stopPlayer();
    const el = $('#player');
    if (!el) return;
    const realVid = $('#realVideo');
    if (realVid) { initRealPlayer(v, el, realVid); return; }
    const total = v.live ? 0 : parseDuration(v.duration);
    player = { id: v.id, t: Math.round(total * (v.watched || 0)), playing: false, total, live: !!v.live, timer: null };
    const fill = $('#pcFill');
    const knob = $('#pcKnob');
    const timeEl = $('#pcTime');

    function paint() {
      if (!player) return;
      if (player.live) {
        fill.style.width = '100%';
        knob.style.left = '100%';
        timeEl.textContent = 'прямой эфир';
        return;
      }
      const p = player.total ? (player.t / player.total) * 100 : 0;
      fill.style.width = p + '%';
      knob.style.left = p + '%';
      timeEl.textContent = timeText(player.t) + ' / ' + v.duration;
    }
    paint();

    function tick() {
      if (!player || !player.playing || player.live) return;
      player.t += 1;
      if (player.t >= player.total) {
        player.t = player.total;
        paint();
        setPlaying(false);
        return;
      }
      paint();
    }

    function setPlaying(on) {
      if (!player) return;
      player.playing = on;
      el.classList.toggle('is-playing', on);
      $('#pcPlay use').setAttribute('href', on ? '#i-pause' : '#i-play');
      if (player.timer) clearInterval(player.timer);
      player.timer = on ? setInterval(tick, 1000) : null;
    }
    window.__otSetPlaying = setPlaying;

    let counted = false;
    const countView = () => { if (!counted) { counted = true; post(`/api/videos/${encodeURIComponent(v.id)}/view`); } };
    $('#bigPlay').addEventListener('click', () => { setPlaying(true); countView(); });
    $('#pcPlay').addEventListener('click', () => { setPlaying(!player.playing); if (player && player.playing) countView(); });

    el.querySelector('.player-art').addEventListener('click', () => {
      if (!player) return;
      setPlaying(!player.playing);
    });

    $('#pcBar').addEventListener('click', (e) => {
      if (!player || player.live) return;
      const r = e.currentTarget.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      player.t = Math.round(player.total * ratio);
      paint();
    });

    $('#pcMute').addEventListener('click', (e) => {
      const b = e.currentTarget;
      b.classList.toggle('active');
      const use = b.querySelector('use');
      use.setAttribute('href', b.classList.contains('active') ? '#i-volume' : '#i-volume');
      toast(b.classList.contains('active') ? 'Звук выключен' : 'Звук включён');
    });

    $('#pcQuality').addEventListener('click', (e) => {
      const opts = ['144p', '360p', '720p', '1080p', '4K'];
      const cur = opts.indexOf(e.currentTarget.textContent);
      e.currentTarget.textContent = opts[(cur + 1) % opts.length];
    });

    $('#pcFull').addEventListener('click', () => {
      try {
        if (document.fullscreenElement) document.exitFullscreen();
        else el.requestFullscreen && el.requestFullscreen();
      } catch (err) { toast('Полноэкранный режим недоступен'); }
    });

    recordHistory(v);
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
        if (b.dataset.act === 'later') toggleLater(b.dataset.id);
        else toast('Видео добавлено в очередь');
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
        if (ch.name.toLowerCase().includes(lower)) matches.add(ch.name);
        if (v.category.toLowerCase().includes(lower)) matches.add(v.category);
      });
      SHORTS.forEach((s) => {
        if (s.title.toLowerCase().includes(lower)) matches.add('Shorts: ' + s.title);
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
          input.value = item.dataset.ac.replace(/^Shorts: /, '');
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
        const wrap = $('#shortsStripWrap');
        if (wrap) wrap.innerHTML = state.filter === 'Все' ? shortsStrip() : '';
        const grid = $('#homeGrid');
        if (grid) { grid.innerHTML = gridHtml(); bindCards(grid); }
        if (wrap) bindCards(wrap);
      });
    });
  }

  function bindSubscribe() {
    $$('[data-sub]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.sub;
        const ch = CHANNELS[id];
        if (state.subs.has(id)) {
          state.subs.delete(id);
          post(`/api/channels/${encodeURIComponent(id)}/subscribe`, { delta: -1 });
          toast(`Вы отписались от ${ch.name}`);
        } else {
          state.subs.add(id);
          post(`/api/channels/${encodeURIComponent(id)}/subscribe`, { delta: 1 });
          toast(`Вы подписались на ${ch.name}`);
        }
        saveState();
        renderSideChannels();
        $$(`[data-sub="${id}"]`).forEach((b) => {
          const on = state.subs.has(id);
          b.classList.toggle('subscribed', on);
          b.textContent = on ? 'Вы подписаны' : 'Подписаться';
        });
      });
    });
  }

  function bindWatch(v) {
    const likeBtn = $('#likeBtn');
    const dislikeBtn = $('#dislikeBtn');

    likeBtn.addEventListener('click', () => {
      const on = state.likes.has(v.id);
      if (on) state.likes.delete(v.id);
      else { state.likes.add(v.id); state.dislikes.delete(v.id); }
      saveState();
      post(`/api/videos/${encodeURIComponent(v.id)}/like`, { delta: on ? -1 : 1 });
      likeBtn.classList.toggle('active', !on);
      dislikeBtn.classList.remove('active');
      $('#likeCount').textContent = fmt((v.likes || 0) + (!on ? 1 : 0));
      toast(on ? 'Лайк убран' : 'Лайк поставлен');
    });

    dislikeBtn.addEventListener('click', () => {
      const on = state.dislikes.has(v.id);
      if (!on && state.likes.has(v.id)) post(`/api/videos/${encodeURIComponent(v.id)}/like`, { delta: -1 });
      if (on) state.dislikes.delete(v.id);
      else { state.dislikes.add(v.id); state.likes.delete(v.id); }
      saveState();
      dislikeBtn.classList.toggle('active', !on);
      likeBtn.classList.remove('active');
      $('#likeCount').textContent = fmt((v.likes || 0) + (state.likes.has(v.id) ? 1 : 0));
    });

    $('#shareBtn').addEventListener('click', () => copyLink(v.id));
    $('#downloadBtn').addEventListener('click', () => toast('Скачивание доступно в OrchardTube Premium'));
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
      const text = input.value.trim();
      if (!text) { input.focus(); return; }
      if (sending) return;
      if (api.db) {
        sending = true;
        try {
          const r = await apiFetch('/api/comments', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ videoId: v.id, author: 'Вы', text })
          }, 8000);
          if (!r.ok || !r.data || !r.data.comment) throw new Error('bad response');
          COMMENTS.unshift({ ...r.data.comment, author: 'Вы', avatar: 'В' });
          input.value = '';
          renderComments(v, commentSortMode);
        } catch (e) {
          toast('Не удалось отправить комментарий');
        } finally { sending = false; }
        return;
      }
      const list = state.comments[v.id] || (state.comments[v.id] = []);
      list.unshift({ author: 'Вы', avatar: 'В', color: '#ff6b00', ago: 'только что', likes: 0, text });
      input.value = '';
      saveState();
      renderComments(v, commentSortMode);
    };
    $('#commentSend').addEventListener('click', send);
    $('#commentCancel').addEventListener('click', () => { input.value = ''; });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 160) + 'px';
    });
    bindCommentActions(v);

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

  function renderComments(v, sortMode) {
    let all = commentsFor(v);
    if (sortMode === 'top') {
      all.sort((a, b) => b.likes - a.likes);
    } else {
      all.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return 0;
      });
    }
    $('#commentList').innerHTML = all.map((c, i) => commentHtml(c, v.id, i)).join('');
    const headEl = $('.comments-head h2');
    if (headEl) headEl.textContent = `${all.length} ${plural(all.length, 'комментарий', 'комментария', 'комментариев')}`;
    bindCommentActions(v);
  }

  function bindCommentActions(v) {
    $$('[data-clike]').forEach((b) => {
      b.addEventListener('click', () => {
        const key = b.dataset.clike;
        if (commentLiked.has(key)) commentLiked.delete(key);
        else commentLiked.add(key);
        renderComments(v, commentSortMode);
      });
    });
    $$('[data-cdislike]').forEach((b) => {
      b.addEventListener('click', () => toast('Спасибо за отзыв'));
    });
    $$('.comment-reply').forEach((b) => {
      b.addEventListener('click', () => {
        const input = $('#commentInput');
        if (input) { input.focus(); input.placeholder = 'Напишите ответ...'; }
      });
    });

    // сортировка комментариев
    $$('#sortGroup .comments-sort').forEach((btn) => {
      btn.addEventListener('click', () => {
        commentSortMode = btn.dataset.sort;
        $$('#sortGroup .comments-sort').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        renderComments(v, commentSortMode);
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
      const more = $('#chMore');
      const desc = $('#chDesc');
      if (more && desc) {
        more.addEventListener('click', () => {
          desc.classList.toggle('open');
          more.textContent = desc.classList.contains('open') ? 'Свернуть' : 'Ещё';
        });
      }
      const join = $('#chJoin');
      if (join) join.addEventListener('click', () => toast('Спонсорство появится в OrchardTube Premium'));
    }

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
    $$('[data-del]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.del;
        const v = byId(id);
        if (!v || !confirm(`Удалить видео «${v.title}»? Это действие нельзя отменить.`)) return;
        if (api.tokenRequired && !state.uploadToken) {
          state.uploadToken = (prompt('Ключ загрузки') || '').trim();
          saveState();
        }
        try {
          const r = await apiFetch(`/api/videos/${encodeURIComponent(id)}`, { method: 'DELETE', headers: uploadHeaders() }, 15000);
          if (!r.ok) throw new Error(r.status === 401 ? 'Неверный ключ загрузки' : 'Не удалось удалить видео');
          const i = VIDEOS.findIndex((x) => x.id === id);
          if (i >= 0) VIDEOS.splice(i, 1);
          toast('Видео удалено');
          render();
        } catch (e) {
          toast(e.message);
        }
      });
    });

    const cta = $('#simpleCta');
    if (cta) cta.addEventListener('click', () => toast('Это демо-страница OrchardTube'));

    const sp = $('#shortPlay');
    if (sp) sp.addEventListener('click', () => toast('Shorts проигрываются в демо-режиме'));

    if (page === 'premium') bindPremium();
  }

  /* ---------------- привязки Premium ---------------- */
  function bindPremium() {
    const main = $('#premiumMainCta');
    if (main) {
      main.addEventListener('click', () => {
        if (state.premium) {
          state.premium = null;
          saveState();
          render();
          toast('Подписка Premium отменена');
        } else {
          activatePremium('individual');
        }
      });
    }

    $$('#premiumPlans .premium-plan-cta').forEach((b) => {
      b.addEventListener('click', () => activatePremium(b.dataset.plan));
    });

    $$('#premiumToggle .premium-period').forEach((b) => {
      b.addEventListener('click', () => {
        state.premiumPeriod = b.dataset.period;
        saveState();
        render();
      });
    });
  }

  function activatePremium(planId) {
    const pl = PREMIUM_PLANS.find((p) => p.id === planId) || PREMIUM_PLANS[0];
    state.premium = { plan: pl.id, name: pl.name, since: Date.now() };
    saveState();
    render();
    toast(`🍊 Premium активирован: ${pl.name}. 30 дней бесплатно!`);
  }

  /* ---------------- рендер ---------------- */
  function render() {
    closePopover();
    closeModal();
    stopPlayer();
    document.body.classList.remove('nav-open');

    const { parts, params } = parseRoute();
    const page = parts[0] || 'home';
    let html = '';

    switch (page) {
      case 'watch': html = pageWatch(parts[1]); break;
      case 'shorts': html = parts[1] ? pageShortsView(parts[1]) : pageShorts(); break;
      case 'subs': html = pageSubs(); break;
      case 'library': html = pageLibrary(); break;
      case 'playlist': html = pagePlaylist(parts[1]); break;
      case 'history': html = pageHistory(); break;
      case 'liked': html = pageLiked(); break;
      case 'watch-later': html = pageLater(); break;
      case 'my-videos': html = pageMyVideos(); break;
      case 'search': html = pageSearch(params.get('q') || ''); break;
      case 'channel': html = pageChannel(parts[1], parts[2]); break;
      case 'premium': html = pagePremium(); break;
      case 'music':
      case 'kids': html = pageSimple(page); break;
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

    $('#micBtn').addEventListener('click', () => toast('Голосовой поиск недоступен в демо-версии'));

    $('#menuBtn').addEventListener('click', () => {
      if (window.innerWidth <= 1312) {
        document.body.classList.toggle('nav-open');
      } else {
        document.body.classList.toggle('mini');
      }
    });

    $('#scrim').addEventListener('click', () => document.body.classList.remove('nav-open'));

    $('#createBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      openPopover(e.currentTarget, `
        <button class="pop-item" data-create="upload"><svg class="ic"><use href="#i-upload"/></svg>Загрузить видео</button>
        <button class="pop-item" data-create="live"><svg class="ic"><use href="#i-live"/></svg>Начать трансляцию</button>
        <button class="pop-item" data-create="post"><svg class="ic"><use href="#i-pencil"/></svg>Создать пост</button>
      `);
      $$('#popover .pop-item').forEach((b) => b.addEventListener('click', () => {
        closePopover();
        if (b.dataset.create === 'upload') openUpload();
        if (b.dataset.create === 'live') toast('Трансляция начнётся после подключения камеры');
        if (b.dataset.create === 'post') toast('Посты доступны на каналах с 500+ подписчиков');
      }));
    });

    $('#bellBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      openPopover(e.currentTarget, `
        <div class="pop-head"><div class="ph-name">Уведомления</div></div>
        <div class="pop-sep"></div>
        ${NOTIFS.map((n) => `
          <a class="pop-item" href="#/watch/${VIDEOS.find((v) => v.channel === n.ch)?.id || ''}" style="align-items:flex-start">
            ${avatarHtml(CHANNELS[n.ch])}
            <span style="display:block">
              <span style="display:block;line-height:1.35;margin-bottom:3px">${esc(n.title)}</span>
              <span style="color:var(--fg-dim);font-size:12px">${esc(n.ago)}</span>
            </span>
          </a>`).join('')}
        <div class="pop-sep"></div>
        <button class="pop-item" data-keep-popover="1">Отметить всё как прочитанное</button>
      `, 'right');
    });

    $('#avatarBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      openPopover(e.currentTarget, `
        <div class="pop-head">
          <span class="avatar-btn">В</span>
          <div><div class="ph-name">Владимир</div><div class="ph-mail">vladimir@orchardtube.dev</div></div>
        </div>
        <div class="pop-sep"></div>
        <a class="pop-item" href="#/channel/orchardtech"><svg class="ic"><use href="#i-user"/></svg>Ваш канал</a>
        <button class="pop-item"><svg class="ic"><use href="#i-settings"/></svg>Orchard Studio</button>
        <button class="pop-item" id="popTheme"><svg class="ic"><use href="#i-moon"/></svg>Сменить тему</button>
        <div class="pop-sep"></div>
        <button class="pop-item"><svg class="ic"><use href="#i-close"/></svg>Выйти</button>
      `);
      const t = $('#popTheme');
      if (t) t.addEventListener('click', () => { closePopover(); toggleTheme(); });
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

  function uploadHeaders() {
    return state.uploadToken ? { 'x-upload-token': state.uploadToken } : {};
  }

  function openUpload() {
    const canUpload = api.upload;
    const cats = CHIP_CATS.filter((c) => c !== 'Все' && c !== 'Прямые трансляции');
    openModal(`
      <div class="modal-head">
        <div><h2>Загрузить видео</h2><p>Поделитесь моментом с миром — или хотя бы с садом.</p></div>
        <button class="icon-btn" data-close aria-label="Закрыть"><svg class="ic"><use href="#i-close"/></svg></button>
      </div>
      <form id="uploadForm">
        ${canUpload ? '' : `<div class="upload-note">Загрузка недоступна: сервер работает без базы данных. Подключите MongoDB (переменная <code>MONGODB_URI</code>) и откройте сайт через сервер.</div>`}
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
        ${api.tokenRequired ? `<div class="form-row">
          <label class="form-label" for="upToken">Ключ загрузки</label>
          <input class="form-input" id="upToken" type="password" autocomplete="off" value="${esc(state.uploadToken)}" placeholder="Задан администратором сайта">
        </div>` : ''}
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
      const tokenInput = $('#upToken');
      if (tokenInput) { state.uploadToken = tokenInput.value.trim(); saveState(); }

      const fd = new FormData();
      fd.append('title', $('#upTitle').value.trim());
      fd.append('desc', $('#upDesc').value);
      fd.append('category', $('#upCat').value);
      fd.append('duration', durationLabel(chosen.duration));
      if (chosen.thumb) fd.append('thumb', chosen.thumb, 'thumb.jpg');
      fd.append('video', chosen.file, chosen.file.name); // файл — последним

      xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/videos');
      Object.entries(uploadHeaders()).forEach(([k, v]) => xhr.setRequestHeader(k, v));
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
          xhr = null;
          closeModal();
          toast('Видео опубликовано');
          location.hash = '#/watch/' + data.video.id;
        } else if (xhr.status === 401) {
          reset('Неверный ключ загрузки');
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
      <div class="form-row">
        <label class="form-label">Автовоспроизведение</label>
        <select class="form-select"><option>Включено</option><option>Выключено</option></select>
      </div>
      <div class="form-row">
        <label class="form-label">Качество видео</label>
        <select class="form-select"><option>Авто</option><option>1080p</option><option>720p</option><option>480p</option></select>
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

  /* ---------------- старт ---------------- */
  let started = false;
  function init() {
    if (started) return;
    started = true;
    applyTheme();
    initTopbar();
    if (/^https?:$/.test(location.protocol)) main.innerHTML = '<p class="boot-note">Загружаем OrchardTube…</p>';
    // Сначала пробуем сервер (быстро: при недоступности падаем на data.js), затем рисуем
    loadRemote().then(() => {
      renderSideChannels();
      render();
      window.addEventListener('hashchange', render);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
