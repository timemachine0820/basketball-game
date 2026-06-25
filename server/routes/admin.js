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
  NEWBIE_FREE_DRAWS,
  RANK_TIERS,
  RANKED_WIN_POINTS,
  RANKED_LOSE_POINTS
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
    "SELECT p.player_id, p.game_id, p.nickname, p.gold, p.diamond, p.upgrade_shard, p.free_draws, p.total_draw, p.total_s, (SELECT COUNT(*) FROM player_cards WHERE player_id = p.player_id) AS card_count FROM players p"
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
      db.run("UPDATE team_deck SET slot1_card = NULL, slot2_card = NULL, slot3_card = NULL, slot4_card = NULL, slot5_card = NULL WHERE player_id = ?", [parseInt(player_id)]);
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
  const db = getDb();
  const overrideResult = db.exec("SELECT config_key, config_value FROM config_overrides");
  const overrides = {};
  if (overrideResult.length > 0) {
    overrideResult[0].values.forEach(r => {
      try { overrides[r[0]] = JSON.parse(r[1]); } catch(e) { overrides[r[0]] = r[1]; }
    });
  }
  const base = {
    resource: RESOURCE_CONFIG, pool: POOL_CONFIG, pitySteps: PITY_STEPS,
    drawCost: DRAW_COST, leagueRewards: LEAGUE_REWARDS, shardExchange: SHARD_EXCHANGE,
    decomposeReward: DECOMPOSE_REWARD, pvpCooldownMs: PVP_COOLDOWN_MS,
    maxDefenseLog: MAX_DEFENSE_LOG, leaderboardLimit: LEADERBOARD_LIMIT,
    starLimit: STAR_LIMIT, growthPerStar: GROWTH_PER_STAR,
    sTalentMultiplier: S_TALENT_MULTIPLIER, newbieFreeDraws: NEWBIE_FREE_DRAWS,
    rankTiers: RANK_TIERS, rankedWinPoints: RANKED_WIN_POINTS, rankedLosePoints: RANKED_LOSE_POINTS
  };
  Object.keys(overrides).forEach(key => {
    const parts = key.split('.');
    let t = base;
    for (let i = 0; i < parts.length - 1; i++) { if (t[parts[i]] === undefined) t[parts[i]] = {}; t = t[parts[i]]; }
    t[parts[parts.length - 1]] = overrides[key];
  });
  res.json({ code: 0, data: base });
});

router.post('/update-player', adminAuthCheck, (req, res) => {
  const { player_id, gold, diamond, upgrade_shard, free_draws } = req.body;
  const db = getDb();
  if (!player_id) return res.json({ code: 1, msg: '请选择玩家' });
  const check = db.exec("SELECT player_id FROM players WHERE player_id = ?", [parseInt(player_id)]);
  if (!check.length || !check[0].values.length) return res.json({ code: 1, msg: '玩家不存在' });
  const fields = [];
  const vals = [];
  if (gold !== undefined) { fields.push('gold = ?'); vals.push(Math.max(0, parseInt(gold) || 0)); }
  if (diamond !== undefined) { fields.push('diamond = ?'); vals.push(Math.max(0, parseInt(diamond) || 0)); }
  if (upgrade_shard !== undefined) { fields.push('upgrade_shard = ?'); vals.push(Math.max(0, parseInt(upgrade_shard) || 0)); }
  if (free_draws !== undefined) { fields.push('free_draws = ?'); vals.push(Math.max(0, parseInt(free_draws) || 0)); }
  if (fields.length === 0) return res.json({ code: 1, msg: '未修改任何字段' });
  vals.push(parseInt(player_id));
  try {
    db.run(`UPDATE players SET ${fields.join(', ')} WHERE player_id = ?`, vals);
    saveDatabase();
    res.json({ code: 0, msg: '玩家数据已更新' });
  } catch (err) {
    res.json({ code: 1, msg: '更新失败: ' + err.message });
  }
});

router.get('/match-history/:playerId', adminAuthCheck, (req, res) => {
  const { playerId } = req.params;
  const db = getDb();
  const result = db.exec(
    `SELECT m.match_id, m.match_type, m.attacker_id, m.defender_id,
            pa.nickname as att_name, pd.nickname as def_name,
            m.att_score, m.def_score, m.win_id, m.create_time
     FROM match_records m
     LEFT JOIN players pa ON m.attacker_id = pa.player_id
     LEFT JOIN players pd ON m.defender_id = pd.player_id
     WHERE m.attacker_id = ? OR m.defender_id = ?
     ORDER BY m.create_time DESC LIMIT 100`,
    [parseInt(playerId), parseInt(playerId)]
  );
  const rows = result.length > 0 ? result[0].values.map(r => ({
    match_id: r[0], match_type: r[1], attacker_id: r[2], defender_id: r[3],
    att_name: r[4], def_name: r[5], att_score: r[6], def_score: r[7],
    win_id: r[8], create_time: r[9],
    is_win: r[8] === r[2]
  })) : [];
  res.json({ code: 0, data: rows });
});

