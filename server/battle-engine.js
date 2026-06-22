const {
  ALL_ROLES, A_ROLES, B_ROLES, ATTR_NAMES, S_ROLE_TALENT, S_TALENT_MULTIPLIER, GROWTH_PER_STAR, SLOT_RULES
} = require('../config/game-config');

/**
 * 计算单张卡牌最终属性
 * 基础属性 + 星级成长；S角色主属性×1.2天赋倍率
 */
function calcCardFinalAttrs(cardInfo, roleData) {
  const growth = GROWTH_PER_STAR[cardInfo.grade] * (cardInfo.star - 1);
  const attrs = {};
  for (const key of ATTR_NAMES) {
    attrs[key] = (roleData.attrs[key] || 0) + growth;
  }
  // S角色天赋：主属性×1.2
  if (cardInfo.grade === 'S' && S_ROLE_TALENT[cardInfo.role_name]) {
    const mainAttr = S_ROLE_TALENT[cardInfo.role_name];
    attrs[mainAttr] = Math.round(attrs[mainAttr] * (1 + S_TALENT_MULTIPLIER));
  }
  return attrs;
}

/**
 * 计算球队综合战力
 * 每张卡牌战力 = 全属性平均值 × 10，阵容战力 = 三张卡牌战力之和
 */
function calcTeamPower(cardsAttrs) {
  let total = 0;
  for (const card of cardsAttrs) {
    const sum = ATTR_NAMES.reduce((s, key) => s + (card[key] || 0), 0);
    const avg = sum / ATTR_NAMES.length;
    total += Math.round(avg * 10);
  }
  return total;
}

/**
 * 模拟比赛：基于球员属性的逐回合模拟
 * 战力高的队伍有更高概率获胜：通过攻防综合属性差异调整命中率
 * @returns { attScore, defScore, attPlayers, defPlayers }
 */
function simulateBattle(myAttrs, aiAttrs) {
  const POSSESSIONS = 70;
  let myScore = 0, aiScore = 0;
  const myPlayers = myAttrs.map(() => ({ score: 0, rebound: 0, assist: 0, steal: 0, block: 0 }));
  const aiPlayers = aiAttrs.map(() => ({ score: 0, rebound: 0, assist: 0, steal: 0, block: 0 }));

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function pickByWeight(attrs, weightFn) {
    const weights = attrs.map(weightFn);
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) return 0;
    let r = Math.random() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) return i;
    }
    return weights.length - 1;
  }

  function pickHandler(attrs) {
    return pickByWeight(attrs, p => p.threept * 0.3 + p.midshot * 0.25 + p.dunk * 0.2 + p.speed * 0.15 + p.pass * 0.1);
  }

  function pickRebounder(attrs) {
    return pickByWeight(attrs, p => p.rebound);
  }

  // 计算队伍攻防综合评分，用于战力优势判定
  function teamOffenseScore(attrs) {
    return attrs.reduce((s, p) => s + p.threept * 0.3 + p.midshot * 0.25 + p.dunk * 0.2 + p.speed * 0.15 + p.pass * 0.1, 0) / attrs.length;
  }
  function teamDefenseScore(attrs) {
    return attrs.reduce((s, p) => s + p.block * 0.25 + p.rebound * 0.2 + p.speed * 0.2 + (p.threept + p.midshot) * 0.175, 0) / attrs.length;
  }

  const myOff = teamOffenseScore(myAttrs);
  const myDef = teamDefenseScore(myAttrs);
  const aiOff = teamOffenseScore(aiAttrs);
  const aiDef = teamDefenseScore(aiAttrs);

  // 我方攻防差 vs 对方攻防差，差异越大优势越明显
  const myAdvantage = myOff - myDef;
  const aiAdvantage = aiOff - aiDef;
  const powerDiff = myAdvantage - aiAdvantage;

  // 战力优势修正：每1点攻防差差异 ≈ 1.5%命中率修正
  const myHitBonus = clamp(powerDiff * 0.0015, -0.06, 0.06);

  function runPossession(off, def, offStats, defStats, isMy) {
    const handler = pickHandler(off);

    // ① 抢断判定
    const defender = pickByWeight(def, p => p.steal);
    const stealChance = 0.06 + (def[defender].steal - off[handler].pass * 0.4 - off[handler].speed * 0.6) * 0.001;
    if (Math.random() < clamp(stealChance, 0.02, 0.12)) {
      defStats[defender].steal++;
      return;
    }

    // ② 出手类型选择
    const shotWeights = [off[handler].threept * 0.9, off[handler].midshot, off[handler].dunk * 1.1];
    const shotNames = ['threept', 'midshot', 'dunk'];
    const swTotal = shotWeights.reduce((a, b) => a + b, 0);
    let shotIdx = 0;
    if (swTotal > 0) {
      let sr = Math.random() * swTotal;
      for (let j = 0; j < shotWeights.length; j++) {
        sr -= shotWeights[j];
        if (sr <= 0) { shotIdx = j; break; }
      }
    }
    const shotType = shotNames[shotIdx];
    const shotAttr = off[handler][shotType];
    const points = shotType === 'threept' ? 3 : 2;

    // ③ 盖帽判定
    const blocker = pickByWeight(def, p => p.block);
    const blockChance = 0.03 + (def[blocker].block - shotAttr) * 0.0008;
    if (Math.random() < clamp(blockChance, 0.015, 0.10)) {
      defStats[blocker].block++;
      return;
    }

    // ④ 投篮命中判定：基础率 + 属性差修正 + 战力优势修正
    const avgDef = def.reduce((s, p) =>
      s + p.block * 0.25 + p.rebound * 0.2 + p.speed * 0.2 + (p.threept + p.midshot) * 0.175, 0) / def.length;
    const baseRate = { threept: 0.37, midshot: 0.48, dunk: 0.60 }[shotType];
    const attrBonus = (shotAttr - avgDef) * 0.003;
    const hitBonus = isMy ? myHitBonus : -myHitBonus;
    const successRate = baseRate + attrBonus + hitBonus;

    if (Math.random() < clamp(successRate, 0.22, 0.68)) {
      offStats[handler].score += points;
      if (isMy) myScore += points; else aiScore += points;

      // 55%概率计入助攻
      if (Math.random() < 0.55) {
        const others = [0, 1, 2].filter(x => x !== handler);
        if (others.length > 0) {
          const aWeights = others.map(x => off[x].pass);
          const aTotal = aWeights.reduce((a, b) => a + b, 0);
          if (aTotal > 0) {
            let ar = Math.random() * aTotal;
            for (let j = 0; j < others.length; j++) {
              ar -= aWeights[j];
              if (ar <= 0) { offStats[others[j]].assist++; break; }
            }
          }
        }
      }
    } else {
      // 投丢 → 篮板争夺
      if (Math.random() < 0.55) {
        defStats[pickRebounder(def)].rebound++;
      } else {
        offStats[pickRebounder(off)].rebound++;
      }
    }
  }

  for (let i = 0; i < POSSESSIONS; i++) {
    runPossession(myAttrs, aiAttrs, myPlayers, aiPlayers, true);
    runPossession(aiAttrs, myAttrs, aiPlayers, myPlayers, false);
  }

  return { attScore: myScore, defScore: aiScore, attPlayers: myPlayers, defPlayers: aiPlayers };
}

