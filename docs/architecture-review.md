# 篮球游戏前端目录架构评审与优化方案

## 一、现状评估

### 1.1 当前目录结构

```
basketball-game/
├── config/
│   └── game-config.js          # 全局数值配置（前后端共用）
├── prd/
│   └── mvp.md                  # 需求文档
├── server/
│   ├── db/
│   │   └── database.js         # SQLite 初始化 + 迁移
│   ├── routes/
│   │   ├── auth.js             # 登录注册
│   │   ├── player.js           # 玩家数据 + 卡牌 + 阵容
│   │   ├── training.js         # 日常训练
│   │   ├── league.js           # 梯队联赛
│   │   ├── elite.js            # 精英挑战
│   │   ├── pvp.js              # PVP 对战 + 排行榜 + 段位
│   │   ├── achievement.js      # 成就系统
│   │   └── admin.js            # 后台管理
│   ├── battle-engine.js        # 战斗结算引擎
│   └── main.js                 # Express 入口
├── static/
│   ├── assets/                 # 9 张 S 角色 PNG 图片
│   ├── css/
│   │   └── style.css           # 全局样式（单文件 1400+ 行）
│   ├── js/
│   │   ├── api.js              # 统一请求封装
│   │   └── utils.js            # 工具函数（防抖/格式化/toast）
│   ├── index.html              # 登录
│   ├── register.html           # 注册
│   ├── home.html               # 主页
│   ├── cards.html              # 卡牌仓库
│   ├── lineup.html             # 出战阵容
│   ├── draw.html               # 抽卡
│   ├── train.html              # 日常训练
│   ├── league.html             # 梯队联赛
│   ├── elite.html              # 精英挑战
│   ├── pvp.html                # 真人 PVP
│   ├── leaderboard.html        # 排行榜
│   └── achievement.html        # 成就
├── package.json
└── .gitignore
```

### 1.2 是否达到上线标准

| 维度 | 评估 | 结论 |
|------|------|------|
| 功能完整性 | MVP 需求全部覆盖（登录/抽卡/阵容/AI对战/PVP/段位/排行榜/成就） | ✅ 达标 |
| 技术约束 | 纯 HTML5 + ES6 + CSS，无第三方框架，符合 project-standard | ✅ 达标 |
| 移动端适配 | rem 布局，触摸尺寸适配，软键盘兼容 | ✅ 达标 |
| 数据安全 | 后端二次校验，不信任前端传值 | ✅ 达标 |
| 代码可维护性 | 大量内联脚本、重复逻辑、单文件过大 | ⚠️ 有风险 |
| 前端模块化 | 无组件分层，页面间代码复制粘贴 | ❌ 缺陷 |
| 错误处理 | API 无统一异常捕获，无加载态/空态兜底 | ⚠️ 有风险 |
| 样式可维护性 | 单 CSS 文件 1400+ 行，无分层 | ⚠️ 有风险 |

**综合结论**：功能层面达到 MVP 上线标准，但代码架构存在可维护性缺陷，适合快速验证阶段。若后续有迭代需求（新增玩法/多人协作），需优先进行架构优化。

### 1.3 现有架构缺陷清单

| 编号 | 缺陷 | 影响 | 严重度 |
|------|------|------|--------|
| D-1 | 每个 HTML 页面内联 200-1000 行 `<script>` 代码 | 页面臃肿，无法复用，修改需逐页排查 | 高 |
| D-2 | 段位等级(getRankTier)、卡牌渲染(renderCard)、导航栏(nav)等逻辑在 10+ 页面重复复制 | 修改一处需同步改 10 个文件，极易遗漏 | 高 |
| D-3 | API 请求无统一错误处理/loading 态 | 接口超时或报错时页面白屏，无用户反馈 | 高 |
| D-4 | style.css 单文件 1400+ 行，基础样式/组件样式/页面样式混杂 | 难以定位样式，新增页面容易冲突 | 中 |
| D-5 | 无公共弹窗/模态框组件 | 每个页面各自实现弹窗，样式不一致 | 中 |
| D-6 | 像素素材(png)无分类管理，仅 9 张平铺 assets/ | 后续素材增多后难以管理 | 低 |
| D-7 | game-config.js 前后端共用，通过 Express 静态托管暴露 | 配置变更需同时考虑两端影响 | 低 |
| D-8 | 无页面路由管理，页面跳转硬编码 `window.location.href` | 无法统一管理登录态拦截、页面预加载 | 中 |
| D-9 | 无 localStorage 状态管理层 | 登录态/玩家数据散落在各页面 script 中 | 中 |
| D-10 | admin.html 暴露在 static/ 目录下，无访问控制 | 安全风险 | 中 |

