function renderBottomNav(activePage) {
  const items = [
    { id: 'navHome', icon: '&#9750;', label: '主页', page: 'home' },
    { id: 'navCards', icon: '&#9830;', label: '卡牌', page: 'cards' },
    { id: 'navDraw', icon: '&#9733;', label: '抽卡', page: 'draw' },
    { id: 'navBattle', icon: '&#9876;', label: '对战', page: 'pvp' },
    { id: 'navLineup', icon: '&#9813;', label: '阵容', page: 'lineup' }
  ];

  const container = document.getElementById('navContainer');
  if (!container) return;

  container.className = 'bottom-nav';
  container.innerHTML = items.map(item => `
    <div class="nav-item${item.page === activePage ? ' active' : ''}" id="${item.id}">
      <span class="nav-icon">${item.icon}</span>
      <span>${item.label}</span>
    </div>
  `).join('');

  items.forEach(item => {
    if (item.page === activePage) return;
    const el = document.getElementById(item.id);
    if (el) {
      el.addEventListener('click', () => Router.navigate(item.page));
    }
  });
}