router.post('/batch-update', adminAuthCheck, (req, res) => {
  const { player_ids, action, value } = req.body;
  const db = getDb();
  if (!player_ids || !player_ids.length || !action) return res.json({ code: 1, msg: '参数不完整' });
  const allowed = ['set_gold', 'set_diamond', 'set_shard', 'add_gold', 'add_diamond', 'add_shard', 'reset_draws'];
  if (!allowed.includes(action)) return res.json({ code: 1, msg: '无效操作' });
  try {
    const ids = player_ids.map(id => parseInt(id));
    const placeholders = ids.map(() => '?').join(',');
    if (action === 'set_gold') db.run(`UPDATE players SET gold = ? WHERE player_id IN (${placeholders})`, [parseInt(value) || 0, ...ids]);
    else if (action === 'set_diamond') db.run(`UPDATE players SET diamond = ? WHERE player_id IN (${placeholders})`, [parseInt(value) || 0, ...ids]);
    else if (action === 'set_shard') db.run(`UPDATE players SET upgrade_shard = ? WHERE player_id IN (${placeholders})`, [parseInt(value) || 0, ...ids]);
    else if (action === 'add_gold') db.run(`UPDATE players SET gold = gold + ? WHERE player_id IN (${placeholders})`, [parseInt(value) || 0, ...ids]);
    else if (action === 'add_diamond') db.run(`UPDATE players SET diamond = diamond + ? WHERE player_id IN (${placeholders})`, [parseInt(value) || 0, ...ids]);
    else if (action === 'add_shard') db.run(`UPDATE players SET upgrade_shard = upgrade_shard + ? WHERE player_id IN (${placeholders})`, [parseInt(value) || 0, ...ids]);
    else if (action === 'reset_draws') db.run(`UPDATE players SET free_draws = ? WHERE player_id IN (${placeholders})`, [parseInt(value) || 0, ...ids]);
    saveDatabase();
    res.json({ code: 0, msg: `已对 ${ids.length} 名玩家执行批量操作` });
  } catch (err) {
    res.json({ code: 1, msg: '批量操作失败: ' + err.message });
  }
});

router.get('/export-players', adminAuthCheck, (req, res) => {
  const db = getDb();
  const result = db.exec(
    `SELECT p.player_id, p.game_id, p.nickname, p.gold, p.diamond, p.upgrade_shard,
            p.free_draws, p.total_draw, p.total_s, p.create_time,
            (SELECT COUNT(*) FROM player_cards WHERE player_id = p.player_id) AS card_count
     FROM players p ORDER BY p.player_id`
  );
  if (!result.length) return res.json({ code: 1, msg: '无数据' });
  const header = 'ID,游戏ID,昵称,金币,钻石,碎片,免费抽,总抽,S卡数,卡牌数,注册时间\n';
  const csv = header + result[0].values.map(r => {
    const date = r[9] ? new Date(r[9]).toLocaleString('zh-CN') : '';
    return `${r[0]},${r[1]},${r[2]},${r[3]},${r[4]},${r[5]},${r[6]},${r[7]},${r[8]},${r[10]},${date}`;
  }).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=players_export.csv');
  res.send('\uFEFF' + csv);
});

router.post('/update-config', adminAuthCheck, (req, res) => {
  const { configKey, configValue } = req.body;
  if (!configKey) return res.json({ code: 1, msg: '配置键不能为空' });
  const db = getDb();
  try {
    const val = typeof configValue === 'object' ? JSON.stringify(configValue) : String(configValue);
    db.run("INSERT OR REPLACE INTO config_overrides (config_key, config_value) VALUES (?, ?)", [configKey, val]);
    saveDatabase();
    res.json({ code: 0, msg: '配置已保存' });
  } catch(e) { res.json({ code: 1, msg: '保存失败: ' + e.message }); }
});

router.post('/reset-config', adminAuthCheck, (req, res) => {
  const { configKey } = req.body;
  const db = getDb();
  try {
    if (configKey) {
      // Read all, filter, drop & recreate
      const allResult = db.exec("SELECT config_key, config_value FROM config_overrides");
      const all = allResult.length > 0 ? allResult[0].values : [];
      db.run("DROP TABLE IF EXISTS config_overrides");
      db.run(`CREATE TABLE config_overrides (config_key TEXT PRIMARY KEY, config_value TEXT NOT NULL)`);
      for (const [k, v] of all) {
        if (k === configKey) continue;
        db.run(`INSERT INTO config_overrides (config_key, config_value) VALUES ('${k}', '${v.replace(/'/g,"''")}')`);
      }
    } else {
      db.run("DROP TABLE IF EXISTS config_overrides");
      db.run(`CREATE TABLE config_overrides (config_key TEXT PRIMARY KEY, config_value TEXT NOT NULL)`);
    }
    saveDatabase();
    res.json({ code: 0, msg: '配置已重置为默认值' });
  } catch(e) { res.json({ code: 1, msg: '重置失败: ' + e.message }); }
});

module.exports = router;