---

## 二、优化维度分析

### 2.1 业务模块拆分

**现状**：13 个 HTML 页面平铺在 static/ 根目录，无业务边界划分。

**优化方向**：按业务域分组，形成清晰的模块边界。

```
业务域划分：
├── 账号域：登录、注册、主页（个人信息+签名+设置）
├── 卡牌域：卡牌仓库、抽卡、阵容编排
├── 对战域：PVP 排位/娱乐、AI 联赛、AI 精英
├── 社交域：排行榜、成就、赛季
└── 管理域：admin 后台
```

### 2.2 组件分层

**现状**：每个页面自包含 HTML + CSS + JS，无分层概念。

**优化方向**：三层分离 —— 通用基础层 / 业务组件层 / 页面层。

```
层级职责：
- 基础层（core/）：API 封装、路由管理、状态管理、工具函数、全局样式
- 组件层（components/）：导航栏、弹窗、卡牌卡片、排行榜列表、球员数据表格
- 页面层（pages/）：各页面仅负责数据获取 + 组件组装 + 页面特有逻辑
```

### 2.3 静态像素资源管理

**现状**：9 张 PNG 平铺 assets/，无分类。

**优化方向**：按类型分目录，预留扩展空间。

```
assets/
├── players/          # 球员立绘（asheng.png, azhen.png, ...）
├── ui/               # UI 元素（边框、背景、图标）
├── effects/          # 特效素材（闪光、光晕）
└── bg/               # 背景图（登录页背景等）
```

### 2.4 接口请求层

**现状**：api.js 仅 30 行，无错误处理、无重试、无拦截。

**优化方向**：增强为完整的请求管理层。

```
增强点：
1. 统一 try-catch 包裹，网络异常自动 toast
2. 响应 code !== 0 自动弹出错误提示
3. 请求 loading 态自动管理（按钮 disabled + loading 文字）
4. 登录态过期自动跳转登录页
5. 请求防抖封装（防止重复点击）
```

### 2.5 工具函数

**现状**：utils.js 仅 5 个函数（防抖/格式数字/格式时间/toast/星级/品级颜色）。

**优化方向**：扩充为完整的工具库。

```
需新增的工具函数：
- renderCard(cardData)         # 卡牌卡片渲染模板（10+ 页面复用）
- renderStars(star)            # 已有，需统一调用
- gradeColor(grade)            # 已有
- getRankTier(points)          # 段位计算（当前在 5+ 页面重复定义）
- formatTime(ts)               # 已有
- renderPlayerStats(stats)     # 球员数据表格渲染
- renderNav(activePage)        # 底部导航栏渲染
- checkLogin()                 # 登录态校验
- debounce(fn, delay)          # 已有
- throttle(fn, delay)          # 节流函数
```

### 2.6 全局样式分层

**现状**：style.css 单文件 1400+ 行。

**优化方向**：拆分为多个职责单一的样式文件。

```
css/
├── base.css           # 重置 + CSS 变量 + 基础排版
├── components.css     # 按钮/输入框/弹窗/卡片/导航等通用组件
├── layout.css         # 页面容器/底部导航/间距规范
├── pages.css          # 页面专属样式（PVP/抽卡/阵容等）
└── animations.css     # 动画/过渡/闪光特效
```

### 2.7 页面路由管理

**现状**：页面跳转硬编码 `window.location.href = 'xxx.html'`，散落在 13 个文件中。

**优化方向**：统一路由管理模块。

```javascript
// 路由配置
const Router = {
  routes: {
    home: 'home.html',
    cards: 'cards.html',
    lineup: 'lineup.html',
    draw: 'draw.html',
    pvp: 'pvp.html',
    leaderboard: 'leaderboard.html',
    achievement: 'achievement.html',
    league: 'league.html',
    elite: 'elite.html',
  },
  navigate(page) { window.location.href = this.routes[page] || page; },
  checkAuth() {
    if (!localStorage.getItem('player_id')) {
      this.navigate('index');
      return false;
    }
    return true;
  }
};
```

