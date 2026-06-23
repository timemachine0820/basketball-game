const Store = {
  _cache: {},

  set(key, value, ttlMs) {
    this._cache[key] = {
      value,
      expireAt: ttlMs ? Date.now() + ttlMs : null
    };
  },

  get(key) {
    const item = this._cache[key];
    if (!item) return null;
    if (item.expireAt && Date.now() > item.expireAt) {
      delete this._cache[key];
      return null;
    }
    return item.value;
  },

  remove(key) {
    delete this._cache[key];
  },

  clear() {
    this._cache = {};
  },

  getPlayerInfo() {
    return this.get('player_info');
  },

  setPlayerInfo(data) {
    this.set('player_info', data, 30000);
  }
};
