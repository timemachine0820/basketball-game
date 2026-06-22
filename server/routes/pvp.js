const express = require('express');
const router = express.Router();
const { getDb, saveDatabase } = require('../db/database');
const { RESOURCE_CONFIG, PVP_COOLDOWN_MS, MAX_DEFENSE_LOG, LEADERBOARD_LIMIT, RANK_TIERS, RANKED_WIN_POINTS, RANKED_LOSE_POINTS } = require('../../config/game-config');
const {
  calcCardFinalAttrs, calcTeamPower, simulateBattle,
  calcPlayerTeamAttrs, ALL_ROLES
} = require('../battle-engine');
const { finishAchievement } = require('./achievement');

function getTodayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function getPvpDailyCount(db, playerId) {
  const today = getTodayStr();
  const result = db.exec(
    "SELECT challenge_count, last_date FROM league_daily_challenges WHERE player_id = ? AND tier = 'pvp_daily'",
    [playerId]
  );
  if (result.length > 0 && result[0].values.length > 0) {
    const row = result[0].values[0];
    if (row[1] === today) return row[0];
  }
  return 0;
}

function incrementPvpDailyCount(db, playerId) {
  const today = getTodayStr();
  const result = db.exec(
    "SELECT challenge_count, last_date FROM league_daily_challenges WHERE player_id = ? AND tier = 'pvp_daily'",
    [playerId]
  );
  if (result.length > 0 && result[0].values.length > 0 && result[0].values[0][1] === today) {
    db.run(
      "UPDATE league_daily_challenges SET challenge_count = challenge_count + 1 WHERE player_id = ? AND tier = 'pvp_daily'",
      [playerId]
    );
  } else {
    db.run(
      "INSERT OR REPLACE INTO league_daily_challenges (player_id, tier, challenge_count, last_date) VALUES (?, ?, 1, ?)",
      [playerId, 'pvp_daily', today]
    );
  }
}

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

function getRankTier(points) {
  let result = RANK_TIERS[0];
  for (const tier of RANK_TIERS) {
    if (points >= tier.minPoints) result = tier;
  }
  return result;
}

// GET /api/pvp/opponents - 随机抓取其他玩家阵容作为对手
router.get('/opponents', authCheck, (req, res) => {
  const db = getDb();
  const mode = req.query.mode || 'casual';

  // 读取当前玩家阵容完整性
  const deckResult = db.exec(
    "SELECT slot1_card, slot2_card, slot3_card FROM team_deck WHERE player_id = ?",
    [req.playerId]
  );
  if (deckResult.length === 0 || deckResult[0].values.length === 0) {
    return res.json({ code: 1, msg: '请先设置出战阵容' });
  }
  const deck = deckResult[0].values[0];
  if (!deck[0] || !deck[1] || !deck[2]) {
    return res.json({ code: 1, msg: '阵容未填满，无法进行PVP' });
  }

  let cooldownRemain = 0;
  if (mode === 'ranked') {
    const cooldownResult = db.exec(
      "SELECT last_pvp_time FROM players WHERE player_id = ?",
      [req.playerId]
    );
    if (cooldownResult.length > 0 && cooldownResult[0].values.length > 0) {
      const lastTime = cooldownResult[0].values[0][0] || 0;
      const elapsed = Date.now() - lastTime;
      if (elapsed < PVP_COOLDOWN_MS) {
        cooldownRemain = Math.ceil((PVP_COOLDOWN_MS - elapsed) / 1000);
      }
    }
  }

  // 随机抓取有完整阵容的其他玩家（排除自己）
  const candidatesResult = db.exec(
    `SELECT td.player_id, p.nickname
     FROM team_deck td
     JOIN players p ON p.player_id = td.player_id
     WHERE td.player_id != ?
       AND td.slot1_card IS NOT NULL AND td.slot2_card IS NOT NULL AND td.slot3_card IS NOT NULL
     ORDER BY p.nickname`,
    [req.playerId]
  );

  const mySeasonResult = db.exec("SELECT season_points FROM player_season WHERE player_id = ?", [req.playerId]);
  const myPointsForMatch = (mySeasonResult.length > 0 && mySeasonResult[0].values.length > 0) ? mySeasonResult[0].values[0][0] : 0;

  const opponents = [];
  if (candidatesResult.length > 0) {
    for (const row of candidatesResult[0].values) {
      const pid = row[0];
      const nickname = row[1];

      const dResult = db.exec(
        "SELECT slot1_card, slot2_card, slot3_card FROM team_deck WHERE player_id = ?",
        [pid]
      );
      if (dResult.length === 0 || dResult[0].values.length === 0) continue;
      const dDeck = dResult[0].values[0];

      const cardUids = [dDeck[0], dDeck[1], dDeck[2]];
      const cardsResult = db.exec(
        `SELECT card_uid, pos, grade, role_name, star FROM player_cards
         WHERE player_id = ? AND card_uid IN (${cardUids.map(() => '?').join(',')})`,
        [pid, ...cardUids]
      );
      if (cardsResult.length === 0 || cardsResult[0].values.length !== 3) continue;

      const cards = cardsResult[0].values.map(r => ({
        card_uid: r[0], pos: r[1], grade: r[2], role_name: r[3], star: r[4]
      }));

      const attrs = calcPlayerTeamAttrs(cards);
      const power = calcTeamPower(attrs);

      const oppSeasonResult = db.exec("SELECT season_points FROM player_season WHERE player_id = ?", [pid]);
      const oppPoints = (oppSeasonResult.length > 0 && oppSeasonResult[0].values.length > 0) ? oppSeasonResult[0].values[0][0] : 0;
      const oppRank = getRankTier(oppPoints);

      opponents.push({
        player_id: pid,
        nickname,
        cards,
        teamPower: Math.round(power),
        rankLabel: oppRank.label,
        rankColor: oppRank.color,
        seasonPoints: oppPoints
      });
    }
  }

  let filteredOpponents = opponents;
  if (mode === 'ranked' && opponents.length > 3) {
    filteredOpponents = opponents
      .map(o => ({ ...o, scoreDiff: Math.abs((o.seasonPoints || 0) - myPointsForMatch) }))
      .sort((a, b) => a.scoreDiff - b.scoreDiff)
      .slice(0, 5);
  }

  // 读取玩家赛季积分
  const seasonResult = db.exec(
    "SELECT season_points FROM player_season WHERE player_id = ?",
    [req.playerId]
  );
  const myPoints = (seasonResult.length > 0 && seasonResult[0].values.length > 0)
    ? seasonResult[0].values[0][0] : 0;
  const myRank = getRankTier(myPoints);

  // 读取今日PVP剩余次数
  const dailyUsed = getPvpDailyCount(db, req.playerId);
  const dailyRemaining = Math.max(0, RESOURCE_CONFIG.pvpDailyLimit - dailyUsed);

  const rankedUsed = getPvpDailyCount(db, req.playerId);
  const rankedRemaining = Math.max(0, RESOURCE_CONFIG.pvpDailyLimit - rankedUsed);

  res.json({
    code: 0,
    data: {
      opponents: filteredOpponents,
      cooldownRemain,
      myPoints,
      myRank,
      dailyRemaining,
      dailyLimit: RESOURCE_CONFIG.pvpDailyLimit,
      rankedRemaining
    }
  });
});