### 2.8 错误处理

**现状**：各页面自行处理 API 响应，无统一规范。

**优化方向**：分层错误处理策略。

```
处理层级：
1. 网络层：fetch 失败 → toast "网络异常" + 恢复按钮状态
2. 业务层：code !== 0 → toast(msg) + 特定错误码处理（如 401 跳登录）
3. 页面层：空数据 → 渲染兜底占位 UI（"暂无数据" / "加载失败，点击重试"）
```

### 2.9 公共弹窗

**现状**：战斗结果弹窗、卡牌详情弹窗、分解确认弹窗各自实现。

**优化方向**：统一 Modal 组件。

```
Modal 类型：
- confirm(title, message, onConfirm)    # 确认操作（分解/兑换）
- alert(title, message)                 # 信息提示
- battleResult(data)                    # 战斗结果专用弹窗
- cardDetail(cardData)                  # 卡牌详情专用弹窗
```

### 2.10 状态管理

**现状**：玩家数据通过 localStorage 存储 player_id，每次进入页面重新请求。

**优化方向**：轻量级页面状态管理。

```
状态分类：
- 持久态（localStorage）：player_id, game_id, nickname
- 会话态（sessionStorage）：当前页面 tab 状态、筛选条件
- 请求态（内存）：玩家资源(金币/钻石/碎片)、卡牌列表、阵容数据
  → 提供 cache 机制，避免重复请求（设置合理 TTL）
```

---

## 三、优化后的标准目录结构

```
basketball-game/
│
├── config/
│   └── game-config.js                # 数值配置（前后端共用，保持不变）
│
├── prd/
│   └── mvp.md
│
├── server/                           # 后端（保持不变，结构已合理）
│   ├── db/
│   │   └── database.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── player.js
│   │   ├── training.js
│   │   ├── league.js
│   │   ├── elite.js
│   │   ├── pvp.js
│   │   ├── achievement.js
│   │   └── admin.js
│   ├── battle-engine.js
│   └── main.js
│
├── static/                           # 前端静态资源根目录
│   │
│   ├── css/                          # ── 样式分层 ──
│   │   ├── base.css                  #   重置 + CSS变量 + 排版基础
│   │   ├── components.css            #   通用组件样式（按钮/输入/弹窗/卡片/导航）
│   │   ├── layout.css                #   页面容器 + 底部导航 + 间距规范
│   │   ├── pages.css                 #   页面专属样式
│   │   └── animations.css            #   动画/过渡/特效
│   │
│   ├── js/                           # ── 公共脚本层 ──
│   │   ├── core/                     #   基础能力层
│   │   │   ├── api.js                #     统一请求封装（增强版：错误处理/loading/防抖）
│   │   │   ├── router.js             #     页面路由管理 + 登录态拦截
│   │   │   └── store.js              #     轻量状态管理（缓存/玩家数据/TTL）
│   │   ├── components/               #   公共组件
│   │   │   ├── nav.js                #     底部导航栏渲染
│   │   │   ├── modal.js              #     统一弹窗（confirm/alert/battleResult/cardDetail）
│   │   │   ├── card.js               #     卡牌卡片渲染模板
│   │   │   ├── rank-badge.js         #     段位徽章组件
│   │   │   └── stats-table.js        #     球员数据表格组件
│   │   └── utils.js                  #   工具函数（防抖/格式化/星级/品级颜色/段位计算）
│   │
│   ├── assets/                       # ── 像素素材分目录 ──
│   │   ├── players/                  #   球员立绘
│   │   │   ├── asheng.png
│   │   │   ├── azhen.png
│   │   │   ├── huazai.png
│   │   │   ├── naicheng.png
│   │   │   ├── taoda.png
│   │   │   ├── taoer.png
│   │   │   ├── xiaoliang.png
│   │   │   └── yongzi.png
│   │   └── bg/                       #   背景图
│   │       └── login-bg.jpg
│   │
│   └── pages/                        # ── 页面层（仅保留页面特有逻辑）──
│       ├── index.html                #   登录
│       ├── register.html             #   注册
│       ├── home.html                 #   主页
│       ├── cards.html                #   卡牌仓库
│       ├── lineup.html               #   出战阵容
│       ├── draw.html                 #   抽卡
│       ├── pvp.html                  #   真人 PVP（含排行榜/今日数据/对战日志）
│       ├── leaderboard.html          #   排行榜
│       ├── league.html               #   梯队联赛
│       ├── elite.html                #   精英挑战
│       ├── train.html                #   日常训练
│       └── achievement.html          #   成就
│
├── package.json
└── .gitignore
```

