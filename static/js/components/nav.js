function renderBottomNav(activePage) {
  const items = [
    { id: 'navHome', label: '首页', page: 'home',
      icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>' },
    { id: 'navCards', label: '卡牌', page: 'cards',
      icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/><path d="M7 8h2m2 0h2m2 0h2" stroke-width="1.5"/><circle cx="12" cy="11" r="2" fill="currentColor" opacity="0.3"/></svg>' },
    { id: 'navLineup', label: '阵容', page: 'lineup',
      icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="3"/><circle cx="5" cy="12" r="2.5"/><circle cx="19" cy="12" r="2.5"/><circle cx="8" cy="19" r="2.5"/><circle cx="16" cy="19" r="2.5"/><line x1="12" y1="8" x2="5" y2="9.5"/><line x1="12" y1="8" x2="19" y2="9.5"/><line x1="5" y1="14.5" x2="8" y2="16.5"/><line x1="19" y1="14.5" x2="16" y2="16.5"/></svg>' },
    { id: 'navBattle', label: '对战', page: 'pvp',
      icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3l-3 3 9 9-9 9 3 3 9-9z" fill="currentColor" opacity="0.25"/><path d="M18 3l3 3-9 9 9 9-3 3-9-9z" fill="currentColor" opacity="0.25"/><circle cx="12" cy="12" r="2" fill="currentColor" opacity="0.5"/></svg>' },
    { id: 'navDraw', label: '抽卡', page: 'draw',
      icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="14" height="16" rx="2" fill="currentColor" opacity="0.2"/><rect x="7" y="2" width="14" height="16" rx="2" fill="none"/><path d="M14 8l-1.5 3h3L14 14" fill="currentColor" opacity="0.4"/><circle cx="11" cy="11" r="1" fill="currentColor" opacity="0.5"/></svg>' }
  ];

  const container = document.getElementById('navContainer');
  if (!container) return;

  container.className = 'bottom-nav';
  container.innerHTML = items.map(item => {
    const isActive = item.page === activePage;
    return `<div class="nav-item${isActive ? ' active' : ''}" id="${item.id}">
      <span class="nav-icon">${item.icon}</span>
      <span class="nav-label">${item.label}</span>
      ${isActive ? '<span class="nav-dot"></span>' : ''}
    </div>`;
  }).join('');

  items.forEach(item => {
    if (item.page === activePage) return;
    const el = document.getElementById(item.id);
    if (el) {
      el.addEventListener('click', () => Router.navigate(item.page));
    }
  });
}
