// 球员位置
const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];

// 品级
const GRADES = { B: 'B', A: 'A', S: 'S', SS: 'SS', SSS: 'SSS' };

// 品级星级上限（统一5星）
const STAR_LIMIT = { B: 5, A: 5, S: 5, SS: 5, SSS: 5 };

// 品级每星全属性成长增量
const GROWTH_PER_STAR = { B: 4, A: 6, S: 8, SS: 10, SSS: 12 };

// S/SS/SSS角色天赋：主属性结算+20%倍率
const S_TALENT_MULTIPLIER = 0.2;

// 角色天赋映射：role_name → 主属性
const S_ROLE_TALENT = {
  '华仔': 'rebound',
  '阿晟': 'steal',
  '陶大': 'dunk',
  '小亮': 'midshot',
  '陶二': 'threept',
  '奶成哥': 'threept',
  '阿真': 'pass',
  '勇子': 'steal',
  '极致·华仔': 'rebound',
  '大学时期·陶二': 'threept',
  '单身·小亮': 'midshot',
  '黄毛·阿晟': 'steal'
};

// 角色外号描述
const S_ROLE_NICKNAME = {
  '华仔': '篮下守护者',
  '阿晟': '偷球达人',
  '陶大': '暴扣机器',
  '小亮': '中投靓仔',
  '陶二': '远程炮台',
  '奶成哥': '神射奶',
  '阿真': '控场大师',
  '勇子': '铁壁防线',
  '极致·华仔': '篮板之神',
  '大学时期·陶二': '三分暴雨',
  '单身·小亮': '中投无解',
  '黄毛·阿晟': '全能战士'
};

// 角色图片映射
const S_ROLE_IMAGE = {
  '华仔': 'huazai.png',
  '阿晟': 'asheng.png',
  '陶大': 'taoda.png',
  '小亮': 'xiaoliang.png',
  '陶二': 'taoer.png',
  '奶成哥': 'naicheng.png',
  '阿真': 'azhen.png',
  '勇子': 'yongzi.png',
  '极致·华仔': 'huazai.png',
  '大学时期·陶二': 'taoer.png',
  '单身·小亮': 'xiaoliang.png',
  '黄毛·阿晟': 'asheng.png'
};

// 摇摆双位置球员配置
const SWING_POSITIONS = {
  '陶二': ['SG', 'SF'],
  '阿晟': ['PF', 'C'],
  '大学时期·陶二': ['SG', 'SF'],
  '黄毛·阿晟': ['PF', 'C']
};

// 属性列表
const ATTR_NAMES = ['threept', 'midshot', 'dunk', 'rebound', 'block', 'speed', 'pass', 'steal'];

// 阵容槽位规则：5个标准位置
const SLOT_RULES = [
  { slot: 1, allowed: ['PG'] },
  { slot: 2, allowed: ['SG'] },
  { slot: 3, allowed: ['SF'] },
  { slot: 4, allowed: ['PF'] },
  { slot: 5, allowed: ['C'] }
];

// S级角色配置（8名）
const S_ROLES = [
  { name: '华仔', pos: 'C', grade: 'S', attrs: { threept: 40, midshot: 50, dunk: 60, rebound: 88, block: 70, speed: 40, pass: 44, steal: 36 } },
  { name: '阿晟', pos: 'PF', grade: 'S', attrs: { threept: 36, midshot: 56, dunk: 70, rebound: 60, block: 50, speed: 60, pass: 44, steal: 68 } },
  { name: '陶大', pos: 'PF', grade: 'S', attrs: { threept: 30, midshot: 44, dunk: 88, rebound: 60, block: 56, speed: 50, pass: 36, steal: 40 } },
  { name: '小亮', pos: 'SF', grade: 'S', attrs: { threept: 56, midshot: 82, dunk: 44, rebound: 40, block: 30, speed: 64, pass: 50, steal: 44 } },
  { name: '陶二', pos: 'SF', grade: 'S', attrs: { threept: 88, midshot: 60, dunk: 36, rebound: 36, block: 24, speed: 56, pass: 40, steal: 36 } },
  { name: '奶成哥', pos: 'SG', grade: 'S', attrs: { threept: 96, midshot: 56, dunk: 30, rebound: 24, block: 20, speed: 60, pass: 44, steal: 40 } },
  { name: '阿真', pos: 'PG', grade: 'S', attrs: { threept: 44, midshot: 50, dunk: 24, rebound: 30, block: 20, speed: 70, pass: 96, steal: 56 } },
  { name: '勇子', pos: 'SF', grade: 'S', attrs: { threept: 44, midshot: 48, dunk: 52, rebound: 56, block: 78, speed: 56, pass: 40, steal: 82 } }
];