### 关键设计原则

| 原则 | 说明 |
|------|------|
| **公共 vs 业务分离** | js/core/ + js/components/ + css/ 为公共层，pages/ 为业务层 |
| **单文件职责单一** | 每个 CSS 文件只管一类样式，每个 JS 组件只做一件事 |
| **页面瘦身** | 页面 HTML 仅包含结构标记 + 页面特有 script（< 100 行理想） |
| **资源分目录** | assets/ 按类型分组，避免平铺膨胀 |
| **后端不动** | server/ 结构已合理（路由分文件 + 引擎独立），保持不变 |

---

## 四、迁移改造步骤

### 阶段一：公共层抽取（优先级最高，消除重复代码）

**目标**：消除 10+ 页面中的重复逻辑，建立可复用基础。

| 步骤 | 操作 | 涉及文件 | 风险 |
|------|------|----------|------|
| 1.1 | 创建 js/core/router.js — 统一登录校验 + 页面跳转 | 新建 + 各页面 script 替换 | 低 |
| 1.2 | 增强 js/api.js — 添加统一 try-catch + 错误 toast + loading 管理 | 修改 api.js + 各页面适配 | 中 |
| 1.3 | 扩充 js/utils.js — 合入 getRankTier()、renderStars() 等重复函数 | 修改 utils.js + 各页面删除重复定义 | 低 |
| 1.4 | 创建 js/components/nav.js — 统一底部导航渲染 | 新建 + 各页面替换内联导航 HTML | 低 |
| 1.5 | 创建 js/components/modal.js — 统一弹窗组件 | 新建 + pvp/cards/lineup 适配 | 中 |

### 阶段二：样式分层（降低 CSS 维护成本）

| 步骤 | 操作 | 涉及文件 |
|------|------|----------|
| 2.1 | 从 style.css 拆出 CSS 变量 + 重置 → base.css | 拆分 style.css |
| 2.2 | 拆出按钮/输入/弹窗/卡片样式 → components.css | 拆分 style.css |
| 2.3 | 拆出页面容器/导航/间距 → layout.css | 拆分 style.css |
| 2.4 | 拆出 PVP/抽卡/阵容等页面专属样式 → pages.css | 拆分 style.css |
| 2.5 | 各 HTML 页面 `<link>` 引入顺序：base → components → layout → pages | 修改所有 HTML |

### 阶段三：目录重组（页面迁移到 pages/）

| 步骤 | 操作 | 注意事项 |
|------|------|----------|
| 3.1 | 创建 static/pages/ 目录 | — |
| 3.2 | 移动所有 HTML 到 pages/ | 修改 server/main.js 的静态托管路径 |
| 3.3 | 更新所有页面间的跳转路径（相对路径调整） | 使用 router.js 统一管理 |
| 3.4 | 移动 assets/ 图片到 assets/players/ + assets/bg/ | 更新各页面图片引用路径 |

### 阶段四：页面瘦身（各页面内联代码外迁）

| 步骤 | 操作 | 目标 |
|------|------|------|
| 4.1 | 提取各页面的卡牌渲染逻辑 → components/card.js | 消除 cards/lineup/draw/pvp 中的重复渲染 |
| 4.2 | 提取段位徽章渲染 → components/rank-badge.js | 消除 pvp/home/leaderboard 中的重复逻辑 |
| 4.3 | 提取球员数据表格 → components/stats-table.js | 消除 pvp/train/league/elite 中的重复表格 |
| 4.4 | 各页面 script 控制在 100-200 行以内 | 仅保留数据获取 + 组件组装 + 页面特有逻辑 |

### 阶段五：增强完善（上线级打磨）

