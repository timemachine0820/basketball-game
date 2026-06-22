// 统一请求工具，携带玩家登录身份校验
const API = {
  baseURL: '',

  _getHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    const playerId = localStorage.getItem('player_id');
    if (playerId) {
      headers['X-Player-Id'] = playerId;
    }
    return headers;
  },

  async get(url) {
    const res = await fetch(this.baseURL + url, {
      method: 'GET',
      headers: this._getHeaders()
    });
    return res.json();
  },

  async post(url, data) {
    const res = await fetch(this.baseURL + url, {
      method: 'POST',
      headers: this._getHeaders(),
      body: JSON.stringify(data)
    });
    return res.json();
  }
};