// SS级角色配置（橙色）：S基础×1.1
const SS_ROLES = [
  { name: '大学时期·陶二', pos: 'SF', grade: 'SS', attrs: { threept: 97, midshot: 66, dunk: 40, rebound: 40, block: 26, speed: 62, pass: 44, steal: 40 } },
  { name: '单身·小亮', pos: 'SF', grade: 'SS', attrs: { threept: 62, midshot: 90, dunk: 48, rebound: 44, block: 33, speed: 70, pass: 55, steal: 48 } },
  { name: '黄毛·阿晟', pos: 'PF', grade: 'SS', attrs: { threept: 40, midshot: 62, dunk: 77, rebound: 66, block: 55, speed: 66, pass: 48, steal: 75 } }
];

// SSS级角色配置（红色）：S基础×1.3
const SSS_ROLES = [
  { name: '极致·华仔', pos: 'C', grade: 'SSS', attrs: { threept: 52, midshot: 65, dunk: 78, rebound: 114, block: 91, speed: 52, pass: 57, steal: 47 } }
];

// A级角色配置（每个位置3个，共15个）
const A_ROLES = [
  // PG
  { name: '控卫李', pos: 'PG', grade: 'A', attrs: { threept: 44, midshot: 50, dunk: 24, rebound: 30, block: 16, speed: 64, pass: 76, steal: 50 } },
  { name: '快攻王', pos: 'PG', grade: 'A', attrs: { threept: 36, midshot: 44, dunk: 30, rebound: 24, block: 12, speed: 76, pass: 70, steal: 56 } },
  { name: '妙手陈', pos: 'PG', grade: 'A', attrs: { threept: 40, midshot: 56, dunk: 20, rebound: 20, block: 10, speed: 60, pass: 80, steal: 44 } },
  // SG
  { name: '射手赵', pos: 'SG', grade: 'A', attrs: { threept: 80, midshot: 50, dunk: 24, rebound: 20, block: 10, speed: 56, pass: 36, steal: 36 } },
  { name: '闪电林', pos: 'SG', grade: 'A', attrs: { threept: 64, midshot: 44, dunk: 30, rebound: 16, block: 10, speed: 70, pass: 40, steal: 44 } },
  { name: '得分手周', pos: 'SG', grade: 'A', attrs: { threept: 70, midshot: 60, dunk: 20, rebound: 24, block: 12, speed: 52, pass: 30, steal: 30 } },
  // SF
  { name: '全能孙', pos: 'SF', grade: 'A', attrs: { threept: 56, midshot: 64, dunk: 44, rebound: 40, block: 24, speed: 56, pass: 44, steal: 40 } },
  { name: '飞人张', pos: 'SF', grade: 'A', attrs: { threept: 40, midshot: 50, dunk: 70, rebound: 36, block: 20, speed: 64, pass: 36, steal: 36 } },
  { name: '锋线王', pos: 'SF', grade: 'A', attrs: { threept: 50, midshot: 60, dunk: 50, rebound: 44, block: 30, speed: 50, pass: 40, steal: 32 } },
  // PF
  { name: '铁壁刘', pos: 'PF', grade: 'A', attrs: { threept: 30, midshot: 44, dunk: 64, rebound: 70, block: 50, speed: 44, pass: 30, steal: 36 } },
  { name: '灌篮马', pos: 'PF', grade: 'A', attrs: { threept: 24, midshot: 36, dunk: 80, rebound: 60, block: 40, speed: 50, pass: 24, steal: 30 } },
  { name: '内线黄', pos: 'PF', grade: 'A', attrs: { threept: 20, midshot: 40, dunk: 60, rebound: 76, block: 56, speed: 40, pass: 30, steal: 32 } },
  // C
  { name: '中锋吴', pos: 'C', grade: 'A', attrs: { threept: 16, midshot: 30, dunk: 70, rebound: 80, block: 60, speed: 36, pass: 24, steal: 20 } },
  { name: '守护者郑', pos: 'C', grade: 'A', attrs: { threept: 20, midshot: 24, dunk: 60, rebound: 84, block: 70, speed: 30, pass: 20, steal: 16 } },
  { name: '盖帽杨', pos: 'C', grade: 'A', attrs: { threept: 10, midshot: 20, dunk: 56, rebound: 76, block: 80, speed: 36, pass: 24, steal: 20 } }
];

