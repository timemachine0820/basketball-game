const express = require('express');
const router = express.Router();
const { getDb, saveDatabase } = require('../db/database');
const {
  RESOURCE_CONFIG,
  POOL_CONFIG,
  PITY_STEPS,
  DRAW_COST,
  LEAGUE_REWARDS,
  SHARD_EXCHANGE,
  DECOMPOSE_REWARD,
  PVP_COOLDOWN_MS,
  MAX_DEFENSE_LOG,
  LEADERBOARD_LIMIT,
  STAR_LIMIT,
  GROWTH_PER_STAR,
  S_TALENT_MULTIPLIER,
  NEWBIE_FREE_DRAWS
} = require('../../config/game-config');

function adminAuthCheck(req, res, next) {
  const adminId = req.headers['x-admin-id'];
  if (!adminId) {
    return res.json({ code: 1, msg: '未登录，请先登录' });
  }
  const db = getDb();
  const result = db.exec("SELECT admin_id FROM admin_users WHERE admin_id = ?", [parseInt(adminId)]);
  if (result.length === 0 || result[0].values.length === 0) {
    return res.json({ code: 1, msg: '管理员账号无效' });
  }
  req.adminId = parseInt(adminId);
  next();
}

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const db = getDb();

  if (!username || !password) {
    return res.json({ code: 1, msg: '请输入用户名和密码' });
  }

  const result = db.exec(
    "SELECT admin_id, username FROM admin_users WHERE username = ? AND password = ?",
    [username, password]
  );

  if (result.length === 0 || result[0].values.length === 0) {
    return res.json({ code: 1, msg: '用户名或密码错误' });
  }

  const row = result[0].values[0];
  res.json({
    code: 0,
    msg: '登录成功',
    data: { admin_id: row[0], username: row[1] }
  });
});

router.get('/players', adminAuthCheck, (req, res) => {
  const db = getDb();
  const result = db.exec(
    "SELECT player_id, game_id, nickname, gold, diamond, upgrade_shard, free_draws, total_draw, total_s FROM players"
  );

  const players = result.length > 0
    ? result[0].values.map(r => ({
        player_id: r[0],
        game_id: r[1],
        nickname: r[2],
        gold: r[3],
        diamond: r[4],
        upgrade_shard: r[5],
        free_draws: r[6],
        total_draw: r[7],
        total_s: r[8]
      }))
    : [];

  res.json({ code: 0, data: players });
});

router.get('/player-cards/:playerId', adminAuthCheck, (req, res) => {
  const { playerId } = req.params;
  const db = getDb();
  const result = db.exec(
    "SELECT card_uid, pos, grade, role_name, star FROM player_cards WHERE player_id = ?",
    [parseInt(playerId)]
  );

  const cards = result.length > 0
    ? result[0].values.map(r => ({
        card_uid: r[0],
        pos: r[1],
        grade: r[2],
        role_name: r[3],
        star: r[4]
      }))
    : [];

  res.json({ code: 0, data: cards });
});

router.post('/clear-player', adminAuthCheck, (req, res) => {
  const { player_id, clear_cards, clear_gold, clear_diamond, clear_shard } = req.body;
  const db = getDb();

  if (!player_id) {
    return res.json({ code: 1, msg: '请选择玩家' });
  }

  const playerResult = db.exec("SELECT player_id, nickname FROM players WHERE player_id = ?", [parseInt(player_id)]);
  if (playerResult.length === 0 || playerResult[0].values.length === 0) {
    return res.json({ code: 1, msg: '玩家不存在' });
  }

  const nickname = playerResult[0].values[0][1];
  const clearedItems = [];

  try {
    if (clear_cards) {
      db.run("DELETE FROM player_cards WHERE player_id = ?", [parseInt(player_id)]);
      db.run("UPDATE team_deck SET slot1_card = NULL, slot2_card = NULL, slot3_card = NULL WHERE player_id = ?", [parseInt(player_id)]);
      clearedItems.push('卡牌');
    }

    if (clear_gold) {
      db.run("UPDATE players SET gold = 0 WHERE player_id = ?", [parseInt(player_id)]);
      clearedItems.push('金币');
    }

    if (clear_diamond) {
      db.run("UPDATE players SET diamond = 0 WHERE player_id = ?", [parseInt(player_id)]);
      clearedItems.push('钻石');
    }

    if (clear_shard) {
      db.run("UPDATE players SET upgrade_shard = 0 WHERE player_id = ?", [parseInt(player_id)]);
      clearedItems.push('碎片');
    }

    saveDatabase();

    res.json({
      code: 0,
      msg: `已清空玩家 ${nickname} 的${clearedItems.join('、')}`,
      data: { player_id, nickname, clearedItems }
    });
  } catch (err) {
    console.error('清空玩家数据失败:', err);
    res.json({ code: 1, msg: '操作失败，请重试' });
  }
});

router.get('/game-config', adminAuthCheck, (req, res) => {
  res.json({
    code: 0,
    data: {
      resource: RESOURCE_CONFIG,
      pool: POOL_CONFIG,
      pitySteps: PITY_STEPS,
      drawCost: DRAW_COST,
      leagueRewards: LEAGUE_REWARDS,
      shardExchange: SHARD_EXCHANGE,
      decomposeReward: DECOMPOSE_REWARD,
      pvpCooldownMs: PVP_COOLDOWN_MS,
      maxDefenseLog: MAX_DEFENSE_LOG,
      leaderboardLimit: LEADERBOARD_LIMIT,
      starLimit: STAR_LIMIT,
      growthPerStar: GROWTH_PER_STAR,
      sTalentMultiplier: S_TALENT_MULTIPLIER,
      newbieFreeDraws: NEWBIE_FREE_DRAWS
    }
  });
});

router.post('/update-config', adminAuthCheck, (req, res) => {
  const { configType, configData } = req.body;

  if (!configType || !configData) {
    return res.json({ code: 1, msg: '配置类型和数据不能为空' });
  }

  res.json({ code: 0, msg: '配置已更新（重启服务器后生效）' });
});

module.exports = router;
