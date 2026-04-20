15/04/2026

# 🏸 云行智远，羽你共舞 — 羽毛球比分记录系统

一个面向团队羽毛球活动的计分与管理系统，支持单打/双打、积分排名、统计分析和快速录入。

## ✨ 功能特性

- **比赛计分**：单打/双打，单局赛/三局两胜/五局三胜
- **两种计分方式**：逐球计分（+1按钮）和直接输入比分
- **快速录入**：文字输入比赛结果，智能拆分连写名字，拼音模糊匹配
- **积分系统**：Elo 风格积分，K 值随级别差动态调整
- **级别划分**：L0~L4 动态分级（基于积分排名）
- **比赛日清算**：日终核对积分，支持回滚
- **统计分析**：胜率排行、对阵记录、活动频率热力图
- **球员图形化统计**：胜负趋势、得分对比、对手战绩等图表
- **数据管理**：JSON 导入导出、批量删除
- **云端同步**：Supabase（PostgreSQL）多设备数据同步
- **主题切换**：亮色/暗色模式

## 🛠 技术栈

| 技术 | 用途 |
|------|------|
| React 19 | UI 框架 |
| TypeScript | 类型安全 |
| Vite 8 | 构建工具 |
| Zustand | 状态管理（持久化 localStorage） |
| Supabase | 云端数据库 |
| pinyin-pro | 拼音搜索匹配 |
| recharts | 图表可视化 |
| Vitest | 单元测试 |

## 🚀 快速开始

```bash
# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入 Supabase URL 和 Key

# 启动开发服务器
npm run dev

# 运行测试
npm test

# 构建
npm run build
```

## 📁 项目结构

```
src/
├── components/          # UI 组件
│   ├── MatchSetup.tsx   # 比赛设置（手动/快速录入）
│   ├── ScoreBoard.tsx   # 计分板
│   ├── PlayerManagement.tsx  # 球员管理 + 图表统计
│   ├── Leaderboard.tsx  # 积分排行榜
│   ├── MatchHistory.tsx # 比赛历史
│   ├── Statistics.tsx   # 统计分析
│   ├── Settings.tsx     # 设置
│   └── ...
├── store/index.ts       # Zustand 全局状态
├── utils/               # 工具函数
│   ├── rating.ts        # 积分/级别算法
│   ├── scoreValidator.ts # 比分校验
│   ├── helpers.ts       # 通用工具
│   ├── pinyin.ts        # 拼音匹配
│   └── nameSplitter.ts  # 名字智能拆分
├── services/
│   ├── supabase.ts      # 云端数据库服务
│   └── storage.ts       # 本地存储（备用）
└── __tests__/           # 单元测试
```

## 📊 积分规则

- 初始积分：2000 分
- 级别：L0（前20%）~ L4（后20%），按积分排名动态划分
- K 值表：

| 级别差 | 弱方赢 | 强方赢 |
|--------|--------|--------|
| 0 | ±50 | ±50 |
| 1 | ±65 | ±35 |
| 2 | ±75 | ±25 |
| 3 | ±85 | ±15 |
| 4 | ±90 | ±10 |

## 📄 文档

- [需求与设计文档](./docs/需求与设计文档.md) — 完整的项目分析文档

## 📝 License

MIT