// B级角色配置（每个位置5个，共25个）
const B_ROLES = [
  // PG
  { name: '新手后卫', pos: 'PG', grade: 'B', attrs: { threept: 30, midshot: 36, dunk: 16, rebound: 20, block: 10, speed: 50, pass: 56, steal: 36 } },
  { name: '替补控球', pos: 'PG', grade: 'B', attrs: { threept: 24, midshot: 30, dunk: 20, rebound: 16, block: 8, speed: 56, pass: 60, steal: 40 } },
  { name: '练习生丁', pos: 'PG', grade: 'B', attrs: { threept: 36, midshot: 24, dunk: 12, rebound: 16, block: 6, speed: 44, pass: 50, steal: 32 } },
  { name: '跑动何', pos: 'PG', grade: 'B', attrs: { threept: 20, midshot: 28, dunk: 16, rebound: 20, block: 10, speed: 60, pass: 44, steal: 30 } },
  { name: '传球手余', pos: 'PG', grade: 'B', attrs: { threept: 28, midshot: 32, dunk: 10, rebound: 12, block: 6, speed: 48, pass: 64, steal: 28 } },
  // SG
  { name: '投手钱', pos: 'SG', grade: 'B', attrs: { threept: 60, midshot: 36, dunk: 16, rebound: 12, block: 6, speed: 44, pass: 24, steal: 24 } },
  { name: '外线冯', pos: 'SG', grade: 'B', attrs: { threept: 56, midshot: 30, dunk: 20, rebound: 16, block: 8, speed: 40, pass: 20, steal: 20 } },
  { name: '新秀韩', pos: 'SG', grade: 'B', attrs: { threept: 50, midshot: 40, dunk: 12, rebound: 10, block: 6, speed: 50, pass: 30, steal: 24 } },
  { name: '侧翼蒋', pos: 'SG', grade: 'B', attrs: { threept: 44, midshot: 32, dunk: 20, rebound: 14, block: 10, speed: 56, pass: 24, steal: 28 } },
  { name: '二年级生', pos: 'SG', grade: 'B', attrs: { threept: 52, midshot: 28, dunk: 16, rebound: 12, block: 6, speed: 48, pass: 28, steal: 22 } },
  // SF
  { name: '锋线罗', pos: 'SF', grade: 'B', attrs: { threept: 40, midshot: 44, dunk: 36, rebound: 30, block: 16, speed: 44, pass: 30, steal: 24 } },
  { name: '突破许', pos: 'SF', grade: 'B', attrs: { threept: 30, midshot: 36, dunk: 44, rebound: 24, block: 12, speed: 56, pass: 24, steal: 28 } },
  { name: '新人吕', pos: 'SF', grade: 'B', attrs: { threept: 36, midshot: 40, dunk: 30, rebound: 36, block: 20, speed: 40, pass: 28, steal: 20 } },
  { name: '替补小前', pos: 'SF', grade: 'B', attrs: { threept: 44, midshot: 32, dunk: 24, rebound: 28, block: 16, speed: 50, pass: 32, steal: 24 } },
  { name: '发展联盟', pos: 'SF', grade: 'B', attrs: { threept: 32, midshot: 40, dunk: 40, rebound: 32, block: 14, speed: 44, pass: 26, steal: 22 } },
  // PF
  { name: '蓝领龚', pos: 'PF', grade: 'B', attrs: { threept: 16, midshot: 24, dunk: 50, rebound: 56, block: 36, speed: 36, pass: 20, steal: 24 } },
  { name: '篮板丁', pos: 'PF', grade: 'B', attrs: { threept: 12, midshot: 20, dunk: 40, rebound: 60, block: 40, speed: 30, pass: 16, steal: 20 } },
  { name: '强硬邹', pos: 'PF', grade: 'B', attrs: { threept: 10, midshot: 30, dunk: 44, rebound: 50, block: 30, speed: 40, pass: 24, steal: 20 } },
  { name: '内线彭', pos: 'PF', grade: 'B', attrs: { threept: 20, midshot: 24, dunk: 36, rebound: 44, block: 44, speed: 32, pass: 20, steal: 16 } },
  { name: '替补大前', pos: 'PF', grade: 'B', attrs: { threept: 16, midshot: 28, dunk: 40, rebound: 52, block: 32, speed: 36, pass: 20, steal: 18 } },
  // C
  { name: '新秀中锋', pos: 'C', grade: 'B', attrs: { threept: 10, midshot: 16, dunk: 44, rebound: 60, block: 44, speed: 24, pass: 16, steal: 12 } },
  { name: '替补中锋', pos: 'C', grade: 'B', attrs: { threept: 6, midshot: 20, dunk: 36, rebound: 56, block: 50, speed: 20, pass: 12, steal: 10 } },
  { name: '护框蔡', pos: 'C', grade: 'B', attrs: { threept: 10, midshot: 12, dunk: 30, rebound: 64, block: 56, speed: 24, pass: 16, steal: 10 } },
  { name: '蓝领中锋', pos: 'C', grade: 'B', attrs: { threept: 4, midshot: 16, dunk: 40, rebound: 50, block: 40, speed: 30, pass: 20, steal: 12 } },
  { name: '底薪姚', pos: 'C', grade: 'B', attrs: { threept: 16, midshot: 24, dunk: 36, rebound: 52, block: 44, speed: 20, pass: 12, steal: 10 } }
];

