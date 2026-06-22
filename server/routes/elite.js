const express = require('express');
const router = express.Router();
const { getDb, saveDatabase } = require('../db/database');
const { RESOURCE_CONFIG, ELITE_TIERS, ALL_ROLES } = require('../../config/game-config');
const {
  calcCardFinalAttrs, simulateBattle, calcPlayerTeamAttrs
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

// GET /api/elite/opponents - 获取精英对手列表及剩余次数
router.get('/opponents', authCheck, (req, res) => {
  const db = getDb();
  const today = getTodayStr();

  const opponents = ELITE_TIERS.map(tier => {
    const cntResult = db.exec(
      "SELECT challenge_count, last_date FROM league_daily_challenges WHERE player_id = ? AND tier = ?",
      [req.playerId, tier.tier]
    );
    let usedCount = 0;
    if (cntResult.length > 0 && cntResult[0].values.length > 0) {
      const row = cntResult[0].values[0];
      if (row[1] === today) {
        usedCount = row[0];
      }
    }

    const teamResult = db.exec(
      "SELECT roster_json FROM league_ai_teams WHERE tier = ?",
      [tier.tier]
    );
    let roster = [];
    if (teamResult.length > 0 && teamResult[0].values.length > 0) {
      roster = JSON.parse(teamResult[0].values[0][0]);
    }

    return {
      tier: tier.tier,
      label: tier.label,
      dailyLimit: tier.dailyLimit,
      remaining: Math.max(0, tier.dailyLimit - usedCount),
      roster,
      reward: {
        gold: RESOURCE_CONFIG.eliteGoldReward,
        shard: RESOURCE_CONFIG.eliteShardReward,
        diamond: RESOURCE_CONFIG.eliteDiamondReward
      }
    };
  });

  res.json({ code: 0, data: { opponents } });
});

// POST /api/elite/battle - 发起精英挑战
router.post('/battle', authCheck, (req, res) => {
  const { tier } = req.body;
  const db = getDb();
  const today = getTodayStr();

  const tierConfig = ELITE_TIERS.find(t => t.tier === tier);
  if (!tierConfig) {
    return res.json({ code: 1, msg: '无效的挑战目标' });
  }

  // 检查每日挑战次数
  const cntResult = db.exec(
    "SELECT challenge_count, last_date FROM league_daily_challenges WHERE player_id = ? AND tier = ?",
    [req.playerId, tier]
  );
  let usedCount = 0;
  if (cntResult.length > 0 && cntResult[0].values.length > 0) {
    const row = cntResult[0].values[0];
    if (row[1] === today) {
      usedCount = row[0];
    }
  }
  if (usedCount >= tierConfig.dailyLimit) {
    return res.json({ code: 1, msg: '今日挑战次数已用完' });
  }

  // 校验阵容
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

  // 读取预设AI队伍
  const teamResult = db.exec(
    "SELECT team_id, roster_json FROM league_ai_teams WHERE tier = ?",
    [tier]
  );
  if (teamResult.length === 0 || teamResult[0].values.length === 0) {
    return res.json({ code: 1, msg: '挑战数据异常' });
  }
  const aiRoster = JSON.parse(teamResult[0].values[0][1]);

  // 计算双方属性
  const myAttrs = calcPlayerTeamAttrs(myCards);
  const aiAttrs = aiRoster.map(card => {
    const roleData = ALL_ROLES.find(r => r.name === card.role_name);
    if (!roleData) {
      return { threept: 10, midshot: 10, dunk: 10, rebound: 10, block: 10, speed: 10, pass: 10, steal: 10 };
    }
    return calcCardFinalAttrs(card, roleData);
  });

  // 模拟战斗
  const { attScore, defScore, attPlayers, defPlayers } = simulateBattle(myAttrs, aiAttrs);
  const isWin = attScore >= defScore;

  const allPlayerStats = [];
  for (let i = 0; i < 3; i++) {
    allPlayerStats.push({
      side: 'attacker', name: myCards[i].role_name, pos: myCards[i].pos,
      grade: myCards[i].grade, star: myCards[i].star, ...attPlayers[i]
    });
  }
  for (let i = 0; i < 3; i++) {
    allPlayerStats.push({
      side: 'defender', name: aiRoster[i].role_name, pos: aiRoster[i].pos,
      grade: aiRoster[i].grade, star: aiRoster[i].star, ...defPlayers[i]
    });
  }

  // 发放奖励（仅胜利：金币 + 钻石 + 碎片）
  let goldReward = 0;
  let diamondReward = 0;
  let shardReward = 0;
  if (isWin) {
    goldReward = RESOURCE_CONFIG.eliteGoldReward;
    diamondReward = RESOURCE_CONFIG.eliteDiamondReward;
    shardReward = RESOURCE_CONFIG.eliteShardReward;
    db.run(
      "UPDATE players SET gold = gold + ?, diamond = diamond + ?, upgrade_shard = upgrade_shard + ? WHERE player_id = ?",
      [goldReward, diamondReward, shardReward, req.playerId]
    );
  }

  // 更新每日挑战次数
  if (cntResult.length > 0 && cntResult[0].values.length > 0 && cntResult[0].values[0][1] === today) {
    db.run(
      "UPDATE league_daily_challenges SET challenge_count = challenge_count + 1 WHERE player_id = ? AND tier = ?",
      [req.playerId, tier]
    );
  } else {
    db.run(
      "INSERT OR REPLACE INTO league_daily_challenges (player_id, tier, challenge_count, last_date) VALUES (?, ?, 1, ?)",
      [req.playerId, tier, today]
    );
  }

  // 写入match_records（match_type='elite'）
  const winId = isWin ? req.playerId : 0;
  const now = Date.now();
  db.run(
    `INSERT INTO match_records (attacker_id, defender_id, match_type, win_id, att_score, def_score, player_stats_json, point_change, create_time)
     VALUES (?, NULL, 'elite', ?, ?, ?, ?, 0, ?)`,
    [req.playerId, winId, attScore, defScore, JSON.stringify(allPlayerStats), now]
  );

  saveDatabase();

  const myInfo = db.exec(
    "SELECT gold, diamond, upgrade_shard FROM players WHERE player_id = ?",
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
        name: c.role_name, pos: c.pos, grade: c.grade, star: c.star, ...attPlayers[i]
      })),
      aiCards: aiRoster.map((c, i) => ({
        name: c.role_name, pos: c.pos, grade: c.grade, star: c.star, ...defPlayers[i]
      })),
      reward: { gold: goldReward, diamond: diamondReward, shard: shardReward },
      updatedGold: updatedRow[0],
      updatedDiamond: updatedRow[1],
      updatedShard: updatedRow[2]
    }
  });
});

module.exports = router;