| 步骤 | 操作 |
|------|------|
| 5.1 | 创建 js/core/store.js — 玩家数据缓存 + TTL |
| 5.2 | 所有页面添加 loading 态 + 空态兜底 UI |
| 5.3 | admin.html 添加简单访问控制（密码弹窗或路由守卫） |
| 5.4 | 统一所有页面的 `<head>` 引入顺序规范 |

---

## 五、分层开发规范

### 5.1 文件引用顺序规范

每个 HTML 页面的 `<head>` 必须按以下顺序引入：

```html
<!-- 1. 基础样式 -->
<link rel="stylesheet" href="../css/base.css">
<link rel="stylesheet" href="../css/components.css">
<link rel="stylesheet" href="../css/layout.css">
<link rel="stylesheet" href="../css/pages.css">
<link rel="stylesheet" href="../css/animations.css">

<!-- 2. 基础脚本 -->
<script src="../js/utils.js"></script>
<script src="../js/core/api.js"></script>
<script src="../js/core/router.js"></script>
<script src="../js/core/store.js"></script>

<!-- 3. 公共组件（按需引入） -->
<script src="../js/components/nav.js"></script>
<script src="../js/components/modal.js"></script>
<script src="../js/components/card.js"></script>
<script src="../js/components/rank-badge.js"></script>

<!-- 4. 页面配置（game-config） -->
<script src="/config/game-config.js"></script>
```

### 5.2 页面 script 编写规范

```javascript
// 页面内联 script 标准结构
(function() {
  // 1. 登录校验
  if (!Router.checkAuth()) return;

  // 2. 页面状态
  let pageData = [];

  // 3. 初始化
  async function init() {
    renderNav('pvp');  // 渲染导航，标记当前页
    await loadData();
    bindEvents();
  }

  // 4. 数据加载
  async function loadData() {
    try {
      const res = await API.get('/api/xxx');
      if (res.code !== 0) { showEmpty(); return; }
      pageData = res.data;
      render();
    } catch (e) {
      showError();
    }
  }

  // 5. 渲染
  function render() { /* 组装组件 */ }

  // 6. 事件绑定
  function bindEvents() { /* 事件监听 */ }

  // 7. 启动
  init();
})();
```

### 5.3 新增页面模板

新增页面时，遵循以下最小模板：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>页面标题 - 像素篮球</title>
  <!-- 样式引入（按规范顺序） -->
  <!-- 脚本引入（按规范顺序） -->
</head>
<body>
  <div class="page-container">
    <!-- 页面内容 -->
  </div>
  <div class="bottom-spacer"></div>
  <div id="navContainer"></div>

  <script>
    // 页面逻辑（目标 < 150 行）
  </script>
</body>
</html>
```

---

## 六、长期迭代维护优势

| 维度 | 当前状态 | 优化后收益 |
|------|----------|------------|
| **修改成本** | 改段位逻辑需改 5+ 文件 | 改 utils.js 一处全局生效 |
| **新增页面** | 复制现有页面 500+ 行，删改 | 引入公共层 + 写 100 行页面逻辑 |
| **样式调整** | 在 1400 行 CSS 中搜索定位 | 定位到具体分层文件，< 200 行 |
| **Bug 排查** | 13 个独立 script 逐个排查 | 公共层统一排查，页面层快速定位 |
| **多人协作** | 同一文件冲突频繁 | 按模块分工，公共层/页面层独立修改 |
| **新功能扩展** | 在现有页面追加代码，越来越臃肿 | 新增组件 → 页面引入组装 |
| **测试验证** | 无法单元测试内联代码 | 公共 JS 模块可独立验证 |
| **性能优化** | 每个页面加载全部 CSS | 按需引入，减少冗余样式 |

---

## 七、风险提示与约束

1. **渐进式改造**：遵循 project-standard "最小范围修改" 原则，分阶段实施，每次改造后确保功能不回退
2. **路径兼容**：Express 静态托管路径需同步调整（main.js），避免 404
3. **浏览器缓存**：CSS/JS 拆分后需考虑缓存策略（文件名 hash 或版本号）
4. **MVP 范围**：目录优化属于工程化改进，不涉及新功能开发，符合 mvp.md 约束
5. **像素美术不变**：优化仅涉及代码组织，不修改任何像素素材和视觉风格