/**
 * 根据我方阵容实力，动态随机生成B/A混合AI队（运行时内存生成，不入库）
 * 每个槽位按规则随机选B或A品级角色
 */
function generateAITeam(myTeamPower) {
  const aiCards = [];

  for (let slotIdx = 0; slotIdx < 3; slotIdx++) {
    const rule = SLOT_RULES[slotIdx];
    const allowedPos = rule.allowed;

    // 根据我方实力决定AI品级：实力越强A级概率越高
    const aChance = Math.min(0.8, Math.max(0.2, myTeamPower / 200));
    const grade = Math.random() < aChance ? 'A' : 'B';

    // 从对应品级+位置池中随机选角色
    const pool = (grade === 'A' ? A_ROLES : B_ROLES).filter(r => allowedPos.includes(r.pos));
    const role = pool[Math.floor(Math.random() * pool.length)];

    // AI卡牌星级：B级1~3星，A级1~2星
    const maxStar = grade === 'B' ? 3 : 2;
    const star = Math.floor(Math.random() * maxStar) + 1;

    aiCards.push({
      grade: role.grade,
      role_name: role.name,
      pos: role.pos,
      star: star,
      roleData: role
    });
  }

  return aiCards;
}

/**
 * 读取玩家阵容卡牌，计算属性
 * cards: [{ card_uid, pos, grade, role_name, star }]
 */
function calcPlayerTeamAttrs(cards) {
  return cards.map(card => {
    const roleData = ALL_ROLES.find(r => r.name === card.role_name);
    if (!roleData) {
      // 后备：找不到角色数据时用基础属性
      return { threept: 10, midshot: 10, dunk: 10, rebound: 10, block: 10, speed: 10, pass: 10, steal: 10 };
    }
    return calcCardFinalAttrs(card, roleData);
  });
}

module.exports = {
  calcCardFinalAttrs,
  calcTeamPower,
  simulateBattle,
  generateAITeam,
  calcPlayerTeamAttrs
};
