const express = require('express');
const router = express.Router();
const { getDb, saveDatabase } = require('../db/database');
const { ALL_ROLES, POOL_CONFIG, PITY_STEPS, DRAW_COST, STAR_LIMIT, SHARD_EXCHANGE, DECOMPOSE_REWARD, SWING_POSITIONS, SLOT_RULES } = require('../../config/game-config');
const { finishAchievement } = require('./achievement');
const { calcPlayerAttrs } = require('../battle-engine');

// 身份校验中间件
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

// 拉取玩家基础信息
router.get('/info', authCheck, (req, res) => {
  const db = getDb();
  const result = db.exec(
    "SELECT game_id, nickname, gold, diamond, upgrade_shard, free_draws, total_draw, total_s, current_season FROM players WHERE player_id = ?",
    [req.playerId]
  );

  if (result.length === 0 || result[0].values.length === 0) {
    return res.json({ code: 1, msg: '玩家数据异常' });
  }

  const row = result[0].values[0];

  const deckResult = db.exec(
    "SELECT slot1_card, slot2_card, slot3_card, slot4_card, slot5_card FROM team_deck WHERE player_id = ?",
    [req.playerId]
  );
  const deck = (deckResult.length > 0 && deckResult[0].values.length > 0)
    ? {
        slot1_card: deckResult[0].values[0][0],
        slot2_card: deckResult[0].values[0][1],
        slot3_card: deckResult[0].values[0][2],
        slot4_card: deckResult[0].values[0][3],
        slot5_card: deckResult[0].values[0][4]
      }
    : { slot1_card: null, slot2_card: null, slot3_card: null, slot4_card: null, slot5_card: null };

  res.json({
    code: 0,
    data: {
      player_id: req.playerId,
      game_id: row[0],
      nickname: row[1],
      gold: row[2],
      diamond: row[3],
      upgrade_shard: row[4],
      free_draws: row[5],
      total_draw: row[6],
      total_s: row[7],
      current_season: row[8],
      deck
    }
  });
});

