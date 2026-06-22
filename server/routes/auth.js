const express = require('express');
const router = express.Router();
const { getDb, saveDatabase } = require('../db/database');
const { RESOURCE_CONFIG } = require('../../config/game-config');

// 昵称字符过滤：仅允许中文、字母、数字
function isValidInput(str) {
  return /^[a-zA-Z0-9\u4e00-\u9fa5]{2,12}$/.test(str);
}

// 注册
router.post('/register', (req, res) => {
  const { game_id, password, nickname } = req.body;
  const db = getDb();

  if (!isValidInput(game_id)) {
    return res.json({ code: 1, msg: '游戏ID仅支持2-12位中英文数字' });
  }
  if (!isValidInput(nickname)) {
    return res.json({ code: 1, msg: '昵称仅支持2-12位中英文数字' });
  }
  if (!password || password.length < 4) {
    return res.json({ code: 1, msg: '密码至少4位' });
  }

  // 游戏ID唯一性校验
  const existing = db.exec("SELECT player_id FROM players WHERE game_id = ?", [game_id]);
  if (existing.length > 0 && existing[0].values.length > 0) {
    return res.json({ code: 1, msg: '游戏ID已被注册' });
  }

  // 新账号创建，自动发放50抽次数
  db.run(
    "INSERT INTO players (game_id, password, nickname, gold, diamond, upgrade_shard, free_draws, total_draw, total_s, current_season) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [game_id, password, nickname, RESOURCE_CONFIG.initGold, RESOURCE_CONFIG.initDiamond, RESOURCE_CONFIG.initShard, 50, 0, 0, 1]
  );

  const playerResult = db.exec("SELECT player_id, free_draws FROM players WHERE game_id = ?", [game_id]);
  const playerId = playerResult[0].values[0][0];
  const freeDraws = playerResult[0].values[0][1];

  // 初始化赛季数据
  db.run(
    "INSERT INTO player_season (player_id, season_points, defense_log, season_num) VALUES (?, ?, ?, ?)",
    [playerId, 0, '[]', 1]
  );

  // 初始化空阵容
  db.run(
    "INSERT INTO team_deck (player_id, slot1_card, slot2_card, slot3_card) VALUES (?, NULL, NULL, NULL)",
    [playerId]
  );

  saveDatabase();

  res.json({
    code: 0,
    msg: '注册成功',
    data: {
      player_id: playerId,
      game_id,
      nickname,
      free_draws: freeDraws
    }
  });
});

// 登录
router.post('/login', (req, res) => {
  const { game_id, password } = req.body;
  const db = getDb();

  if (!game_id || !password) {
    return res.json({ code: 1, msg: '请输入游戏ID和密码' });
  }

  const result = db.exec(
    "SELECT player_id, nickname, gold, diamond, upgrade_shard, free_draws, total_draw, total_s, current_season FROM players WHERE game_id = ? AND password = ?",
    [game_id, password]
  );

  if (result.length === 0 || result[0].values.length === 0) {
    return res.json({ code: 1, msg: '游戏ID或密码错误' });
  }

  const row = result[0].values[0];
  const player = {
    player_id: row[0],
    game_id,
    nickname: row[1],
    gold: row[2],
    diamond: row[3],
    upgrade_shard: row[4],
    free_draws: row[5],
    total_draw: row[6],
    total_s: row[7],
    current_season: row[8]
  };

  res.json({ code: 0, msg: '登录成功', data: player });
});

module.exports = router;