// POST /api/pvp/battle - 发起PVP对战
router.post('/battle', authCheck, (req, res) => {
  const { target_player_id, mode } = req.body;
  const battleMode = mode || 'casual';
  if (!target_player_id) {
    return res.json({ code: 1, msg: '请选择挑战对手' });
  }
  if (parseInt(target_player_id) === req.playerId) {
    return res.json({ code: 1, msg: '不能挑战自己' });
  }

  const db = getDb();
  const now = Date.now();

  if (battleMode === 'ranked') {
    // 1. 检查冷却
    const cooldownResult = db.exec(
      "SELECT last_pvp_time FROM players WHERE player_id = ?",
      [req.playerId]
    );
    if (cooldownResult.length > 0 && cooldownResult[0].values.length > 0) {
      const lastTime = cooldownResult[0].values[0][0] || 0;
      const elapsed = now - lastTime;
      if (elapsed < PVP_COOLDOWN_MS) {
        const remain = Math.ceil((PVP_COOLDOWN_MS - elapsed) / 1000);
        return res.json({ code: 1, msg: `冷却中，还需${remain}秒` });
      }
    }

    // 1.5 检查每日PVP次数
    const dailyUsed = getPvpDailyCount(db, req.playerId);
    if (dailyUsed >= RESOURCE_CONFIG.pvpDailyLimit) {
      return res.json({ code: 1, msg: '今日PVP次数已用完' });
    }
  }

  // 2. 读取我方阵容
  const deckResult = db.exec(
    "SELECT slot1_card, slot2_card, slot3_card FROM team_deck WHERE player_id = ?",
    [req.playerId]
  );
  if (deckResult.length === 0 || deckResult[0].values.length === 0) {
    return res.json({ code: 1, msg: '未设置出战阵容' });
  }
  const myDeck = deckResult[0].values[0];
  if (!myDeck[0] || !myDeck[1] || !myDeck[2]) {
    return res.json({ code: 1, msg: '阵容未填满，无法对战' });
  }

  const myUids = [myDeck[0], myDeck[1], myDeck[2]];
  const myCardsResult = db.exec(
    `SELECT card_uid, pos, grade, role_name, star FROM player_cards
     WHERE player_id = ? AND card_uid IN (${myUids.map(() => '?').join(',')})`,
    [req.playerId, ...myUids]
  );
  if (myCardsResult.length === 0 || myCardsResult[0].values.length !== 3) {
    return res.json({ code: 1, msg: '阵容卡牌数据异常' });
  }
  const myCards = myCardsResult[0].values.map(r => ({
    card_uid: r[0], pos: r[1], grade: r[2], role_name: r[3], star: r[4]
  }));

  // 3. 读取对手阵容
  const defPid = parseInt(target_player_id);
  const defDeckResult = db.exec(
    "SELECT slot1_card, slot2_card, slot3_card FROM team_deck WHERE player_id = ?",
    [defPid]
  );
  if (defDeckResult.length === 0 || defDeckResult[0].values.length === 0) {
    return res.json({ code: 1, msg: '对手阵容不存在' });
  }
  const defDeck = defDeckResult[0].values[0];
  if (!defDeck[0] || !defDeck[1] || !defDeck[2]) {
    return res.json({ code: 1, msg: '对手阵容不完整' });
  }

  const defUids = [defDeck[0], defDeck[1], defDeck[2]];
  const defCardsResult = db.exec(
    `SELECT card_uid, pos, grade, role_name, star FROM player_cards
     WHERE player_id = ? AND card_uid IN (${defUids.map(() => '?').join(',')})`,
    [defPid, ...defUids]
  );
  if (defCardsResult.length === 0 || defCardsResult[0].values.length !== 3) {
    return res.json({ code: 1, msg: '对手卡牌数据异常' });
  }
  const defCards = defCardsResult[0].values.map(r => ({
    card_uid: r[0], pos: r[1], grade: r[2], role_name: r[3], star: r[4]
  }));

  // 4. 计算双方属性
  const myAttrs = calcPlayerTeamAttrs(myCards);
  const defAttrs = calcPlayerTeamAttrs(defCards);

  // 5. 模拟战斗（进攻方=myCards）
  const { attScore, defScore, attPlayers, defPlayers } = simulateBattle(myAttrs, defAttrs);
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
      side: 'defender', name: defCards[i].role_name, pos: defCards[i].pos,
      grade: defCards[i].grade, star: defCards[i].star, ...defPlayers[i]
    });
  }

  // 7. 积分变动 + 钻石奖励
  let pointChange = 0;
  let diamondReward = 0;
  const matchType = battleMode === 'ranked' ? 'pvp_ranked' : 'pvp_casual';

  if (battleMode === 'ranked') {
    if (isWin) {
      pointChange = RANKED_WIN_POINTS;
      diamondReward = RESOURCE_CONFIG.pvpDiamondWin;
    } else {
      pointChange = -RANKED_LOSE_POINTS;
    }
  }

  // 8. 写入 match_records
  const winId = isWin ? req.playerId : defPid;
  db.run(
    `INSERT INTO match_records (attacker_id, defender_id, match_type, win_id, att_score, def_score, player_stats_json, point_change, create_time)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.playerId, defPid, matchType, winId, attScore, defScore, JSON.stringify(allPlayerStats), pointChange, now]
  );

  // 更新进攻方PVP冷却时间和积分 + 每日次数
  db.run(
    "UPDATE players SET last_pvp_time = ? WHERE player_id = ?",
    [now, req.playerId]
  );
  if (battleMode === 'ranked') {
    incrementPvpDailyCount(db, req.playerId);
    if (isWin) {
      db.run(
        "UPDATE player_season SET season_points = season_points + ? WHERE player_id = ?",
        [pointChange, req.playerId]
      );
      db.run(
        "UPDATE players SET diamond = diamond + ? WHERE player_id = ?",
        [diamondReward, req.playerId]
      );
      // 首胜真人成就检测
      finishAchievement(req.playerId, 'first_pvp_win');
    } else {
      const curSeasonResult = db.exec("SELECT season_points FROM player_season WHERE player_id = ?", [req.playerId]);
      const curPoints = (curSeasonResult.length > 0 && curSeasonResult[0].values.length > 0) ? curSeasonResult[0].values[0][0] : 0;
      const newPoints = Math.max(0, curPoints + pointChange);
      db.run(
        "UPDATE player_season SET season_points = ? WHERE player_id = ?",
        [newPoints, req.playerId]
      );
    }
  }

  // 10. 写入防守方防守日志（保留最近20条）
  // 获取match_id用于日志引用
  const matchIdResult = db.exec("SELECT last_insert_rowid()");
  const matchId = (matchIdResult.length > 0 && matchIdResult[0].values.length > 0)
    ? matchIdResult[0].values[0][0] : 0;

  const defNicknameResult = db.exec(
    "SELECT nickname FROM players WHERE player_id = ?", [req.playerId]
  );
  const attNickname = (defNicknameResult.length > 0 && defNicknameResult[0].values.length > 0)
    ? defNicknameResult[0].values[0][0] : '未知';

  const defSeasonResult = db.exec(
    "SELECT defense_log FROM player_season WHERE player_id = ?", [defPid]
  );
  let defenseLogs = [];
  if (defSeasonResult.length > 0 && defSeasonResult[0].values.length > 0) {
    const raw = defSeasonResult[0].values[0][0];
    if (raw) {
      try { defenseLogs = JSON.parse(raw); } catch (e) { defenseLogs = []; }
    }
  }

  const defenderWins = !isWin;
  const logEntry = {
    match_id: matchId,
    attacker_id: req.playerId,
    attacker_name: attNickname,
    attacker_cards: myCards.map(c => ({ name: c.role_name, pos: c.pos, grade: c.grade, star: c.star })),
    defender_cards: defCards.map(c => ({ name: c.role_name, pos: c.pos, grade: c.grade, star: c.star })),
    att_score: attScore,
    def_score: defScore,
    result: defenderWins ? 'win' : 'lose',
    time: now
  };
  defenseLogs.unshift(logEntry);
  if (defenseLogs.length > MAX_DEFENSE_LOG) {
    defenseLogs = defenseLogs.slice(0, MAX_DEFENSE_LOG);
  }

  // 防守方season记录可能不存在
  const defSeasonExists = db.exec(
    "SELECT 1 FROM player_season WHERE player_id = ?", [defPid]
  );
  if (defSeasonExists.length > 0 && defSeasonExists[0].values.length > 0) {
    db.run(
      "UPDATE player_season SET defense_log = ? WHERE player_id = ?",
      [JSON.stringify(defenseLogs), defPid]
    );
  }

  // 获取更新后的玩家信息
  const myInfo = db.exec(
    "SELECT season_points FROM player_season WHERE player_id = ?", [req.playerId]
  );
  const updatedPoints = (myInfo.length > 0 && myInfo[0].values.length > 0)
    ? myInfo[0].values[0][0] : 0;

  const myPlayerInfo = db.exec(
    "SELECT diamond FROM players WHERE player_id = ?", [req.playerId]
  );
  const updatedDiamond = (myPlayerInfo.length > 0 && myPlayerInfo[0].values.length > 0)
    ? myPlayerInfo[0].values[0][0] : 0;

  const defNicknameForRes = db.exec(
    "SELECT nickname FROM players WHERE player_id = ?", [defPid]
  );
  const defNickname = (defNicknameForRes.length > 0 && defNicknameForRes[0].values.length > 0)
    ? defNicknameForRes[0].values[0][0] : '未知';

  saveDatabase();

  res.json({
    code: 0,
    data: {
      mode: battleMode,
      win: isWin,
      attScore,
      defScore,
      pointChange,
      diamondReward,
      myCards: myCards.map((c, i) => ({
        name: c.role_name, pos: c.pos, grade: c.grade, star: c.star, ...attPlayers[i]
      })),
      defCards: defCards.map((c, i) => ({
        name: c.role_name, pos: c.pos, grade: c.grade, star: c.star, ...defPlayers[i]
      })),
      defenderNickname: defNickname,
      updatedPoints,
      updatedDiamond
    }
  });
});

// POST /api/pvp/ranked-match - 排位赛自动匹配对战
router.post('/ranked-match', authCheck, (req, res) => {
  const db = getDb();
  const now = Date.now();

  const cooldownResult = db.exec(
    "SELECT last_pvp_time FROM players WHERE player_id = ?",
    [req.playerId]
  );
  if (cooldownResult.length > 0 && cooldownResult[0].values.length > 0) {
    const lastTime = cooldownResult[0].values[0][0] || 0;
    const elapsed = now - lastTime;
    if (elapsed < PVP_COOLDOWN_MS) {
      const remain = Math.ceil((PVP_COOLDOWN_MS - elapsed) / 1000);
      return res.json({ code: 1, msg: `冷却中，还需${remain}秒` });
    }
  }

  const dailyUsed = getPvpDailyCount(db, req.playerId);
  if (dailyUsed >= RESOURCE_CONFIG.pvpDailyLimit) {
    return res.json({ code: 1, msg: '今日PVP次数已用完' });
  }

  const deckResult = db.exec(
    "SELECT slot1_card, slot2_card, slot3_card FROM team_deck WHERE player_id = ?",
    [req.playerId]
  );
  if (deckResult.length === 0 || deckResult[0].values.length === 0) {
    return res.json({ code: 1, msg: '未设置出战阵容' });
  }
  const myDeck = deckResult[0].values[0];
  if (!myDeck[0] || !myDeck[1] || !myDeck[2]) {
    return res.json({ code: 1, msg: '阵容未填满，无法对战' });
  }

  const mySeasonResult = db.exec("SELECT season_points FROM player_season WHERE player_id = ?", [req.playerId]);
  const myPoints = (mySeasonResult.length > 0 && mySeasonResult[0].values.length > 0) ? mySeasonResult[0].values[0][0] : 0;

  const candidatesResult = db.exec(
    `SELECT td.player_id, p.nickname
     FROM team_deck td
     JOIN players p ON p.player_id = td.player_id
     WHERE td.player_id != ?
       AND td.slot1_card IS NOT NULL AND td.slot2_card IS NOT NULL AND td.slot3_card IS NOT NULL`,
    [req.playerId]
  );

  if (candidatesResult.length === 0 || candidatesResult[0].values.length === 0) {
    return res.json({ code: 1, msg: '暂无可用对手，请稍后再试' });
  }

  const candidates = candidatesResult[0].values.map(row => {
    const pid = row[0];
    const oppSeasonResult = db.exec("SELECT season_points FROM player_season WHERE player_id = ?", [pid]);
    const oppPoints = (oppSeasonResult.length > 0 && oppSeasonResult[0].values.length > 0) ? oppSeasonResult[0].values[0][0] : 0;
    return { pid, nickname: row[1], points: oppPoints, diff: Math.abs(oppPoints - myPoints) };
  });

  candidates.sort((a, b) => a.diff - b.diff);
  const topCandidates = candidates.slice(0, Math.min(5, candidates.length));
  const selected = topCandidates[Math.floor(Math.random() * topCandidates.length)];

  const myUids = [myDeck[0], myDeck[1], myDeck[2]];
  const myCardsResult = db.exec(
    `SELECT card_uid, pos, grade, role_name, star FROM player_cards
     WHERE player_id = ? AND card_uid IN (${myUids.map(() => '?').join(',')})`,
    [req.playerId, ...myUids]
  );
  if (myCardsResult.length === 0 || myCardsResult[0].values.length !== 3) {
    return res.json({ code: 1, msg: '阵容卡牌数据异常' });
  }
  const myCards = myCardsResult[0].values.map(r => ({
    card_uid: r[0], pos: r[1], grade: r[2], role_name: r[3], star: r[4]
  }));

  const defPid = selected.pid;
  const defDeckResult = db.exec(
    "SELECT slot1_card, slot2_card, slot3_card FROM team_deck WHERE player_id = ?",
    [defPid]
  );
  if (defDeckResult.length === 0 || defDeckResult[0].values.length === 0) {
    return res.json({ code: 1, msg: '对手阵容不存在' });
  }
  const defDeck = defDeckResult[0].values[0];
  const defUids = [defDeck[0], defDeck[1], defDeck[2]];
  const defCardsResult = db.exec(
    `SELECT card_uid, pos, grade, role_name, star FROM player_cards
     WHERE player_id = ? AND card_uid IN (${defUids.map(() => '?').join(',')})`,
    [defPid, ...defUids]
  );
  if (defCardsResult.length === 0 || defCardsResult[0].values.length !== 3) {
    return res.json({ code: 1, msg: '对手卡牌数据异常' });
  }
  const defCards = defCardsResult[0].values.map(r => ({
    card_uid: r[0], pos: r[1], grade: r[2], role_name: r[3], star: r[4]
  }));

  const myAttrs = calcPlayerTeamAttrs(myCards);
  const defAttrs = calcPlayerTeamAttrs(defCards);
  const { attScore, defScore, attPlayers, defPlayers } = simulateBattle(myAttrs, defAttrs);
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
      side: 'defender', name: defCards[i].role_name, pos: defCards[i].pos,
      grade: defCards[i].grade, star: defCards[i].star, ...defPlayers[i]
    });
  }

  let pointChange = 0;
  let diamondReward = 0;
  if (isWin) {
    pointChange = RANKED_WIN_POINTS;
    diamondReward = RESOURCE_CONFIG.pvpDiamondWin;
  } else {
    pointChange = -RANKED_LOSE_POINTS;
  }

  const winId = isWin ? req.playerId : defPid;
  db.run(
    `INSERT INTO match_records (attacker_id, defender_id, match_type, win_id, att_score, def_score, player_stats_json, point_change, create_time)
     VALUES (?, ?, 'pvp_ranked', ?, ?, ?, ?, ?, ?)`,
    [req.playerId, defPid, winId, attScore, defScore, JSON.stringify(allPlayerStats), pointChange, now]
  );

  db.run("UPDATE players SET last_pvp_time = ? WHERE player_id = ?", [now, req.playerId]);
  incrementPvpDailyCount(db, req.playerId);

  if (isWin) {
    db.run("UPDATE player_season SET season_points = season_points + ? WHERE player_id = ?", [pointChange, req.playerId]);
    db.run("UPDATE players SET diamond = diamond + ? WHERE player_id = ?", [diamondReward, req.playerId]);
    finishAchievement(req.playerId, 'first_pvp_win');
  } else {
    const curSeasonResult = db.exec("SELECT season_points FROM player_season WHERE player_id = ?", [req.playerId]);
    const curPoints = (curSeasonResult.length > 0 && curSeasonResult[0].values.length > 0) ? curSeasonResult[0].values[0][0] : 0;
    const newPoints = Math.max(0, curPoints + pointChange);
    db.run("UPDATE player_season SET season_points = ? WHERE player_id = ?", [newPoints, req.playerId]);
  }

  const matchIdResult = db.exec("SELECT last_insert_rowid()");
  const matchId = (matchIdResult.length > 0 && matchIdResult[0].values.length > 0) ? matchIdResult[0].values[0][0] : 0;

  const attNicknameResult = db.exec("SELECT nickname FROM players WHERE player_id = ?", [req.playerId]);
  const attNickname = (attNicknameResult.length > 0 && attNicknameResult[0].values.length > 0) ? attNicknameResult[0].values[0][0] : '未知';

  const defSeasonResult = db.exec("SELECT defense_log FROM player_season WHERE player_id = ?", [defPid]);
  let defenseLogs = [];
  if (defSeasonResult.length > 0 && defSeasonResult[0].values.length > 0) {
    const raw = defSeasonResult[0].values[0][0];
    if (raw) { try { defenseLogs = JSON.parse(raw); } catch (e) { defenseLogs = []; } }
  }
  defenseLogs.unshift({
    match_id: matchId, attacker_id: req.playerId, attacker_name: attNickname,
    attacker_cards: myCards.map(c => ({ name: c.role_name, pos: c.pos, grade: c.grade, star: c.star })),
    defender_cards: defCards.map(c => ({ name: c.role_name, pos: c.pos, grade: c.grade, star: c.star })),
    att_score: attScore, def_score: defScore, result: !isWin ? 'win' : 'lose', time: now
  });
  if (defenseLogs.length > MAX_DEFENSE_LOG) defenseLogs = defenseLogs.slice(0, MAX_DEFENSE_LOG);

  const defSeasonExists = db.exec("SELECT 1 FROM player_season WHERE player_id = ?", [defPid]);
  if (defSeasonExists.length > 0 && defSeasonExists[0].values.length > 0) {
    db.run("UPDATE player_season SET defense_log = ? WHERE player_id = ?", [JSON.stringify(defenseLogs), defPid]);
  }

  const myInfo = db.exec("SELECT season_points FROM player_season WHERE player_id = ?", [req.playerId]);
  const updatedPoints = (myInfo.length > 0 && myInfo[0].values.length > 0) ? myInfo[0].values[0][0] : 0;

  const myPlayerInfo = db.exec("SELECT diamond FROM players WHERE player_id = ?", [req.playerId]);
  const updatedDiamond = (myPlayerInfo.length > 0 && myPlayerInfo[0].values.length > 0) ? myPlayerInfo[0].values[0][0] : 0;

  const defNicknameResult = db.exec("SELECT nickname FROM players WHERE player_id = ?", [defPid]);
  const defNickname = (defNicknameResult.length > 0 && defNicknameResult[0].values.length > 0) ? defNicknameResult[0].values[0][0] : '未知';

  saveDatabase();

  res.json({
    code: 0,
    data: {
      mode: 'ranked',
      win: isWin,
      attScore,
      defScore,
      pointChange,
      diamondReward,
      myCards: myCards.map((c, i) => ({ name: c.role_name, pos: c.pos, grade: c.grade, star: c.star, ...attPlayers[i] })),
      defCards: defCards.map((c, i) => ({ name: c.role_name, pos: c.pos, grade: c.grade, star: c.star, ...defPlayers[i] })),
      defenderNickname: defNickname,
      updatedPoints,
      updatedDiamond
    }
  });
});

// GET /api/pvp/leaderboard - 赛季排行榜前20
router.get('/leaderboard', authCheck, (req, res) => {
  const db = getDb();
  const result = db.exec(
    `SELECT p.nickname, ps.season_points, p.signature
     FROM player_season ps
     JOIN players p ON p.player_id = ps.player_id
     ORDER BY ps.season_points DESC
     LIMIT ?`,
    [LEADERBOARD_LIMIT]
  );

  const list = [];
  if (result.length > 0) {
    for (let i = 0; i < result[0].values.length; i++) {
      const r = result[0].values[i];
      const points = r[1];
      const signature = r[2] || '';
      const rank = getRankTier(points);
      list.push({ rank: i + 1, nickname: r[0], points, signature, rankLabel: rank.label, rankColor: rank.color });
    }
  }

  res.json({ code: 0, data: { list } });
});

// GET /api/pvp/defense-log - 防守日志（含球员比赛数据）
router.get('/defense-log', authCheck, (req, res) => {
  const db = getDb();
  const result = db.exec(
    "SELECT defense_log FROM player_season WHERE player_id = ?",
    [req.playerId]
  );

  let logs = [];
  if (result.length > 0 && result[0].values.length > 0) {
    const raw = result[0].values[0][0];
    if (raw) {
      try { logs = JSON.parse(raw); } catch (e) { logs = []; }
    }
  }

  // 关联match_records获取球员比赛数据
  const enriched = logs.map(log => {
    let playerStats = null;
    if (log.match_id) {
      const statsResult = db.exec(
        "SELECT player_stats_json FROM match_records WHERE match_id = ?",
        [log.match_id]
      );
      if (statsResult.length > 0 && statsResult[0].values.length > 0) {
        const raw = statsResult[0].values[0][0];
        if (raw) {
          try { playerStats = JSON.parse(raw); } catch (e) { playerStats = null; }
        }
      }
    }
    return { ...log, player_stats: playerStats };
  });

  res.json({ code: 0, data: { logs: enriched } });
});

// GET /api/pvp/battle-log - 对战日志（进攻+防守）
router.get('/battle-log', authCheck, (req, res) => {
  const db = getDb();

  // 查询我方作为进攻方的记录
  const attResult = db.exec(
    `SELECT match_id, attacker_id, defender_id, att_score, def_score, win_id, player_stats_json, create_time
     FROM match_records WHERE attacker_id = ? ORDER BY create_time DESC LIMIT ?`,
    [req.playerId, MAX_DEFENSE_LOG]
  );

  // 查询我方作为防守方的记录
  const defResult = db.exec(
    `SELECT match_id, attacker_id, defender_id, att_score, def_score, win_id, player_stats_json, create_time
     FROM match_records WHERE defender_id = ? ORDER BY create_time DESC LIMIT ?`,
    [req.playerId, MAX_DEFENSE_LOG]
  );

  const logs = [];
  const seenMatchIds = new Set();

  // 处理进攻方记录
  if (attResult.length > 0) {
    for (const row of attResult[0].values) {
      const matchId = row[0];
      if (seenMatchIds.has(matchId)) continue;
      seenMatchIds.add(matchId);

      const defenderNickname = db.exec(
        "SELECT nickname FROM players WHERE player_id = ?", [row[2]]
      );
      const oppName = (defenderNickname.length > 0 && defenderNickname[0].values.length > 0)
        ? defenderNickname[0].values[0][0] : '未知';

      let playerStats = null;
      if (row[6]) {
        try { playerStats = JSON.parse(row[6]); } catch (e) { playerStats = null; }
      }

      logs.push({
        match_id: matchId,
        role: 'attack',
        opponent_name: oppName,
        att_score: row[3],
        def_score: row[4],
        result: row[5] === req.playerId ? 'win' : 'lose',
        player_stats: playerStats,
        time: row[7]
      });
    }
  }

  // 处理防守方记录
  if (defResult.length > 0) {
    for (const row of defResult[0].values) {
      const matchId = row[0];
      if (seenMatchIds.has(matchId)) continue;
      seenMatchIds.add(matchId);

      const attackerNickname = db.exec(
        "SELECT nickname FROM players WHERE player_id = ?", [row[1]]
      );
      const oppName = (attackerNickname.length > 0 && attackerNickname[0].values.length > 0)
        ? attackerNickname[0].values[0][0] : '未知';

      let playerStats = null;
      if (row[6]) {
        try { playerStats = JSON.parse(row[6]); } catch (e) { playerStats = null; }
      }

      logs.push({
        match_id: matchId,
        role: 'defense',
        opponent_name: oppName,
        att_score: row[3],
        def_score: row[4],
        result: row[5] === req.playerId ? 'win' : 'lose',
        player_stats: playerStats,
        time: row[7]
      });
    }
  }

  // 按时间倒序排序
  logs.sort((a, b) => b.time - a.time);

  res.json({ code: 0, data: { logs: logs.slice(0, MAX_DEFENSE_LOG) } });
});

// GET /api/pvp/daily-stats - 每日单项统计榜
router.get('/daily-stats', authCheck, (req, res) => {
  const db = getDb();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();

  // 查询今日所有PVP比赛记录
  const result = db.exec(
    `SELECT attacker_id, defender_id, player_stats_json FROM match_records
     WHERE match_type IN ('pvp_ranked', 'pvp_casual') AND create_time >= ?`,
    [todayMs]
  );

  if (result.length === 0 || result[0].values.length === 0) {
    return res.json({ code: 0, data: { stats: { score: [], rebound: [], assist: [], steal: [], block: [] } } });
  }

  // 记录每个玩家每个球员每场比赛的单项数据，取最佳单场
  const matchStats = []; // [{ pid, roleName, pos, grade, score, rebound, assist, steal, block }]

  for (const row of result[0].values) {
    const attackerId = row[0];
    const defenderId = row[1];
    let statsJson = null;
    if (row[2]) {
      try { statsJson = JSON.parse(row[2]); } catch (e) { continue; }
    }
    if (!statsJson) continue;

    for (const p of statsJson) {
      const pid = p.side === 'attacker' ? attackerId : defenderId;
      matchStats.push({
        pid, roleName: p.name, pos: p.pos, grade: p.grade,
        score: p.score || 0, rebound: p.rebound || 0,
        assist: p.assist || 0, steal: p.steal || 0, block: p.block || 0
      });
    }
  }

  // 按玩家+球员分组，每项取最佳单场值
  const bestStats = {}; // { pid_roleName: { pos, grade, score, rebound, assist, steal, block } }
  for (const m of matchStats) {
    const key = m.pid + '_' + m.roleName;
    if (!bestStats[key]) {
      bestStats[key] = { pid: m.pid, roleName: m.roleName, pos: m.pos, grade: m.grade, score: 0, rebound: 0, assist: 0, steal: 0, block: 0 };
    }
    const b = bestStats[key];
    if (m.score > b.score) b.score = m.score;
    if (m.rebound > b.rebound) b.rebound = m.rebound;
    if (m.assist > b.assist) b.assist = m.assist;
    if (m.steal > b.steal) b.steal = m.steal;
    if (m.block > b.block) b.block = m.block;
  }

  // 查询昵称
  const pidSet = new Set(matchStats.map(m => m.pid));
  const nicknames = {};
  for (const pid of pidSet) {
    const nr = db.exec("SELECT nickname FROM players WHERE player_id = ?", [parseInt(pid)]);
    nicknames[pid] = (nr.length > 0 && nr[0].values.length > 0) ? nr[0].values[0][0] : '未知';
  }

  // 构建5项榜单
  const categories = ['score', 'rebound', 'assist', 'steal', 'block'];
  const categoryLabels = { score: '得分', rebound: '篮板', assist: '助攻', steal: '抢断', block: '盖帽' };
  const stats = {};

  for (const cat of categories) {
    const entries = [];
    for (const [key, s] of Object.entries(bestStats)) {
      if (s[cat] > 0) {
        entries.push({
          nickname: nicknames[s.pid],
          role_name: s.roleName,
          pos: s.pos,
          grade: s.grade,
          value: s[cat]
        });
      }
    }
    entries.sort((a, b) => b.value - a.value);
    stats[cat] = entries.slice(0, LEADERBOARD_LIMIT).map((e, i) => ({ rank: i + 1, ...e }));
  }

  res.json({ code: 0, data: { stats, labels: categoryLabels } });
});

// GET /api/pvp/daily-mvp - 获取今日MVP + 今日胜场排行
router.get('/daily-mvp', authCheck, (req, res) => {
  const db = getDb();
  const today = getTodayStr();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();

  // 查询已结算的MVP
  const result = db.exec(
    "SELECT player_id, nickname, win_count, settle_time FROM daily_mvp WHERE mvp_date = ?",
    [today]
  );
  let mvp = null;
  if (result.length > 0 && result[0].values.length > 0) {
    const r = result[0].values[0];
    mvp = { player_id: r[0], nickname: r[1], win_count: r[2], settle_time: r[3] };
  }

  // 今日胜场排行榜（20点前也能看到实时排行）
  const winResult = db.exec(
    `SELECT attacker_id, COUNT(*) as win_count FROM match_records
     WHERE match_type IN ('pvp_ranked', 'pvp_casual') AND win_id = attacker_id AND create_time >= ?
     GROUP BY attacker_id ORDER BY win_count DESC LIMIT 10`,
    [todayMs]
  );
  const leaderboard = [];
  if (winResult.length > 0) {
    for (const row of winResult[0].values) {
      const nr = db.exec("SELECT nickname FROM players WHERE player_id = ?", [row[0]]);
      const nickname = (nr.length > 0 && nr[0].values.length > 0) ? nr[0].values[0][0] : '未知';
      leaderboard.push({ player_id: row[0], nickname, win_count: row[1] });
    }
  }

  res.json({ code: 0, data: { mvp, leaderboard } });
});

// POST /api/pvp/settle-mvp - 结算每日MVP（20:00触发）
router.post('/settle-mvp', authCheck, (req, res) => {
  const db = getDb();
  const today = getTodayStr();
  const now = Date.now();

  // 检查今日是否已结算
  const existing = db.exec("SELECT 1 FROM daily_mvp WHERE mvp_date = ?", [today]);
  if (existing.length > 0 && existing[0].values.length > 0) {
    return res.json({ code: 0, msg: '今日已结算' });
  }

  // 今日零点时间戳
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();

  // 统计今日每个玩家的PVP胜利次数（作为进攻方获胜）
  const winResult = db.exec(
    `SELECT attacker_id, COUNT(*) as win_count FROM match_records
     WHERE match_type IN ('pvp_ranked', 'pvp_casual') AND win_id = attacker_id AND create_time >= ?
     GROUP BY attacker_id ORDER BY win_count DESC LIMIT 1`,
    [todayMs]
  );

  if (winResult.length === 0 || winResult[0].values.length === 0) {
    return res.json({ code: 0, msg: '今日无PVP对战' });
  }

  const winnerId = winResult[0].values[0][0];
  const winCount = winResult[0].values[0][1];

  // 获取昵称
  const nickResult = db.exec("SELECT nickname FROM players WHERE player_id = ?", [winnerId]);
  const nickname = (nickResult.length > 0 && nickResult[0].values.length > 0)
    ? nickResult[0].values[0][0] : '未知';

  // 写入MVP记录
  db.run(
    "INSERT INTO daily_mvp (mvp_date, player_id, nickname, win_count, settle_time) VALUES (?, ?, ?, ?, ?)",
    [today, winnerId, nickname, winCount, now]
  );

  // 发放300钻石奖励
  db.run(
    "UPDATE players SET diamond = diamond + 300 WHERE player_id = ?",
    [winnerId]
  );

  saveDatabase();

  res.json({
    code: 0,
    data: {
      mvp: { player_id: winnerId, nickname, win_count: winCount, settle_time: now }
    }
  });
});

module.exports = router;
