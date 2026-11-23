/* OrchardTube — inline SVG sprite.
   Written synchronously so <use href="#..."> works on file:// too. */
document.write(`
<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true"
     fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <symbol id="i-menu" viewBox="0 0 24 24"><path d="M3 6h18M3 12h18M3 18h18"/></symbol>
  <symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></symbol>
  <symbol id="i-mic" viewBox="0 0 24 24"><rect x="9" y="2.5" width="6" height="11.5" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8.5 21h7"/></symbol>
  <symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>
  <symbol id="i-bell" viewBox="0 0 24 24"><path d="M18 8.5a6 6 0 1 0-12 0c0 6.5-3 6.5-3 8.5h18c0-2-3-2-3-8.5"/><path d="M10 21h4"/></symbol>
  <symbol id="i-home" viewBox="0 0 24 24"><path d="m3 10 9-7 9 7v9.5a1.5 1.5 0 0 1-1.5 1.5H15v-7H9v7H4.5A1.5 1.5 0 0 1 3 19.5z"/></symbol>
  <symbol id="i-shorts" viewBox="0 0 24 24"><rect x="6" y="2.5" width="12" height="19" rx="6"/><path d="m10.8 8.7 4.6 3.3-4.6 3.3z" fill="currentColor" stroke="none"/></symbol>
  <symbol id="i-subs" viewBox="0 0 24 24"><path d="M4 6h16M4 12h10M4 18h10"/><path d="m17 14.5 4 2.5-4 2.5z" fill="currentColor" stroke="none"/></symbol>
  <symbol id="i-library" viewBox="0 0 24 24"><path d="M4 4h4v16H4zM10 4h4v16h-4z"/><path d="m17.2 5.2 3 14.3"/></symbol>
  <symbol id="i-history" viewBox="0 0 24 24"><path d="M3.5 12a8.5 8.5 0 1 0 2.8-6.3L3 8.5"/><path d="M3 4.5v4h4"/><path d="M12 8v5l3.2 2"/></symbol>
  <symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.2 2"/></symbol>
  <symbol id="i-thumb-up" viewBox="0 0 24 24"><path d="M7 10.5V21H4a1 1 0 0 1-1-1v-8.5a1 1 0 0 1 1-1zM7 10.5l4.3-6.6a2 2 0 0 1 3.6 1.3L14.2 9H19a2 2 0 0 1 2 2.4l-1.2 7A2 2 0 0 1 17.8 20H7"/></symbol>
  <symbol id="i-thumb-down" viewBox="0 0 24 24"><path d="M17 13.5V3h3a1 1 0 0 1 1 1v8.5a1 1 0 0 1-1 1zM17 13.5l-4.3 6.6a2 2 0 0 1-3.6-1.3l.7-3.8H5a2 2 0 0 1-2-2.4l1.2-7A2 2 0 0 1 6.2 4H17"/></symbol>
  <symbol id="i-share" viewBox="0 0 24 24"><path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M18 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/></symbol>
  <symbol id="i-download" viewBox="0 0 24 24"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 20h16"/></symbol>
  <symbol id="i-save" viewBox="0 0 24 24"><path d="M4 6h11M4 12h11M4 18h7"/><path d="M18 13v7M14.5 16.5h7"/></symbol>
  <symbol id="i-more" viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.4" fill="currentColor" stroke="none"/></symbol>
  <symbol id="i-play" viewBox="0 0 24 24"><path d="M8 4.8v14.4a1 1 0 0 0 1.5.9l11-7.2a1 1 0 0 0 0-1.8l-11-7.2A1 1 0 0 0 8 4.8z" fill="currentColor" stroke="none"/></symbol>
  <symbol id="i-pause" viewBox="0 0 24 24"><path d="M8.5 5v14M15.5 5v14" stroke-width="2.6"/></symbol>
  <symbol id="i-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></symbol>
  <symbol id="i-moon" viewBox="0 0 24 24"><path d="M21 13.2A8.6 8.6 0 0 1 10.8 3a8.6 8.6 0 1 0 10.2 10.2z"/></symbol>
  <symbol id="i-settings" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M19.2 14.8a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.2a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.6 1z"/></symbol>
  <symbol id="i-help" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.4 9.2a2.6 2.6 0 1 1 4.2 2.1c-1 .7-1.6 1.2-1.6 2.4"/><circle cx="12" cy="17" r=".9" fill="currentColor" stroke="none"/></symbol>
  <symbol id="i-feedback" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v6"/><circle cx="12" cy="16.6" r=".9" fill="currentColor" stroke="none"/></symbol>
  <symbol id="i-chevron-down" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></symbol>
  <symbol id="i-chevron-right" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></symbol>
  <symbol id="i-fire" viewBox="0 0 24 24"><path d="M12 2s5.2 5 5.2 9.2a5.2 5.2 0 0 1-10.4 0c0-1.8.8-3.2 1.6-3.9 0 0 .3 2 1.7 2.4C10.1 6.8 12 2 12 2z"/></symbol>
  <symbol id="i-music" viewBox="0 0 24 24"><path d="M9 18V5l10-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></symbol>
  <symbol id="i-gamepad" viewBox="0 0 24 24"><path d="M7 8h10a5 5 0 0 1 4.8 6.4l-.7 2.2a2.5 2.5 0 0 1-4.2 1L15 16H9l-1.9 1.6a2.5 2.5 0 0 1-4.2-1l-.7-2.2A5 5 0 0 1 7 8z"/><path d="M8 11v3M6.5 12.5h3M15.5 11.5h.01M17.5 13.5h.01"/></symbol>
  <symbol id="i-news" viewBox="0 0 24 24"><path d="M4 5h13a2 2 0 0 1 2 2v12H6a2 2 0 0 1-2-2z"/><path d="M19 9h1a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-1"/><path d="M8 9h5M8 13h5M8 17h3"/></symbol>
  <symbol id="i-graduation" viewBox="0 0 24 24"><path d="m2 9 10-5 10 5-10 5z"/><path d="M6 11v4.2c0 1.6 2.7 2.8 6 2.8s6-1.2 6-2.8V11"/><path d="M22 9v5"/></symbol>
  <symbol id="i-film" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/></symbol>
  <symbol id="i-live" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/><path d="M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8"/></symbol>
  <symbol id="i-check" viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 6.5"/></symbol>
  <symbol id="i-close" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></symbol>
  <symbol id="i-arrow-left" viewBox="0 0 24 24"><path d="M20 12H4M10 6l-6 6 6 6"/></symbol>
  <symbol id="i-sort" viewBox="0 0 24 24"><path d="M4 7h16M7 12h10M10 17h4"/></symbol>
  <symbol id="i-verified" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8.2 12.2 2.6 2.6 5-5.4"/></symbol>
  <symbol id="i-upload" viewBox="0 0 24 24"><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M4 20h16"/></symbol>
  <symbol id="i-user" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></symbol>
  <symbol id="i-flag" viewBox="0 0 24 24"><path d="M5 21V4"/><path d="M5 4h11l-1.6 3.6L16 11H5"/></symbol>
  <symbol id="i-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/></symbol>
  <symbol id="i-trash" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></symbol>
  <symbol id="i-pip" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><rect x="12" y="11" width="7" height="5" rx="1" fill="currentColor" stroke="none"/></symbol>
  <symbol id="i-volume-off" viewBox="0 0 24 24"><path d="M4 9.5v5h4l5 4v-13l-5 4z"/><path d="m16.5 9.5 5 5m0-5-5 5"/></symbol>
  <symbol id="i-code" viewBox="0 0 24 24"><path d="m8 7-5 5 5 5M16 7l5 5-5 5"/></symbol>
  <symbol id="i-bug" viewBox="0 0 24 24"><rect x="8" y="8" width="8" height="11" rx="4"/><path d="M9 8a3 3 0 0 1 6 0M3 13h5M16 13h5M4 6l4 3M20 6l-4 3M4 20l4-3M20 20l-4-3"/></symbol>
  <symbol id="i-loop" viewBox="0 0 24 24"><path d="M17 3l3 3-3 3M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 0 1-3 3H4"/></symbol>
  <symbol id="i-link" viewBox="0 0 24 24"><path d="M10 13.5a5 5 0 0 0 7.1 0l1.9-1.9a5 5 0 0 0-7.1-7.1l-1 1"/><path d="M14 10.5a5 5 0 0 0-7.1 0L5 12.4a5 5 0 0 0 7.1 7.1l1-1"/></symbol>
  <symbol id="i-fullscreen" viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/></symbol>
  <symbol id="i-volume" viewBox="0 0 24 24"><path d="M11 5 6.5 9H3v6h3.5L11 19z"/><path d="M15.2 8.8a4.6 4.6 0 0 1 0 6.4M18 6a8.4 8.4 0 0 1 0 12"/></symbol>
  <symbol id="i-eye" viewBox="0 0 24 24"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></symbol>
  <symbol id="i-pencil" viewBox="0 0 24 24"><path d="m15.5 4.5 4 4L8 20H4v-4z"/><path d="m13.5 6.5 4 4"/></symbol>
  <symbol id="i-grid" viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/></symbol>
  <symbol id="i-list" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></symbol>
</svg>
`);
