const express = require('express');
const path = require('path');
const { initDatabase, getDb, saveDatabase } = require('./db/database');
const authRoutes = require('./routes/auth');
const playerRoutes = require('./routes/player');
const trainingRoutes = require('./routes/training');
const leagueRoutes = require('./routes/league');
const eliteRoutes = require('./routes/elite');
const pvpRoutes = require('./routes/pvp');
const achievementRoutes = require('./routes/achievement');
const adminRoutes = require('./routes/admin');

const PORT = process.env.PORT || 3000;

// 每日MVP结算（20:00触发）
function trySettleDailyMVP() {
  const now = new Date();
  if (now.getHours() !== 20) return;
  const db = getDb();
  if (!db) return;
  const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  const existing = db.exec("SELECT 1 FROM daily_mvp WHERE mvp_date = ?", [today]);
  if (existing.length > 0 && existing[0].values.length > 0) return;
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();
  const winResult = db.exec(
    `SELECT attacker_id, COUNT(*) as win_count FROM match_records
     WHERE match_type IN ('pvp_ranked', 'pvp_casual') AND win_id = attacker_id AND create_time >= ?
     GROUP BY attacker_id ORDER BY win_count DESC LIMIT 1`,
    [todayMs]
  );
  if (winResult.length === 0 || winResult[0].values.length === 0) return;
  const winnerId = winResult[0].values[0][0];
  const winCount = winResult[0].values[0][1];
  const nickResult = db.exec("SELECT nickname FROM players WHERE player_id = ?", [winnerId]);
  const nickname = (nickResult.length > 0 && nickResult[0].values.length > 0) ? nickResult[0].values[0][0] : '未知';
  db.run(
    "INSERT INTO daily_mvp (mvp_date, player_id, nickname, win_count, settle_time) VALUES (?, ?, ?, ?, ?)",
    [today, winnerId, nickname, winCount, now.getTime()]
  );
  db.run("UPDATE players SET diamond = diamond + 300 WHERE player_id = ?", [winnerId]);
  saveDatabase();
  console.log(`每日MVP结算完成: ${nickname} (胜利${winCount}次, 奖励300钻石)`);
}

async function start() {
  await initDatabase();
  console.log('数据库初始化完成');

  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // 静态文件托管
  app.use(express.static(path.join(__dirname, '..', 'static')));
  app.use(express.static(path.join(__dirname, '..', 'static', 'pages')));
  app.use('/config', express.static(path.join(__dirname, '..', 'config')));

  // API路由
  app.use('/api/auth', authRoutes);
  app.use('/api/player', playerRoutes);
  app.use('/api/training', trainingRoutes);
  app.use('/api/league', leagueRoutes);
  app.use('/api/elite', eliteRoutes);
  app.use('/api/pvp', pvpRoutes);
  app.use('/api/achievement', achievementRoutes);
  app.use('/api/admin', adminRoutes);

  // 根路径重定向到登录页
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'static', 'pages', 'index.html'));
  });

  // 全局错误处理中间件
  app.use((err, req, res, next) => {
    console.error('服务器错误:', err);
    res.status(500).json({ code: 1, msg: '服务器内部错误' });
  });

  app.listen(PORT, () => {
    console.log(`服务器已启动: http://localhost:${PORT}`);
    // 每5分钟检查是否到达20:00结算MVP
    setInterval(trySettleDailyMVP, 5 * 60 * 1000);
  });
}

start().catch(err => {
  console.error('启动失败:', err);
  process.exit(1);
});
