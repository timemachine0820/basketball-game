const express = require('express');
const router = express.Router();
const { getDb, saveDatabase } = require('../db/database');
const { ACHIEVEMENTS } = require('../../config/game-config');

function authCheck(req, res, next) {
  const playerId = req.headers['x-player-id'];
  if (!playerId) {
    return res.json({ code: 1, msg: '未登录，请先登录' });
  }
  const db = getDb();
  const result = db.exec("SELECT player_id FROM players WHERE player_id = ?", [parseInt(playerId)]);
  if (result.length === 0 || result[0].values.length === 0) {
    return res.json({ code: 1, msg: '账号不存在' });
  }
  req.playerId = parseInt(playerId);
  next();
}

// GET /api/achievement/list - 获取全部成就及玩家进度
router.get('/list', authCheck, (req, res) => {
  const db = getDb();
  // 确保玩家所有成就行存在
  for (const ach of ACHIEVEMENTS) {
    db.run(
      "INSERT OR IGNORE INTO player_achieve (player_id, achievement_key, is_finish, reward_get) VALUES (?, ?, 0, 0)",
      [req.playerId, ach.key]
    );
  }
  saveDatabase();

  const result = db.exec(
    "SELECT achievement_key, is_finish, reward_get FROM player_achieve WHERE player_id = ?",
    [req.playerId]
  );

  const statusMap = {};
  if (result.length > 0) {
    for (const row of result[0].values) {
      statusMap[row[0]] = { is_finish: row[1], reward_get: row[2] };
    }
  }

  const list = ACHIEVEMENTS.map(ach => {
    const st = statusMap[ach.key] || { is_finish: 0, reward_get: 0 };
    return {
      key: ach.key,
      name: ach.name,
      desc: ach.desc,
      reward_type: ach.reward_type,
      reward_amount: ach.reward_amount,
      is_finish: st.is_finish,
      reward_get: st.reward_get
    };
  });

  res.json({ code: 0, data: { list } });
});

// POST /api/achievement/claim - 领取成就奖励
router.post('/claim', authCheck, (req, res) => {
  const { key } = req.body;
  if (!key) {
    return res.json({ code: 1, msg: '缺少成就标识' });
  }

  const achConfig = ACHIEVEMENTS.find(a => a.key === key);
  if (!achConfig) {
    return res.json({ code: 1, msg: '成就不存在' });
  }

  const db = getDb();

  // 查询成就状态
  const result = db.exec(
    "SELECT is_finish, reward_get FROM player_achieve WHERE player_id = ? AND achievement_key = ?",
    [req.playerId, key]
  );
  if (result.length === 0 || result[0].values.length === 0) {
    return res.json({ code: 1, msg: '成就记录不存在' });
  }

  const row = result[0].values[0];
  if (!row[0]) {
    return res.json({ code: 1, msg: '成就尚未完成' });
  }
  if (row[1]) {
    return res.json({ code: 1, msg: '奖励已领取' });
  }

  // 发放奖励
  const rewardCol = achConfig.reward_type === 'diamond' ? 'diamond' : 'free_draws';
  db.run(
    `UPDATE players SET ${rewardCol} = ${rewardCol} + ? WHERE player_id = ?`,
    [achConfig.reward_amount, req.playerId]
  );
  // 标记已领取
  db.run(
    "UPDATE player_achieve SET reward_get = 1 WHERE player_id = ? AND achievement_key = ?",
    [req.playerId, key]
  );

  saveDatabase();

  // 返回更新后的资源
  const infoResult = db.exec(
    "SELECT diamond, free_draws FROM players WHERE player_id = ?",
    [req.playerId]
  );
  const info = infoResult[0].values[0];

  res.json({
    code: 0,
    msg: '领取成功',
    data: {
      reward_type: achConfig.reward_type,
      reward_amount: achConfig.reward_amount,
      diamond: info[0],
      free_draws: info[1]
    }
  });
});

// 标记成就完成（供其他路由内部调用）
function finishAchievement(playerId, key) {
  const db = getDb();
  // 确保行存在
  db.run(
    "INSERT OR IGNORE INTO player_achieve (player_id, achievement_key, is_finish, reward_get) VALUES (?, ?, 0, 0)",
    [playerId, key]
  );
  // 标记完成（仅首次生效，已领取或已完成不受影响）
  db.run(
    "UPDATE player_achieve SET is_finish = 1 WHERE player_id = ? AND achievement_key = ? AND is_finish = 0",
    [playerId, key]
  );
}

module.exports = router;
module.exports.finishAchievement = finishAchievement;