// 拉取玩家持有的所有卡牌
router.get('/cards', authCheck, (req, res) => {
  const db = getDb();
  const result = db.exec(
    "SELECT card_uid, pos, grade, role_name, star FROM player_cards WHERE player_id = ?",
    [req.playerId]
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

// 拉取出战阵容
router.get('/deck', authCheck, (req, res) => {
  const db = getDb();
  const result = db.exec(
    "SELECT slot1_card, slot2_card, slot3_card, slot4_card, slot5_card FROM team_deck WHERE player_id = ?",
    [req.playerId]
  );

  if (result.length === 0 || result[0].values.length === 0) {
    return res.json({ code: 0, data: { slot1_card: null, slot2_card: null, slot3_card: null, slot4_card: null, slot5_card: null, power: 0 } });
  }

  const row = result[0].values[0];
  const slotUids = [row[0], row[1], row[2], row[3], row[4]].filter(Boolean);

  let power = 0;
  if (slotUids.length > 0) {
    const placeholders = slotUids.map(() => '?').join(',');
    const cardResult = db.exec(
      `SELECT card_uid, pos, grade, role_name, star FROM player_cards WHERE player_id = ? AND card_uid IN (${placeholders})`,
      [req.playerId, ...slotUids]
    );
    if (cardResult.length > 0) {
      const cardsAttrs = cardResult[0].values.map(r => {
        const cardInfo = { pos: r[1], grade: r[2], role_name: r[3], star: r[4] };
        const roleData = ALL_ROLES.find(rd => rd.name === r[3] && rd.grade === r[2]);
        return calcPlayerAttrs(cardInfo, roleData);
      });
      const { calcTeamPower } = require('../battle-engine');
      power = calcTeamPower(cardsAttrs);
    }
  }

  res.json({
    code: 0,
    data: {
      slot1_card: row[0],
      slot2_card: row[1],
      slot3_card: row[2],
      slot4_card: row[3],
      slot5_card: row[4],
      power
    }
  });
});

// 保存出战阵容
router.post('/deck', authCheck, (req, res) => {
  const { slot1_card, slot2_card, slot3_card, slot4_card, slot5_card } = req.body;
  const db = getDb();

  const slots = [slot1_card, slot2_card, slot3_card, slot4_card, slot5_card];
  if (slots.some(s => !s)) {
    return res.json({ code: 1, msg: '五个槽位必须全部填满' });
  }

  if (new Set(slots).size !== 5) {
    return res.json({ code: 1, msg: '不能重复使用同一张卡牌' });
  }

  const placeholders = slots.map(() => '?').join(',');
  const cardResult = db.exec(
    `SELECT card_uid, pos, role_name FROM player_cards WHERE player_id = ? AND card_uid IN (${placeholders})`,
    [req.playerId, ...slots]
  );

  if (cardResult.length === 0 || cardResult[0].values.length !== 5) {
    return res.json({ code: 1, msg: '所选卡牌不存在或不属于当前玩家' });
  }

  const cardMap = {};
  cardResult[0].values.forEach(r => { cardMap[r[0]] = { pos: r[1], role_name: r[2] }; });

  function canCardFitSlot(cardRoleName, cardPos, slotIndex) {
    const rule = SLOT_RULES[slotIndex];
    if (rule.allowed.includes(cardPos)) return true;
    const swing = SWING_POSITIONS[cardRoleName];
    if (swing && swing.some(p => rule.allowed.includes(p))) return true;
    return false;
  }

  for (let i = 0; i < 5; i++) {
    const card = cardMap[slots[i]];
    if (!canCardFitSlot(card.role_name, card.pos, i)) {
      return res.json({ code: 1, msg: `槽${i + 1}仅允许 ${SLOT_RULES[i].allowed.join('/')} 位置` });
    }
  }

  const existResult = db.exec(
    "SELECT deck_id FROM team_deck WHERE player_id = ?",
    [req.playerId]
  );

  if (existResult.length > 0 && existResult[0].values.length > 0) {
    db.run(
      "UPDATE team_deck SET slot1_card = ?, slot2_card = ?, slot3_card = ?, slot4_card = ?, slot5_card = ? WHERE player_id = ?",
      [slot1_card, slot2_card, slot3_card, slot4_card, slot5_card, req.playerId]
    );
  } else {
    db.run(
      "INSERT INTO team_deck (player_id, slot1_card, slot2_card, slot3_card, slot4_card, slot5_card) VALUES (?, ?, ?, ?, ?, ?)",
      [req.playerId, slot1_card, slot2_card, slot3_card, slot4_card, slot5_card]
    );
  }

  saveDatabase();
  res.json({ code: 0, msg: '阵容保存成功' });
});

// 拉取赛季数据
router.get('/season', authCheck, (req, res) => {
  const db = getDb();
  const result = db.exec(
    "SELECT season_points, defense_log, season_num FROM player_season WHERE player_id = ?",
    [req.playerId]
  );

  if (result.length === 0 || result[0].values.length === 0) {
    return res.json({ code: 0, data: { season_points: 0, defense_log: [], season_num: 1 } });
  }

  const row = result[0].values[0];
  res.json({
    code: 0,
    data: {
      season_points: row[0],
      defense_log: JSON.parse(row[1] || '[]'),
      season_num: row[2]
    }
  });
});

// 赛季重置：批量重置积分、递增赛季编号，保留卡牌/资源/成就
router.post('/season-reset', authCheck, (req, res) => {
  const db = getDb();
  // 仅递增当前赛季编号 + 1，重置所有玩家积分归零
  const seasonResult = db.exec("SELECT MAX(season_num) FROM player_season");
  const currentMax = (seasonResult.length > 0 && seasonResult[0].values.length > 0)
    ? (seasonResult[0].values[0][0] || 1) : 1;
  const nextSeason = currentMax + 1;

  db.run("UPDATE player_season SET season_points = 0, defense_log = '[]', season_num = ?", [nextSeason]);
  db.run("UPDATE players SET current_season = ?", [nextSeason]);
  saveDatabase();

  res.json({ code: 0, data: { season_num: nextSeason } });
});

// 抽卡：pool=normal(金币池)/premium(钻石池), count=1(单抽)/10(十连)
router.post('/draw', authCheck, (req, res) => {
  const { pool = 'normal', count = 1 } = req.body;

  if (!['normal', 'premium'].includes(pool)) {
    return res.json({ code: 1, msg: '无效的卡池类型' });
  }
  if (![1, 10].includes(count)) {
    return res.json({ code: 1, msg: '抽卡次数只能为1或10' });
  }

  const db = getDb();
  const costInfo = DRAW_COST[pool];

  // 读取玩家资源
  const result = db.exec(
    "SELECT gold, diamond, free_draws, pity_count, total_draw, total_s FROM players WHERE player_id = ?",
    [req.playerId]
  );
  if (result.length === 0 || result[0].values.length === 0) {
    return res.json({ code: 1, msg: '玩家数据异常' });
  }

  const row = result[0].values[0];
  let gold = row[0], diamond = row[1], freeDraws = row[2];
  let pityCount = row[3], totalDraw = row[4], totalS = row[5];

  // 先扣免费次数，剩余用对应资源
  const freeUsed = Math.min(freeDraws, count);
  const paidCount = count - freeUsed;
  const isGold = pool === 'normal';
  const totalCost = paidCount * (isGold ? costInfo.gold : costInfo.diamond);

  if (isGold && gold < totalCost) {
    return res.json({ code: 1, msg: '金币不足' });
  }
  if (!isGold && diamond < totalCost) {
    return res.json({ code: 1, msg: '钻石不足' });
  }

  try {
    // 扣除资源
    if (freeUsed > 0) {
      db.run("UPDATE players SET free_draws = free_draws - ? WHERE player_id = ?", [freeUsed, req.playerId]);
    }
    if (paidCount > 0) {
      const col = isGold ? 'gold' : 'diamond';
      db.run(`UPDATE players SET ${col} = ${col} - ? WHERE player_id = ?`, [totalCost, req.playerId]);
    }

    const poolRates = POOL_CONFIG[pool];
    const drawnCards = [];
    let sCount = 0;

    for (let i = 0; i < count; i++) {
      // 计算安慰保底加成
      let pityBonus = 0;
      for (const step of PITY_STEPS) {
        if (pityCount >= step.threshold) {
          pityBonus = step.bonus;
        }
      }

      // 按概率判定品级
      const sRate = Math.min(poolRates.S + pityBonus, 100);
      const aRate = poolRates.A;
      const bRate = Math.max(0, 100 - sRate - aRate);

      const roll = Math.random() * 100;
      let grade;
      if (roll < sRate) {
        grade = 'S';
      } else if (roll < sRate + aRate) {
        grade = 'A';
      } else {
        grade = 'B';
      }

      // 更新保底计数
      if (grade === 'S') {
        pityCount = 0;
        sCount++;
      } else {
        pityCount++;
      }

      // 从该品级角色池中随机选取
      const candidates = ALL_ROLES.filter(r => r.grade === grade);
      const role = candidates[Math.floor(Math.random() * candidates.length)];

      // 写入 player_cards
      db.run(
        "INSERT INTO player_cards (player_id, pos, grade, role_name, star) VALUES (?, ?, ?, ?, 1)",
        [req.playerId, role.pos, role.grade, role.name]
      );
      const uidResult = db.exec("SELECT last_insert_rowid()");
      const cardUid = uidResult[0].values[0][0];

      drawnCards.push({
        card_uid: cardUid,
        pos: role.pos,
        grade: role.grade,
        role_name: role.name,
        star: 1
      });
    }

    // 更新统计 + 保底计数
    totalDraw += count;
    totalS += sCount;
    db.run(
      "UPDATE players SET pity_count = ?, total_draw = ?, total_s = ? WHERE player_id = ?",
      [pityCount, totalDraw, totalS, req.playerId]
    );

    saveDatabase();

    // 首十连成就检测
    if (count === 10) {
      finishAchievement(req.playerId, 'first_ten_draw');
    }

    res.json({
      code: 0,
      data: {
        cards: drawnCards,
        remaining: {
          gold: isGold ? gold - totalCost : gold,
          diamond: !isGold ? diamond - totalCost : diamond,
          free_draws: freeDraws - freeUsed
        },
        total_draw: totalDraw,
        total_s: totalS
      }
    });
  } catch (err) {
    console.error('抽卡失败:', err);
    res.json({ code: 1, msg: '抽卡失败，请重试' });
  }
});

// 升星合成：同品级、同角色、同星级2张卡合成+1星
router.post('/upgrade', authCheck, (req, res) => {
  const { card_uid_1, card_uid_2 } = req.body;

  if (!card_uid_1 || !card_uid_2 || card_uid_1 === card_uid_2) {
    return res.json({ code: 1, msg: '请选择两张不同的卡牌' });
  }

  const db = getDb();

  // 查询两张卡牌
  const result = db.exec(
    "SELECT card_uid, pos, grade, role_name, star FROM player_cards WHERE player_id = ? AND card_uid IN (?, ?)",
    [req.playerId, card_uid_1, card_uid_2]
  );

  if (result.length === 0 || result[0].values.length !== 2) {
    return res.json({ code: 1, msg: '卡牌不存在或不属于当前玩家' });
  }

  const card1 = { uid: result[0].values[0][0], pos: result[0].values[0][1], grade: result[0].values[0][2], name: result[0].values[0][3], star: result[0].values[0][4] };
  const card2 = { uid: result[0].values[1][0], pos: result[0].values[1][1], grade: result[0].values[1][2], name: result[0].values[1][3], star: result[0].values[1][4] };

  // 校验同品级、同角色、同星级
  if (card1.grade !== card2.grade || card1.name !== card2.name || card1.star !== card2.star) {
    return res.json({ code: 1, msg: '两张卡牌必须为同品级、同角色、同星级' });
  }

  // 校验星级上限 B=5 A=4 S=3
  const maxStar = STAR_LIMIT[card1.grade] || 5;
  if (card1.star >= maxStar) {
    return res.json({ code: 1, msg: `已达星级上限 ${maxStar} 星` });
  }

  try {
    // 检查是否在出战阵容中，若在则先清空对应槽位
    const deckResult = db.exec(
      "SELECT slot1_card, slot2_card, slot3_card, slot4_card, slot5_card FROM team_deck WHERE player_id = ?",
      [req.playerId]
    );
    if (deckResult.length > 0 && deckResult[0].values.length > 0) {
      const deck = deckResult[0].values[0];
      const deckUpdates = [];
      if (deck[0] === card_uid_1 || deck[0] === card_uid_2) deckUpdates.push('slot1_card = NULL');
      if (deck[1] === card_uid_1 || deck[1] === card_uid_2) deckUpdates.push('slot2_card = NULL');
      if (deck[2] === card_uid_1 || deck[2] === card_uid_2) deckUpdates.push('slot3_card = NULL');
      if (deck[3] === card_uid_1 || deck[3] === card_uid_2) deckUpdates.push('slot4_card = NULL');
      if (deck[4] === card_uid_1 || deck[4] === card_uid_2) deckUpdates.push('slot5_card = NULL');
      if (deckUpdates.length > 0) {
        db.run(`UPDATE team_deck SET ${deckUpdates.join(', ')} WHERE player_id = ?`, [req.playerId]);
      }
    }

    // 事务：删除两张旧卡，插入一张高星新卡
    db.run("BEGIN");
    db.run("DELETE FROM player_cards WHERE card_uid = ?", [card_uid_1]);
    db.run("DELETE FROM player_cards WHERE card_uid = ?", [card_uid_2]);
    db.run(
      "INSERT INTO player_cards (player_id, pos, grade, role_name, star) VALUES (?, ?, ?, ?, ?)",
      [req.playerId, card1.pos, card1.grade, card1.name, card1.star + 1]
    );
    const uidResult = db.exec("SELECT last_insert_rowid()");
    const newUid = uidResult[0].values[0][0];
    db.run("COMMIT");

    saveDatabase();

    // S三星成就检测
    if (card1.grade === 'S' && (card1.star + 1) >= 3) {
      finishAchievement(req.playerId, 's_three_star');
    }

    res.json({
      code: 0,
      data: {
        new_card: {
          card_uid: newUid,
          pos: card1.pos,
          grade: card1.grade,
          role_name: card1.name,
          star: card1.star + 1
        }
      }
    });
  } catch (err) {
    db.run("ROLLBACK");
    console.error('升星合成失败:', err);
    res.json({ code: 1, msg: '升星失败，请重试' });
  }
});

// POST /api/player/exchange-shard - 球星碎片兑换指定卡牌
router.post('/exchange-shard', authCheck, (req, res) => {
  const { grade, role_name } = req.body;
  if (!['S', 'SS', 'SSS'].includes(grade)) {
    return res.json({ code: 1, msg: '仅支持兑换S/SS/SSS级球员' });
  }
  if (!role_name) {
    return res.json({ code: 1, msg: '请选择兑换球员' });
  }

  if (!SHARD_EXCHANGE[grade]) {
    return res.json({ code: 1, msg: '无效的品级配置' });
  }
  const cost = SHARD_EXCHANGE[grade].cost;
  const db = getDb();

  // 校验角色存在
  const roleData = ALL_ROLES.find(r => r.name === role_name && r.grade === grade);
  if (!roleData) {
    return res.json({ code: 1, msg: '无效的球员信息' });
  }

  // 校验碎片余额
  const result = db.exec(
    "SELECT upgrade_shard FROM players WHERE player_id = ?",
    [req.playerId]
  );
  if (result.length === 0 || result[0].values.length === 0) {
    return res.json({ code: 1, msg: '玩家数据异常' });
  }
  const currentShard = result[0].values[0][0];
  if (currentShard < cost) {
    return res.json({ code: 1, msg: `球星碎片不足，兑换${grade}级需${cost}碎片` });
  }

  // 扣除碎片
  db.run(
    "UPDATE players SET upgrade_shard = upgrade_shard - ? WHERE player_id = ?",
    [cost, req.playerId]
  );

  // 写入卡牌（指定角色）
  db.run(
    "INSERT INTO player_cards (player_id, pos, grade, role_name, star) VALUES (?, ?, ?, ?, 1)",
    [req.playerId, roleData.pos, roleData.grade, roleData.name]
  );
  const uidResult = db.exec("SELECT last_insert_rowid()");
  const cardUid = uidResult[0].values[0][0];

  saveDatabase();

  res.json({
    code: 0,
    data: {
      card: {
        card_uid: cardUid,
        pos: roleData.pos,
        grade: roleData.grade,
        role_name: roleData.name,
        star: 1
      },
      updatedShard: currentShard - cost
    }
  });
});

// POST /api/player/upgrade-all - 一键合成：自动将所有可合成卡牌升到最高星
router.post('/upgrade-all', authCheck, (req, res) => {
  const db = getDb();
  // 读取所有卡牌
  const result = db.exec(
    "SELECT card_uid, pos, grade, role_name, star FROM player_cards WHERE player_id = ?",
    [req.playerId]
  );
  if (result.length === 0 || result[0].values.length === 0) {
    return res.json({ code: 1, msg: '暂无卡牌' });
  }

  const allCards = result[0].values.map(r => ({
    uid: r[0], pos: r[1], grade: r[2], role_name: r[3], star: r[4]
  }));

  // 读取出战阵容
  const deckResult = db.exec(
    "SELECT slot1_card, slot2_card, slot3_card, slot4_card, slot5_card FROM team_deck WHERE player_id = ?",
    [req.playerId]
  );
  const deckUids = new Set();
  if (deckResult.length > 0 && deckResult[0].values.length > 0) {
    const d = deckResult[0].values[0];
    if (d[0]) deckUids.add(d[0]);
    if (d[1]) deckUids.add(d[1]);
    if (d[2]) deckUids.add(d[2]);
    if (d[3]) deckUids.add(d[3]);
    if (d[4]) deckUids.add(d[4]);
  }

  // 按 品级+角色名 分组
  const groups = {};
  for (const c of allCards) {
    const key = c.grade + '|' + c.role_name;
    if (!groups[key]) groups[key] = [];
    groups[key].push(c);
  }

  let totalUpgrades = 0;
  const upgradeResults = [];

  for (const key of Object.keys(groups)) {
    const cards = groups[key];
    const grade = cards[0].grade;
    const roleName = cards[0].role_name;
    const maxStar = STAR_LIMIT[grade] || 5;

    // 循环升星：按星级从低到高，每次取2张合成
    let currentCards = [...cards];
    currentCards.sort((a, b) => a.star - b.star);

    while (currentCards.length >= 2) {
      // 按星级分组
      const starGroups = {};
      for (const c of currentCards) {
        if (!starGroups[c.star]) starGroups[c.star] = [];
        starGroups[c.star].push(c);
      }

      let didUpgrade = false;
      for (const star of Object.keys(starGroups).sort((a, b) => a - b)) {
        const s = parseInt(star);
        if (s >= maxStar) continue;
        const pool = starGroups[s];
        if (pool.length < 2) continue;

        // 取前两张合成
        const c1 = pool[0];
        const c2 = pool[1];

        // 若在出战阵容中，清空对应槽位
        if (deckUids.has(c1.uid) || deckUids.has(c2.uid)) {
          const deckUpdates = [];
          if (deckResult.length > 0 && deckResult[0].values.length > 0) {
            const d = deckResult[0].values[0];
            if (d[0] === c1.uid || d[0] === c2.uid) deckUpdates.push('slot1_card = NULL');
            if (d[1] === c1.uid || d[1] === c2.uid) deckUpdates.push('slot2_card = NULL');
            if (d[2] === c1.uid || d[2] === c2.uid) deckUpdates.push('slot3_card = NULL');
            if (d[3] === c1.uid || d[3] === c2.uid) deckUpdates.push('slot4_card = NULL');
            if (d[4] === c1.uid || d[4] === c2.uid) deckUpdates.push('slot5_card = NULL');
          }
          if (deckUpdates.length > 0) {
            db.run(`UPDATE team_deck SET ${deckUpdates.join(', ')} WHERE player_id = ?`, [req.playerId]);
          }
          deckUids.delete(c1.uid);
          deckUids.delete(c2.uid);
        }

        db.run("DELETE FROM player_cards WHERE card_uid = ?", [c1.uid]);
        db.run("DELETE FROM player_cards WHERE card_uid = ?", [c2.uid]);
        db.run(
          "INSERT INTO player_cards (player_id, pos, grade, role_name, star) VALUES (?, ?, ?, ?, ?)",
          [req.playerId, c1.pos, grade, roleName, s + 1]
        );
        const uidResult = db.exec("SELECT last_insert_rowid()");
        const newUid = uidResult[0].values[0][0];

        totalUpgrades++;
        upgradeResults.push({ role_name: roleName, grade, from: s, to: s + 1 });

        // S三星成就检测
        if ((grade === 'S' || grade === 'SS' || grade === 'SSS') && (s + 1) >= 3) {
          finishAchievement(req.playerId, 's_three_star');
        }

        // 从当前列表中移除旧卡，加入新卡
        currentCards = currentCards.filter(c => c.uid !== c1.uid && c.uid !== c2.uid);
        currentCards.push({ uid: newUid, pos: c1.pos, grade, role_name: roleName, star: s + 1 });
        didUpgrade = true;
        break; // 重新从低星级开始扫描
      }
      if (!didUpgrade) break;
    }
  }

  saveDatabase();

  res.json({
    code: 0,
    data: {
      totalUpgrades,
      details: upgradeResults
    }
  });
});

// POST /api/player/decompose - 一键分解：批量分解选中卡牌
router.post('/decompose', authCheck, (req, res) => {
  const { card_uids } = req.body;
  if (!Array.isArray(card_uids) || card_uids.length === 0) {
    return res.json({ code: 1, msg: '请选择要分解的卡牌' });
  }

  const db = getDb();

  // 读取出战阵容
  const deckResult = db.exec(
    "SELECT slot1_card, slot2_card, slot3_card, slot4_card, slot5_card FROM team_deck WHERE player_id = ?",
    [req.playerId]
  );
  const deckUids = new Set();
  if (deckResult.length > 0 && deckResult[0].values.length > 0) {
    const d = deckResult[0].values[0];
    if (d[0]) deckUids.add(d[0]);
    if (d[1]) deckUids.add(d[1]);
    if (d[2]) deckUids.add(d[2]);
    if (d[3]) deckUids.add(d[3]);
    if (d[4]) deckUids.add(d[4]);
  }

  // 校验出战阵容中的卡牌
  const inDeck = card_uids.filter(uid => deckUids.has(uid));
  if (inDeck.length > 0) {
    return res.json({ code: 1, msg: '出战阵容中的卡牌无法分解，请先移出阵容' });
  }

  // 查询卡牌信息（含星级）
  const placeholders = card_uids.map(() => '?').join(',');
  const result = db.exec(
    `SELECT card_uid, grade, star FROM player_cards WHERE player_id = ? AND card_uid IN (${placeholders})`,
    [req.playerId, ...card_uids]
  );
  if (result.length === 0 || result[0].values.length !== card_uids.length) {
    return res.json({ code: 1, msg: '部分卡牌不存在或不属于当前玩家' });
  }

  // 累计奖励（星级系数：1星×1, 2星×2, 3星×4, ...）
  let totalGold = 0, totalShard = 0, totalDiamond = 0;
  for (const row of result[0].values) {
    const grade = row[1];
    const star = row[2] || 1;
    const starMultiplier = Math.pow(2, star - 1);
    const base = DECOMPOSE_REWARD[grade] || { gold: 0, shard: 0, diamond: 0 };
    totalGold += base.gold * starMultiplier;
    totalShard += base.shard * starMultiplier;
    totalDiamond += base.diamond * starMultiplier;
  }

  // 删除卡牌
  db.run(`DELETE FROM player_cards WHERE player_id = ? AND card_uid IN (${placeholders})`,
    [req.playerId, ...card_uids]);

  // 发放奖励
  db.run(
    "UPDATE players SET gold = gold + ?, upgrade_shard = upgrade_shard + ?, diamond = diamond + ? WHERE player_id = ?",
    [totalGold, totalShard, totalDiamond, req.playerId]
  );

  saveDatabase();

  // 读取更新后的资源
  const updatedResult = db.exec(
    "SELECT gold, upgrade_shard, diamond FROM players WHERE player_id = ?",
    [req.playerId]
  );
  const updated = (updatedResult.length > 0 && updatedResult[0].values.length > 0)
    ? updatedResult[0].values[0] : [0, 0, 0];

  res.json({
    code: 0,
    data: {
      decomposedCount: card_uids.length,
      gold: totalGold,
      shard: totalShard,
      diamond: totalDiamond,
      updatedGold: updated[0],
      updatedShard: updated[1],
      updatedDiamond: updated[2]
    }
  });
});

router.get('/signature', authCheck, (req, res) => {
  const db = getDb();
  const result = db.exec("SELECT signature FROM players WHERE player_id = ?", [req.playerId]);
  const signature = (result.length > 0 && result[0].values.length > 0) ? (result[0].values[0][0] || '') : '';
  res.json({ code: 0, data: { signature } });
});

router.post('/signature', authCheck, (req, res) => {
  const { signature } = req.body;
  if (typeof signature !== 'string') {
    return res.json({ code: 1, msg: '签名格式错误' });
  }
  const trimmed = signature.trim();
  if (trimmed.length > 20) {
    return res.json({ code: 1, msg: '签名不能超过20个字' });
  }
  const db = getDb();
  db.run("UPDATE players SET signature = ? WHERE player_id = ?", [trimmed, req.playerId]);
  saveDatabase();
  res.json({ code: 0, msg: '签名已更新', data: { signature: trimmed } });
});

module.exports = router;
