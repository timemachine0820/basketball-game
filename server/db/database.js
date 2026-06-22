const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const { LEAGUE_TIERS, ELITE_TIERS, ALL_ROLES } = require('../../config/game-config');

const DB_PATH = path.join(__dirname, '..', '..', 'game.db');
let db = null;

async function initDatabase() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');

  createTables();
  createLeagueTables();
  migrateTable();
  initLeagueAITeams();
  saveDatabase();

  return db;
}

function createTables() {
  db.run(`
    CREATE TABLE IF NOT EXISTS players (
      player_id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      nickname TEXT NOT NULL,
      gold INTEGER DEFAULT 1000,
      diamond INTEGER DEFAULT 0,
      upgrade_shard INTEGER DEFAULT 0,
      free_draws INTEGER DEFAULT 50,
      total_draw INTEGER DEFAULT 0,
      total_s INTEGER DEFAULT 0,
      current_season INTEGER DEFAULT 1
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS player_cards (
      card_uid INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id INTEGER NOT NULL,
      pos TEXT NOT NULL,
      grade TEXT NOT NULL,
      role_name TEXT NOT NULL,
      star INTEGER DEFAULT 1,
      FOREIGN KEY (player_id) REFERENCES players(player_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS team_deck (
      deck_id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id INTEGER UNIQUE NOT NULL,
      slot1_card INTEGER DEFAULT NULL,
      slot2_card INTEGER DEFAULT NULL,
      slot3_card INTEGER DEFAULT NULL,
      FOREIGN KEY (player_id) REFERENCES players(player_id),
      FOREIGN KEY (slot1_card) REFERENCES player_cards(card_uid),
      FOREIGN KEY (slot2_card) REFERENCES player_cards(card_uid),
      FOREIGN KEY (slot3_card) REFERENCES player_cards(card_uid)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS match_records (
      match_id INTEGER PRIMARY KEY AUTOINCREMENT,
      attacker_id INTEGER NOT NULL,
      defender_id INTEGER DEFAULT NULL,
      match_type TEXT NOT NULL,
      win_id INTEGER NOT NULL,
      att_score INTEGER NOT NULL,
      def_score INTEGER NOT NULL,
      player_stats_json TEXT,
      point_change INTEGER DEFAULT 0,
      create_time INTEGER NOT NULL,
      FOREIGN KEY (attacker_id) REFERENCES players(player_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS player_season (
      player_id INTEGER UNIQUE NOT NULL,
      season_points INTEGER DEFAULT 0,
      defense_log TEXT DEFAULT '[]',
      season_num INTEGER DEFAULT 1,
      FOREIGN KEY (player_id) REFERENCES players(player_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS player_achieve (
      player_id INTEGER NOT NULL,
      achievement_key TEXT NOT NULL,
      is_finish INTEGER DEFAULT 0,
      reward_get INTEGER DEFAULT 0,
      PRIMARY KEY (player_id, achievement_key),
      FOREIGN KEY (player_id) REFERENCES players(player_id)
    )
  `);
}

function createLeagueTables() {
  db.run(`
    CREATE TABLE IF NOT EXISTS league_ai_teams (
      team_id INTEGER PRIMARY KEY AUTOINCREMENT,
      tier TEXT NOT NULL,
      team_name TEXT NOT NULL,
      roster_json TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS league_daily_challenges (
      player_id INTEGER NOT NULL,
      tier TEXT NOT NULL,
      challenge_count INTEGER DEFAULT 0,
      last_date TEXT DEFAULT '',
      PRIMARY KEY (player_id, tier)
    )
  `);

  // 每日MVP记录
  db.run(`
    CREATE TABLE IF NOT EXISTS daily_mvp (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mvp_date TEXT UNIQUE NOT NULL,
      player_id INTEGER NOT NULL,
      nickname TEXT NOT NULL,
      win_count INTEGER DEFAULT 0,
      settle_time INTEGER NOT NULL
    )
  `);

  // 管理员账号表
  db.run(`
    CREATE TABLE IF NOT EXISTS admin_users (
      admin_id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL
    )
  `);

  // 初始化默认管理员账号（admin/admin123）
  const adminResult = db.exec("SELECT admin_id FROM admin_users WHERE username = 'admin'");
  if (adminResult.length === 0 || adminResult[0].values.length === 0) {
    db.run("INSERT INTO admin_users (username, password) VALUES (?, ?)", ['admin', 'admin123']);
  }
}

// 初始化联赛+精英预设AI队伍（幂等：跳过已存在的tier）
function initLeagueAITeams() {
  const existing = db.exec("SELECT tier FROM league_ai_teams");
  const existingTiers = existing.length > 0 ? existing[0].values.map(r => r[0]) : [];

  const allTiers = [...LEAGUE_TIERS, ...ELITE_TIERS];
  for (const tier of allTiers) {
    if (existingTiers.includes(tier.tier)) continue;
    const roster = tier.roster.map(r => {
      const roleData = ALL_ROLES.find(role => role.name === r.role_name);
      return {
        pos: r.pos,
        grade: roleData ? roleData.grade : 'B',
        role_name: r.role_name,
        star: r.star
      };
    });
    db.run(
      "INSERT INTO league_ai_teams (tier, team_name, roster_json) VALUES (?, ?, ?)",
      [tier.tier, tier.label, JSON.stringify(roster)]
    );
  }
}

function migrateTable() {
  // 兼容旧数据库：补充缺失的 free_draws 列
  const cols = db.exec("PRAGMA table_info(players)");
  const hasFreeDraws = cols.length > 0 && cols[0].values.some(r => r[1] === 'free_draws');
  if (!hasFreeDraws) {
    db.run("ALTER TABLE players ADD COLUMN free_draws INTEGER DEFAULT 50");
  }

  // 补充抽卡安慰保底计数列
  const hasPityCount = cols.length > 0 && cols[0].values.some(r => r[1] === 'pity_count');
  if (!hasPityCount) {
    db.run("ALTER TABLE players ADD COLUMN pity_count INTEGER DEFAULT 0");
  }

  // PVP冷却时间戳
  const hasLastPvpTime = cols.length > 0 && cols[0].values.some(r => r[1] === 'last_pvp_time');
  if (!hasLastPvpTime) {
    db.run("ALTER TABLE players ADD COLUMN last_pvp_time INTEGER DEFAULT 0");
  }
}

function saveDatabase() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

function getDb() {
  return db;
}

module.exports = { initDatabase, getDb, saveDatabase };
