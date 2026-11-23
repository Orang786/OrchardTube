/* OrchardTube — общие функции Студии и Админ-панели */
(function () {
  const P = (window.Panel = {});
  P.$ = (s, r) => (r || document).querySelector(s);
  P.$$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  P.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  P.initials = (n) => { const w = String(n || '?').trim().split(/\s+/).filter(Boolean); return ((w[0] ? w[0][0] : '?') + (w[1] ? w[1][0] : '')).toUpperCase(); };
  P.num = (n) => Number(n || 0).toLocaleString('ru-RU');
  P.date = (d) => (d ? new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
  P.dateTime = (d) => (d ? new Date(d).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

  // тема общая с основным сайтом
  try { const s = JSON.parse(localStorage.getItem('orchardtube.v2') || '{}'); if (s.theme) document.documentElement.dataset.theme = s.theme; } catch (e) { /* пусто */ }
  P.toggleTheme = () => {
    const t = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = t;
    try { const s = JSON.parse(localStorage.getItem('orchardtube.v2') || '{}'); s.theme = t; localStorage.setItem('orchardtube.v2', JSON.stringify(s)); } catch (e) { /* пусто */ }
  };

  P.api = async (url, opts) => {
    opts = opts || {};
    const init = { method: opts.method || 'GET', credentials: 'same-origin', headers: {} };
    if (opts.json !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.json); }
    if (opts.body) init.body = opts.body;
    let r;
    try { r = await fetch(url, init); } catch (e) { throw new Error('Нет связи с сервером'); }
    let data = null;
    try { data = await r.json(); } catch (e) { /* пусто */ }
    if (!r.ok) { const err = new Error((data && data.message) || 'Ошибка ' + r.status); err.status = r.status; err.code = data && data.error; throw err; }
    return data;
  };

  let toastTimer;
  P.toast = (msg) => {
    P.$$('.toast').forEach((t) => t.remove());
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg; document.body.appendChild(t);
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.remove(), 3500);
  };

  P.modal = (title, bodyHtml, footHtml) => {
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><div class="modal-h"><span>${P.esc(title)}</span><button class="p-icon" data-close aria-label="Закрыть"><svg class="ic"><use href="#i-close"/></svg></button></div><div class="modal-b">${bodyHtml}</div>${footHtml ? `<div class="modal-f">${footHtml}</div>` : ''}</div>`;
    const close = () => { bg.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    bg.addEventListener('mousedown', (e) => { if (e.target === bg) close(); });
    bg.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
    document.body.appendChild(bg);
    bg.close = close;
    return bg;
  };

  P.confirm = (title, text, okLabel) => new Promise((resolve) => {
    const m = P.modal(title, `<p style="margin:0">${P.esc(text)}</p>`, `<button class="btn" data-close>Отмена</button><button class="btn btn-primary" id="cfOk">${P.esc(okLabel || 'Да')}</button>`);
    P.$('#cfOk', m).addEventListener('click', () => { m.close(); resolve(true); });
    m.addEventListener('click', (e) => { if (e.target.closest('[data-close]') || e.target === m) resolve(false); });
  });

  P.popover = (anchor, html) => {
    P.$$('.pop').forEach((p) => p.remove());
    const pop = document.createElement('div');
    pop.className = 'pop'; pop.innerHTML = html;
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    pop.style.top = r.bottom + 8 + 'px';
    pop.style.left = Math.max(8, Math.min(window.innerWidth - pop.offsetWidth - 8, r.right - pop.offsetWidth)) + 'px';
    const off = (e) => { if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('mousedown', off); } };
    setTimeout(() => document.addEventListener('mousedown', off), 0);
    pop.close = () => pop.remove();
    return pop;
  };

  // График: линия с областью, подписи по оси, подсказка при наведении
  P.chart = (el, series, key, label) => {
    const W = 800, H = 240, L = 40, R = 12, T = 12, B = 28;
    const vals = series.map((s) => s[key]);
    const max = Math.max(1, ...vals);
    const nice = max <= 4 ? max : Math.ceil(max / 4) * 4;
    const x = (i) => L + (series.length < 2 ? (W - L - R) / 2 : (i * (W - L - R)) / (series.length - 1));
    const y = (v) => T + (H - T - B) * (1 - v / nice);
    const pts = series.map((s, i) => `${x(i).toFixed(1)},${y(s[key]).toFixed(1)}`);
    let grid = '';
    const steps = nice <= 4 ? nice : 4;
    for (let i = 0; i <= steps; i++) {
      const v = (nice * i) / steps;
      grid += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${Math.round(v)}</text>`;
    }
    let xl = '';
    const every = Math.max(1, Math.ceil(series.length / 7));
    series.forEach((s, i) => { if (i % every === 0 || i === series.length - 1) { const d = new Date(s.day); xl += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${d.getUTCDate()} ${d.toLocaleDateString('ru-RU', { month: 'short', timeZone: 'UTC' }).replace('.', '')}</text>`; } });
    el.innerHTML = `<div class="chart-wrap"><svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${grid}${xl}
      <polygon class="area" points="${L},${y(0)} ${pts.join(' ')} ${x(series.length - 1)},${y(0)}"/><polyline class="line" points="${pts.join(' ')}" vector-effect="non-scaling-stroke"/></svg><div class="chart-tip" hidden></div></div>`;
    const svg = P.$('svg', el), tip = P.$('.chart-tip', el);
    svg.addEventListener('mousemove', (e) => {
      const rect = svg.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width) * W;
      let i = Math.round(((px - L) / (W - L - R)) * (series.length - 1));
      i = Math.max(0, Math.min(series.length - 1, i));
      const s = series[i];
      tip.hidden = false;
      tip.style.left = (x(i) / W) * rect.width + 'px';
      tip.style.top = (y(s[key]) / H) * rect.height + 'px';
      tip.textContent = `${P.date(s.day)} · ${label}: ${s[key]}`;
    });
    svg.addEventListener('mouseleave', () => { tip.hidden = true; });
  };

  P.icons = `<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">
  <symbol id="i-menu" viewBox="0 0 24 24"><path d="M3 6h18M3 12h18M3 18h18"/></symbol>
  <symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></symbol>
  <symbol id="i-close" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></symbol>
  <symbol id="i-dash" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></symbol>
  <symbol id="i-content" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9.5 5 2.5-5 2.5z"/></symbol>
  <symbol id="i-chart" viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></symbol>
  <symbol id="i-comment" viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z"/></symbol>
  <symbol id="i-gear" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-.9c.6.5 1.3.9 2 1.2l.4 2.6h4l.4-2.6c.7-.3 1.4-.7 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z"/></symbol>
  <symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>
  <symbol id="i-edit" viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></symbol>
  <symbol id="i-trash" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></symbol>
  <symbol id="i-eye" viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></symbol>
  <symbol id="i-moon" viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/></symbol>
  <symbol id="i-back" viewBox="0 0 24 24"><path d="M10 6 4 12l6 6M4 12h16"/></symbol>
  <symbol id="i-upload" viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></symbol>
  <symbol id="i-users" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.2c2.2.7 3.5 2.6 3.5 5.8"/></symbol>
  <symbol id="i-shield" viewBox="0 0 24 24"><path d="M12 3 4 6v6c0 4.5 3.2 8 8 9 4.8-1 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/></symbol>
  <symbol id="i-log" viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h7"/></symbol>
  <symbol id="i-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></symbol>
</svg>`;
  document.body.insertAdjacentHTML('afterbegin', P.icons);
})();
