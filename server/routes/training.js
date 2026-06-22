const express = require('express');
const router = express.Router();
const { getDb, saveDatabase } = require('../db/database');
const { RESOURCE_CONFIG } = require('../../config/game-config');
const {
  calcCardFinalAttrs, calcTeamPower, simulateBattle,
  generateAITeam, calcPlayerTeamAttrs
} = require('../battle-engine');

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

function getTodayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// 日常训练金币随机：偏低于150
function randomTrainGold() {
  const min = RESOURCE_CONFIG.trainGoldMin;
  const max = RESOURCE_CONFIG.trainGoldMax;
  const bias = RESOURCE_CONFIG.trainGoldBias;
  // 70%概率落在min~bias之间，30%概率落在bias~max之间
  if (Math.random() < 0.7) {
    return Math.floor(Math.random() * (bias - min + 1)) + min;
  }
  return Math.floor(Math.random() * (max - bias + 1)) + bias;
}

// GET /api/training/status - 获取训练剩余次数
router.get('/status', authCheck, (req, res) => {
  const db = getDb();
  const today = getTodayStr();
  const cntResult = db.exec(
    "SELECT challenge_count, last_date FROM league_daily_challenges WHERE player_id = ? AND tier = 'daily_train'",
    [req.playerId]
  );
  let usedCount = 0;
  if (cntResult.length > 0 && cntResult[0].values.length > 0) {
    const row = cntResult[0].values[0];
    if (row[1] === today) {
      usedCount = row[0];
    }
  }
  res.json({
    code: 0,
    data: {
      dailyLimit: RESOURCE_CONFIG.trainDailyLimit,
      used: usedCount,
      remaining: Math.max(0, RESOURCE_CONFIG.trainDailyLimit - usedCount)
    }
  });
});

// POST /api/training/battle - 发起日常训练对战
router.post('/battle', authCheck, (req, res) => {
  const db = getDb();

  // 检查每日训练次数
  const today = getTodayStr();
  const cntResult = db.exec(
    "SELECT challenge_count, last_date FROM league_daily_challenges WHERE player_id = ? AND tier = 'daily_train'",
    [req.playerId]
  );
  let usedCount = 0;
  if (cntResult.length > 0 && cntResult[0].values.length > 0) {
    const row = cntResult[0].values[0];
    if (row[1] === today) {
      usedCount = row[0];
    }
  }
  if (usedCount >= RESOURCE_CONFIG.trainDailyLimit) {
    return res.json({ code: 1, msg: '今日训练次数已用完' });
  }

  // 1. 读取出战阵容
  const deckResult = db.exec(
    "SELECT slot1_card, slot2_card, slot3_card FROM team_deck WHERE player_id = ?",
    [req.playerId]
  );
  if (deckResult.length === 0 || deckResult[0].values.length === 0) {
    return res.json({ code: 1, msg: '未设置出战阵容' });
  }
  const deck = deckResult[0].values[0];
  if (!deck[0] || !deck[1] || !deck[2]) {
    return res.json({ code: 1, msg: '阵容未填满，无法对战' });
  }

  // 2. 读取3张卡牌详细信息
  const uids = [deck[0], deck[1], deck[2]];
  const cardResult = db.exec(
    `SELECT card_uid, pos, grade, role_name, star FROM player_cards WHERE player_id = ? AND card_uid IN (${uids.map(() => '?').join(',')})`,
    [req.playerId, ...uids]
  );
  if (cardResult.length === 0 || cardResult[0].values.length !== 3) {
    return res.json({ code: 1, msg: '阵容卡牌数据异常' });
  }
  const myCards = cardResult[0].values.map(r => ({
    card_uid: r[0], pos: r[1], grade: r[2], role_name: r[3], star: r[4]
  }));

  // 3. 计算我方属性和战力
  const myAttrs = calcPlayerTeamAttrs(myCards);
  const myPower = calcTeamPower(myAttrs);

  // 4. 动态生成AI对手（不入库）
  const aiTeam = generateAITeam(myPower);
  const aiAttrs = aiTeam.map(card => {
    return calcCardFinalAttrs({ grade: card.grade, role_name: card.role_name, star: card.star }, card.roleData);
  });

  // 5. 模拟战斗
  const { attScore, defScore, attPlayers, defPlayers } = simulateBattle(myAttrs, aiAttrs);
  const isWin = attScore >= defScore;

  // 组装完整球员数据
  const allPlayerStats = [];
  for (let i = 0; i < 3; i++) {
    allPlayerStats.push({
      side: 'attacker',
      name: myCards[i].role_name,
      pos: myCards[i].pos,
      grade: myCards[i].grade,
      star: myCards[i].star,
      ...attPlayers[i]
    });
  }
  for (let i = 0; i < 3; i++) {
    allPlayerStats.push({
      side: 'defender',
      name: aiTeam[i].role_name,
      pos: aiTeam[i].pos,
      grade: aiTeam[i].grade,
      star: aiTeam[i].star,
      ...defPlayers[i]
    });
  }

  // 8. 发放奖励（仅胜利：随机金币，无碎片）
  let goldReward = 0;
  if (isWin) {
    goldReward = randomTrainGold();
    db.run(
      "UPDATE players SET gold = gold + ? WHERE player_id = ?",
      [goldReward, req.playerId]
    );
  }

  // 更新每日训练次数
  if (cntResult.length > 0 && cntResult[0].values.length > 0 && cntResult[0].values[0][1] === today) {
    db.run(
      "UPDATE league_daily_challenges SET challenge_count = challenge_count + 1 WHERE player_id = ? AND tier = 'daily_train'",
      [req.playerId]
    );
  } else {
    db.run(
      "INSERT OR REPLACE INTO league_daily_challenges (player_id, tier, challenge_count, last_date) VALUES (?, ?, 1, ?)",
      [req.playerId, 'daily_train', today]
    );
  }

  // 9. 写入match_records
  const winId = isWin ? req.playerId : 0;
  const now = Date.now();
  db.run(
    `INSERT INTO match_records (attacker_id, defender_id, match_type, win_id, att_score, def_score, player_stats_json, point_change, create_time)
     VALUES (?, NULL, 'train', ?, ?, ?, ?, 0, ?)`,
    [req.playerId, winId, attScore, defScore, JSON.stringify(allPlayerStats), now]
  );

  saveDatabase();

  // 10. 返回结果
  const myInfo = db.exec(
    "SELECT gold, upgrade_shard FROM players WHERE player_id = ?",
    [req.playerId]
  );
  const updatedRow = myInfo[0].values[0];

  res.json({
    code: 0,
    data: {
      win: isWin,
      attScore,
      defScore,
      myCards: myCards.map((c, i) => ({
        name: c.role_name,
        pos: c.pos,
        grade: c.grade,
        star: c.star,
        ...attPlayers[i]
    })),
      aiCards: aiTeam.map((c, i) => ({
        name: c.role_name,
        pos: c.pos,
        grade: c.grade,
        star: c.star,
        ...defPlayers[i]
      })),
      reward: { gold: goldReward },
      updatedGold: updatedRow[0],
      updatedShard: updatedRow[1]
    }
  });
});

module.exports = router;