// 全部角色列表
const ALL_ROLES = [...SSS_ROLES, ...SS_ROLES, ...S_ROLES, ...A_ROLES, ...B_ROLES];

// 抽卡池配置
const POOL_CONFIG = {
  normal: {
    B: 60, A: 28, S: 9, SS: 2.5, SSS: 0.5
  },
  premium: {
    B: 35, A: 40, S: 16, SS: 7, SSS: 2
  }
};

// 安慰阶梯概率：连续未出S时的递增概率加成
const PITY_STEPS = [
  { threshold: 10, bonus: 1 },
  { threshold: 20, bonus: 2 },
  { threshold: 30, bonus: 3 },
  { threshold: 50, bonus: 5 }
];

// 新手开局抽卡次数
const NEWBIE_FREE_DRAWS = 100;

// 资源配置
const RESOURCE_CONFIG = {
  initGold: 1000,
  initDiamond: 0,
  initShard: 0,
  trainGoldMin: 50,
  trainGoldMax: 200,
  trainGoldBias: 150,
  trainDailyLimit: 30,
  eliteGoldReward: 500,
  eliteShardReward: 50,
  eliteDiamondReward: 200,
  pvpDiamondWin: 50,
  pvpPointWin: 10,
  pvpDailyLimit: 10
};

// 联赛按梯度奖励：碎片+钻石
const LEAGUE_REWARDS = {
  bronze: { shard: 5, diamond: 20 },
  silver: { shard: 15, diamond: 50 },
  gold:   { shard: 30, diamond: 100 }
};

// 球星碎片兑换配置
const SHARD_EXCHANGE = {
  S: { cost: 1000 },
  SS: { cost: 2000 },
  SSS: { cost: 5000 }
};

// PVP冷却时间（毫秒）
const PVP_COOLDOWN_MS = 5 * 1000;

// 排位等级配置（仿LOL），按积分区间划分
const RANK_TIERS = [
  { tier: 'iron',      label: '坚韧黑铁', color: '#7a7a7a', minPoints: 0 },
  { tier: 'bronze',    label: '英勇黄铜', color: '#cd7f32', minPoints: 100 },
  { tier: 'silver',    label: '不屈白银', color: '#c0c0c0', minPoints: 200 },
  { tier: 'gold',      label: '荣耀黄金', color: '#ffd700', minPoints: 300 },
  { tier: 'platinum',  label: '华贵铂金', color: '#00e5ff', minPoints: 400 },
  { tier: 'emerald',   label: '流光翡翠', color: '#00c853', minPoints: 500 },
  { tier: 'diamond',   label: '璀璨钻石', color: '#b388ff', minPoints: 600 },
  { tier: 'master',    label: '超凡大师', color: '#ff6d00', minPoints: 700 }
];

// 排位赛胜利积分增加
const RANKED_WIN_POINTS = 30;
// 排位赛失败积分减少
const RANKED_LOSE_POINTS = 15;

// 防守日志最大条数
const MAX_DEFENSE_LOG = 20;

// 排行榜展示人数
const LEADERBOARD_LIMIT = 20;

