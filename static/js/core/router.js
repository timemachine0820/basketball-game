const Router = {
  routes: {
    home: 'home.html',
    cards: 'cards.html',
    lineup: 'lineup.html',
    draw: 'draw.html',
    pvp: 'pvp.html',
    train: 'train.html',
    league: 'league.html',
    elite: 'elite.html',
    leaderboard: 'leaderboard.html',
    achievement: 'achievement.html',
    admin: 'admin.html'
  },

  navigate(page) {
    const url = this.routes[page] || page;
    window.location.href = url;
  },

  checkAuth() {
    const playerId = localStorage.getItem('player_id');
    if (!playerId) {
      window.location.href = 'index.html';
      return false;
    }
    return true;
  },

  getPlayerId() {
    return localStorage.getItem('player_id');
  }
};
