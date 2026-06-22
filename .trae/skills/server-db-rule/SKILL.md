---
name: server-db-rule
description: 后端SQLite数据表、接口读写、账号校验、数据持久化规则，仅开发后端路由、数据库增删改查、登录注册时触发
---
# 后端数据库与接口规范
## 1 数据表严格对齐mvp.md九张表
players / player_cards / team_deck / match_records / player_season / player_achieve / league_ai_teams / league_daily_challenges / daily_mvp
字段名称、数据类型、关联关系不可擅自删减修改

## 2 数据读写约束
1. 玩家登录校验game_id+密码匹配，匹配成功下发玩家基础资源、卡牌、阵容、赛季数据
2. 卡牌新增、升星、消耗严格事务处理，避免数值错乱
3. 对战记录插入完整对局信息，player_stats_json序列化存储球员赛场数据
4. defense_log防守日志写入后自动裁剪只保留最新20条快照
5. 成就完成状态、奖励领取状态持久化标记，防止重复领取
6. 每日MVP记录（daily_mvp表）按日期唯一，结算后不可重复

## 3 接口安全与传参
1. 所有操作接口必须携带登录玩家唯一player_id身份校验
2. 抽卡、升星、对战、分解等数值变更操作后端二次校验资源充足，禁止前端信任传值
3. 时间戳统一后端生成存储，不采信前端传入时间
4. 昵称、游戏ID做简单字符过滤，禁止特殊字符

## 4 AI队伍数据处理
1. 联赛、精英AI队伍预插入数据库固定配置
2. 日常训练AI运行时内存随机生成，不写入数据库持久存储

## 5 赛季数据逻辑
赛季切换时批量重置season_points积分，更新season_num编号，保留卡牌、资源、成就数据不清除

## 6 每日MVP结算逻辑
1. 每日20:00自动触发结算（setInterval定时检查）
2. 统计当日PVP进攻方胜利次数最多的玩家
3. 写入daily_mvp表 + 发放300钻石奖励
4. 已结算日期不可重复结算

## 7 关键API端点
- POST /api/player/upgrade-all：一键合成，循环配对升星
- POST /api/player/decompose：一键分解，批量删除+发放奖励
- POST /api/player/exchange-shard：球星碎片兑换指定球员
- GET /api/pvp/battle-log：对战日志（进攻+防守合并查询）
- GET /api/pvp/daily-stats：每日单项统计榜
- GET /api/pvp/daily-mvp：查询当日MVP
- POST /api/pvp/settle-mvp：手动触发MVP结算
- GET /api/training/status：日常训练状态（剩余次数）
