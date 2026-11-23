/* OrchardTube — Админ-панель (роли, пользователи, модерация, журнал) */
(function () {
  const { $, $$, esc, api, toast, num, date, dateTime, initials } = Panel;
  let me = null, role = 'user';
  const ic = (n, cls) => `<svg class="ic ${cls || ''}"><use href="#i-${n}"/></svg>`;
  const RU = { owner: 'Владелец', admin: 'Администратор', moderator: 'Модератор', user: 'Пользователь' };
  const rank = { user: 0, moderator: 1, admin: 2, owner: 3 };
  const can = (r) => rank[role] >= rank[r];
  const pill = (r) => `<span class="role-pill ${esc(r)}">${esc(RU[r] || r)}</span>`;
  const ACTIONS = { 'role.set': 'Смена роли', 'role.invite': 'Приглашение с ролью', 'role.invite_cancel': 'Отмена приглашения', 'user.ban': 'Блокировка', 'user.unban': 'Разблокировка', 'video.delete': 'Удаление видео', 'comment.delete': 'Удаление комментария' };

  function gate(t, p, b) { $('#app').innerHTML = `<div class="gate"><h1>${esc(t)}</h1><p>${esc(p)}</p><a class="btn btn-orange" href="/">${esc(b || 'На главную')}</a></div>`; }

  function shell() {
    $('#app').innerHTML = `
      <header class="p-top">
        <a class="p-logo" href="/admin"><span class="p-logo-mark">${ic('shield')}</span><span>Orchard<span style="color:var(--orange)">Tube</span> <small>Админ-панель</small></span><span class="adm-banner">${esc(RU[role])}</span></a>
        <div class="p-right"><button class="p-icon" id="themeBtn" aria-label="Сменить тему">${ic('moon')}</button><button class="p-avatar" id="avaBtn">${me.user.picture ? `<img src="${esc(me.user.picture)}" alt="" referrerpolicy="no-referrer">` : esc(initials(me.user.name))}</button></div>
      </header>
      <aside class="p-side">
        <div style="height:12px"></div>
        <a class="nav-item" data-nav="overview" href="#/overview">${ic('dash')}<span>Обзор</span></a>
        <a class="nav-item" data-nav="users" href="#/users">${ic('users')}<span>Пользователи и роли</span></a>
        <a class="nav-item" data-nav="videos" href="#/videos">${ic('content')}<span>Видео</span></a>
        <a class="nav-item" data-nav="comments" href="#/comments">${ic('comment')}<span>Комментарии</span></a>
        <a class="nav-item" data-nav="audit" href="#/audit">${ic('log')}<span>Журнал действий</span></a>
        <div class="nav-sep"></div>
        ${me.channel ? `<a class="nav-item dim" href="/studio">${ic('chart')}<span>Моя Студия</span></a>` : ''}
        <a class="nav-item dim" href="/">${ic('back')}<span>На сайт</span></a>
      </aside>
      <main class="p-main"><div class="p-page" id="page"></div></main>`;
    $('#themeBtn').addEventListener('click', Panel.toggleTheme);
    $('#avaBtn').addEventListener('click', (e) => {
      const pop = Panel.popover(e.currentTarget, `<div class="pop-head"><span class="p-avatar">${esc(initials(me.user.name))}</span><div><b>${esc(me.user.name)}</b><div style="color:var(--fg-dim);font-size:12px">${esc(me.user.email)}</div>${pill(role)}</div></div><hr><a class="it" href="/">${ic('play', 'ic-s')}Вернуться на сайт</a><button class="it" data-a="out">${ic('close', 'ic-s')}Выйти</button>`);
      pop.addEventListener('click', async (ev) => { if (ev.target.closest('[data-a="out"]')) { try { await api('/api/auth/logout', { method: 'POST' }); } catch (x) { /* пусто */ } location.href = '/'; } });
    });
  }

  const setNav = (k) => $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === k));
  const loading = () => { $('#page').innerHTML = '<div class="empty">Загрузка…</div>'; };
  const fail = (e) => { $('#page').innerHTML = `<div class="empty">${esc(e.message)}</div>`; };

  function route() {
    const k = (location.hash || '#/overview').replace(/^#\/?/, '').split('/')[0];
    window.scrollTo(0, 0);
    const pages = { overview: pageOverview, users: pageUsers, videos: pageVideos, comments: pageComments, audit: pageAudit };
    const f = pages[k] || pageOverview;
    setNav(pages[k] ? k : 'overview');
    f();
  }

  /* ---------- Обзор ---------- */
  async function pageOverview() {
    document.title = 'Обзор — Админ-панель'; loading();
    let d; try { d = await api('/api/admin/overview'); } catch (e) { return fail(e); }
    const k = (l, v, sub) => `<div class="kpi"><div class="l">${l}</div><div class="v">${num(v)}</div>${sub ? `<div class="d">${sub}</div>` : ''}</div>`;
    $('#page').innerHTML = `<h1 class="p-title">Обзор сайта</h1><div class="kpis">
      ${k('Пользователи', d.users, `+${d.newUsers} за 7 дней`)}${k('Каналы', d.channels)}${k('Видео', d.videos, `+${d.newVideos} за 7 дней`)}${k('Комментарии', d.comments)}${k('Просмотры', d.views)}${k('Команда (модераторы и админы)', d.staff)}${k('Заблокировано', d.banned)}</div>
      <div class="card"><h3>Ваши права: ${esc(RU[role])}</h3><div class="sub">${role === 'moderator' ? 'Вы можете удалять видео и комментарии, блокировать обычных пользователей и смотреть журнал.' : 'Вы можете выдавать роли модераторов и администраторов, блокировать пользователей и удалять любой контент.'}${role === 'owner' ? ' Владелец задаётся переменной OWNER_EMAILS на сервере и не может быть изменён из панели.' : ''}</div></div>`;
  }

  /* ---------- Пользователи и роли ---------- */
  let uFilter = '', uQ = '';
  async function pageUsers() {
    document.title = 'Пользователи — Админ-панель'; loading();
    let d; try { d = await api(`/api/admin/users?q=${encodeURIComponent(uQ)}&role=${encodeURIComponent(uFilter)}`); } catch (e) { return fail(e); }
    const grantable = role === 'owner' ? ['moderator', 'admin'] : ['moderator'];
    $('#page').innerHTML = `<h1 class="p-title">Пользователи и роли</h1>
      ${can('admin') ? `<div class="card" style="margin-bottom:24px"><h3>Выдать роль по адресу Gmail</h3><div class="sub">Если человек уже заходил на сайт — роль применится сразу. Если нет — она появится, когда он впервые войдёт через Google.</div>
        <div class="grant"><div class="field" style="margin:0"><label for="gE">Адрес почты</label><input id="gE" type="email" placeholder="name@gmail.com"></div>
        <div class="field" style="margin:0"><label for="gR">Роль</label><select id="gR">${grantable.map((r) => `<option value="${r}">${RU[r]}</option>`).join('')}</select></div>
        <button class="btn btn-orange" id="gGo">Выдать</button></div>
        ${d.invites.length ? `<h4>Ожидают первого входа</h4>${d.invites.map((i) => `<div class="stat-row"><span>${esc(i.email)} · ${pill(i.role)}</span><span><button class="link-btn" data-inv="${esc(i.email)}">Отменить</button></span></div>`).join('')}` : ''}</div>` : ''}
      <div class="tabs"><button class="tab ${uFilter === '' ? 'active' : ''}" data-f="">Все</button><button class="tab ${uFilter === 'staff' ? 'active' : ''}" data-f="staff">Команда</button><button class="tab ${uFilter === 'banned' ? 'active' : ''}" data-f="banned">Заблокированные</button></div>
      <div class="filter-row">${ic('search', 'ic-s')}<input type="text" id="uQ" placeholder="Имя, почта или канал" value="${esc(uQ)}"></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Пользователь</th><th>Канал</th><th>Роль</th><th>Регистрация</th><th>Действия</th></tr></thead><tbody>
      ${d.users.length ? d.users.map((u) => {
        const mine = u.sub === me.sub;
        const lower = rank[role] > rank[u.role];
        const roleSel = can('admin') && !u.isOwner && !mine && lower
          ? `<select class="inp roleSel" data-sub="${esc(u.sub)}" style="width:auto;padding:6px 8px"><option value="user" ${u.role === 'user' ? 'selected' : ''}>Пользователь</option><option value="moderator" ${u.role === 'moderator' ? 'selected' : ''}>Модератор</option>${role === 'owner' ? `<option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Администратор</option>` : ''}</select>` : pill(u.role);
        const ban = can('moderator') && !mine && lower && !u.isOwner ? (u.banned ? `<button class="btn btn-sm" data-unban="${esc(u.sub)}">Разблокировать</button>` : `<button class="btn btn-sm btn-danger" data-ban="${esc(u.sub)}" data-name="${esc(u.name)}">Заблокировать</button>`) : '';
        return `<tr><td><div class="ucell"><span class="p-avatar">${u.picture ? `<img src="${esc(u.picture)}" alt="" referrerpolicy="no-referrer">` : esc(initials(u.name))}</span><div><b>${esc(u.name)}${mine ? ' (вы)' : ''}</b><small>${esc(u.email)}</small></div></div></td>
          <td>${u.channelId ? `<a href="/#/channel/${esc(u.channelId)}" style="color:var(--blue)">${esc(u.channelName || u.channelId)}</a>` : '<span class="date-sub">нет</span>'}</td>
          <td>${roleSel}${u.banned ? ` <span class="role-pill banned" title="${esc(u.banned.reason)}">Заблокирован</span>` : ''}</td><td>${date(u.createdAt)}</td><td>${ban}</td></tr>`;
      }).join('') : '<tr><td colspan="5"><div class="empty">Никого не найдено</div></td></tr>'}</tbody></table></div><div class="pager">Показано: ${d.users.length}</div>`;

    $$('.tab').forEach((t) => t.addEventListener('click', () => { uFilter = t.dataset.f; pageUsers(); }));
    let tm; $('#uQ').addEventListener('input', (e) => { clearTimeout(tm); tm = setTimeout(async () => { uQ = e.target.value.trim(); const pos = e.target.selectionStart; await pageUsers(); const i = $('#uQ'); i.focus(); i.setSelectionRange(pos, pos); }, 350); });
    const g = $('#gGo');
    if (g) g.addEventListener('click', async () => {
      try { const r = await api('/api/admin/grant', { method: 'POST', json: { email: $('#gE').value, role: $('#gR').value } }); toast(r.applied ? 'Роль выдана' : 'Приглашение сохранено — роль появится после первого входа'); pageUsers(); } catch (e) { toast(e.message); }
    });
    $$('[data-inv]').forEach((b) => b.addEventListener('click', async () => { try { await api('/api/admin/invites/' + encodeURIComponent(b.dataset.inv), { method: 'DELETE' }); toast('Приглашение отменено'); pageUsers(); } catch (e) { toast(e.message); } }));
    $$('.roleSel').forEach((s) => s.addEventListener('change', async () => {
      try { await api(`/api/admin/users/${encodeURIComponent(s.dataset.sub)}/role`, { method: 'POST', json: { role: s.value } }); toast('Роль изменена'); pageUsers(); } catch (e) { toast(e.message); pageUsers(); }
    }));
    $$('[data-ban]').forEach((b) => b.addEventListener('click', () => {
      const m = Panel.modal('Заблокировать пользователя', `<p style="margin-top:0">${esc(b.dataset.name)} не сможет загружать видео, комментировать и ставить оценки. Его видео пропадут из ленты.</p><div class="field"><label for="bR">Причина (необязательно)</label><input id="bR" maxlength="300"></div>`, `<button class="btn" data-close>Отмена</button><button class="btn btn-primary" id="bGo">Заблокировать</button>`);
      $('#bGo', m).addEventListener('click', async () => { try { await api(`/api/admin/users/${encodeURIComponent(b.dataset.ban)}/ban`, { method: 'POST', json: { banned: true, reason: $('#bR', m).value } }); m.close(); toast('Пользователь заблокирован'); pageUsers(); } catch (e) { toast(e.message); } });
    }));
    $$('[data-unban]').forEach((b) => b.addEventListener('click', async () => { try { await api(`/api/admin/users/${encodeURIComponent(b.dataset.unban)}/ban`, { method: 'POST', json: { banned: false } }); toast('Пользователь разблокирован'); pageUsers(); } catch (e) { toast(e.message); } }));
  }

  /* ---------- Видео ---------- */
  let vQ = '';
  async function pageVideos() {
    document.title = 'Видео — Админ-панель'; loading();
    let d; try { d = await api('/api/admin/videos?q=' + encodeURIComponent(vQ)); } catch (e) { return fail(e); }
    const VIS = { public: 'Открытое', unlisted: 'По ссылке', private: 'Ограниченное' };
    $('#page').innerHTML = `<h1 class="p-title">Видео на сайте</h1><div class="filter-row" style="border-top:1px solid var(--line);border-radius:8px 8px 0 0">${ic('search', 'ic-s')}<input type="text" id="vQ" placeholder="Поиск по названию" value="${esc(vQ)}"></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Видео</th><th>Автор</th><th>Доступ</th><th class="num">Просмотры</th><th>Дата</th><th></th></tr></thead><tbody>
      ${d.videos.length ? d.videos.map((v) => `<tr><td><div class="vcell" style="min-width:260px"><div class="thumb" style="width:96px">${v.thumb ? `<img src="${esc(v.thumb)}" alt="">` : ''}</div><div><a class="vt" href="/#/watch/${esc(v.id)}">${esc(v.title)}</a></div></div></td><td>${esc(v.ownerName)}<div class="date-sub">${esc(v.ownerEmail)}</div></td><td>${esc(VIS[v.visibility])}${v.ownerBanned ? ' <span class="role-pill banned">автор заблокирован</span>' : ''}</td><td class="num">${num(v.views)}</td><td>${esc(v.ago)}</td><td><button class="btn btn-sm btn-danger" data-del="${esc(v.id)}" data-t="${esc(v.title)}">Удалить</button></td></tr>`).join('') : '<tr><td colspan="6"><div class="empty">Видео нет</div></td></tr>'}</tbody></table></div>`;
    let tm; $('#vQ').addEventListener('input', (e) => { clearTimeout(tm); tm = setTimeout(async () => { vQ = e.target.value.trim(); const pos = e.target.selectionStart; await pageVideos(); const i = $('#vQ'); i.focus(); i.setSelectionRange(pos, pos); }, 350); });
    $$('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      if (!(await Panel.confirm('Удалить видео?', `«${b.dataset.t}» будет удалено вместе с комментариями. Действие попадёт в журнал.`, 'Удалить'))) return;
      try { await api('/api/admin/videos/' + encodeURIComponent(b.dataset.del), { method: 'DELETE' }); toast('Видео удалено'); pageVideos(); } catch (e) { toast(e.message); }
    }));
  }

  /* ---------- Комментарии ---------- */
  async function pageComments() {
    document.title = 'Комментарии — Админ-панель'; loading();
    let d; try { d = (await api('/api/admin/comments')).comments; } catch (e) { return fail(e); }
    $('#page').innerHTML = `<h1 class="p-title">Последние комментарии</h1><div class="list-card" style="border-top:1px solid var(--line);border-radius:8px">${d.length ? d.map((c) => `<div class="cm"><div class="ava" style="background:var(--orange)">${esc(initials(c.author))}</div><div><div class="who">${esc(c.author)}<small>${esc(c.ago)}</small></div><div class="txt">${esc(c.text)}</div><div class="on">К видео: <a href="/#/watch/${esc(c.videoId)}" style="color:var(--blue)">${esc(c.videoTitle || c.videoId)}</a></div></div><button class="p-icon" title="Удалить" data-del="${esc(c.id)}">${ic('trash')}</button></div>`).join('') : '<div class="empty">Комментариев нет</div>'}</div>`;
    $$('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      if (!(await Panel.confirm('Удалить комментарий?', 'Действие попадёт в журнал.', 'Удалить'))) return;
      try { await api('/api/admin/comments/' + encodeURIComponent(b.dataset.del), { method: 'DELETE' }); b.closest('.cm').remove(); toast('Комментарий удалён'); } catch (e) { toast(e.message); }
    }));
  }

  /* ---------- Журнал ---------- */
  async function pageAudit() {
    document.title = 'Журнал — Админ-панель'; loading();
    let d; try { d = (await api('/api/admin/audit')).log; } catch (e) { return fail(e); }
    const det = (a) => { const x = a.details || {}; if (a.action === 'role.set') return `${RU[x.from] || x.from} → ${RU[x.to] || x.to}`; if (a.action === 'role.invite') return RU[x.role] || x.role || ''; if (a.action === 'user.ban') return x.reason || ''; if (a.action === 'video.delete') return x.title || ''; if (a.action === 'comment.delete') return `${x.author || ''}: ${x.text || ''}`; return ''; };
    $('#page').innerHTML = `<h1 class="p-title">Журнал действий</h1><div class="tbl-wrap" style="border-top:1px solid var(--line);border-radius:8px"><table class="tbl"><thead><tr><th>Время</th><th>Кто</th><th>Действие</th><th>Объект</th><th>Подробности</th></tr></thead><tbody>${d.length ? d.map((a) => `<tr><td>${esc(dateTime(a.at))}</td><td>${esc(a.actor)}</td><td><span class="audit-act">${esc(ACTIONS[a.action] || a.action)}</span></td><td>${esc(a.target)}</td><td>${esc(det(a))}</td></tr>`).join('') : '<tr><td colspan="5"><div class="empty">Записей пока нет</div></td></tr>'}</tbody></table></div>`;
  }

  async function init() {
    $('#app').innerHTML = '<div class="gate"><p>Загрузка…</p></div>';
    try { me = await api('/api/me'); } catch (e) { return gate('Админ-панель недоступна', e.message); }
    if (!me || !me.user) return gate('Нужен вход', 'Войдите через Google на главной странице тем аккаунтом, которому выданы права.', 'Перейти на сайт');
    role = me.role || 'user';
    if (!can('moderator')) return gate('Нет доступа', 'Админ-панель доступна только владельцу, администраторам и модераторам сайта.');
    me.sub = me.sub || null;
    shell();
    window.addEventListener('hashchange', route);
    route();
  }
  init();
})();