// 联赛梯度配置（5人阵容）
const LEAGUE_TIERS = [
  {
    tier: 'bronze',
    label: '青铜联赛',
    dailyLimit: 5,
    roster: [
      { pos: 'PG', role_name: '新手后卫', star: 2 },
      { pos: 'SG', role_name: '投手钱', star: 2 },
      { pos: 'SF', role_name: '锋线罗', star: 2 },
      { pos: 'PF', role_name: '蓝领龚', star: 2 },
      { pos: 'C', role_name: '新秀中锋', star: 2 }
    ]
  },
  {
    tier: 'silver',
    label: '白银联赛',
    dailyLimit: 3,
    roster: [
      { pos: 'PG', role_name: '快攻王', star: 3 },
      { pos: 'SG', role_name: '射手赵', star: 3 },
      { pos: 'SF', role_name: '全能孙', star: 3 },
      { pos: 'PF', role_name: '铁壁刘', star: 2 },
      { pos: 'C', role_name: '中锋吴', star: 2 }
    ]
  },
  {
    tier: 'gold',
    label: '黄金联赛',
    dailyLimit: 2,
    roster: [
      { pos: 'PG', role_name: '阿真', star: 2 },
      { pos: 'SG', role_name: '奶成哥', star: 2 },
      { pos: 'SF', role_name: '陶二', star: 2 },
      { pos: 'PF', role_name: '阿晟', star: 2 },
      { pos: 'C', role_name: '华仔', star: 2 }
    ]
  }
];

// 精英挑战赛配置（5人阵容）
const ELITE_TIERS = [
  {
    tier: 'elite_1',
    label: '精英·传奇',
    dailyLimit: 1,
    roster: [
      { pos: 'PG', role_name: '阿真', star: 3 },
      { pos: 'SG', role_name: '奶成哥', star: 3 },
      { pos: 'SF', role_name: '陶二', star: 3 },
      { pos: 'PF', role_name: '阿晟', star: 3 },
      { pos: 'C', role_name: '华仔', star: 3 }
    ]
  },
  {
    tier: 'elite_2',
    label: '精英·劲旅',
    dailyLimit: 1,
    roster: [
      { pos: 'PG', role_name: '阿真', star: 2 },
      { pos: 'SG', role_name: '奶成哥', star: 2 },
      { pos: 'SF', role_name: '小亮', star: 3 },
      { pos: 'PF', role_name: '陶大', star: 2 },
      { pos: 'C', role_name: '华仔', star: 2 }
    ]
  }
];

// 成就配置
const ACHIEVEMENTS = [
  {
    key: 'first_ten_draw',
    name: '首十连',
    desc: '完成首次十连抽卡',
    reward_type: 'diamond',
    reward_amount: 50
  },
  {
    key: 's_three_star',
    name: 'S三星',
    desc: '将任意S卡升至3星',
    reward_type: 'free_draws',
    reward_amount: 10
  },
  {
    key: 'first_pvp_win',
    name: '首胜真人',
    desc: '首次在PVP中战胜真人对手',
    reward_type: 'diamond',
    reward_amount: 30
  },
  {
    key: 'gold_league_clear',
    name: '黄金联赛通关',
    desc: '在黄金联赛中取得胜利',
    reward_type: 'diamond',
    reward_amount: 100
  }
];

// 抽卡消耗资源（单抽）
const DRAW_COST = {
  normal: { gold: 100 },     // 普通金币池单抽消耗
  premium: { diamond: 10 }   // 高级钻石池单抽消耗
};

// 分解奖励配置
const DECOMPOSE_REWARD = {
  B: { gold: 30, shard: 10, diamond: 0 },
  A: { gold: 60, shard: 20, diamond: 0 },
  S: { gold: 50, shard: 100, diamond: 150 },
  SS: { gold: 100, shard: 250, diamond: 350 },
  SSS: { gold: 200, shard: 500, diamond: 800 }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    POSITIONS,
    GRADES,
    STAR_LIMIT,
    GROWTH_PER_STAR,
    S_TALENT_MULTIPLIER,
    S_ROLE_TALENT,
    ATTR_NAMES,
    SLOT_RULES,
    S_ROLES,
    SS_ROLES,
    SSS_ROLES,
    A_ROLES,
    B_ROLES,
    ALL_ROLES,
    POOL_CONFIG,
    PITY_STEPS,
    NEWBIE_FREE_DRAWS,
    RESOURCE_CONFIG,
    LEAGUE_REWARDS,
    SHARD_EXCHANGE,
    PVP_COOLDOWN_MS,
    MAX_DEFENSE_LOG,
    LEADERBOARD_LIMIT,
    LEAGUE_TIERS,
    ELITE_TIERS,
    DRAW_COST,
    ACHIEVEMENTS,
    S_ROLE_NICKNAME,
    S_ROLE_IMAGE,
    SWING_POSITIONS,
    DECOMPOSE_REWARD,
    RANK_TIERS,
    RANKED_WIN_POINTS,
    RANKED_LOSE_POINTS
  };
}
