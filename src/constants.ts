// 羽毛球比赛相关常量
export const BADMINTON = {
  /** 获胜所需分数 */
  WINNING_SCORE: 21,
  /** 单局最高分数（30分封顶） */
  MAX_SCORE: 30,
  /** 获胜所需最小分差 */
  MIN_WIN_DIFF: 2,
} as const;

/** 赛制类型：21分制 / 15分制 */
export type ScoringSystem = '21' | '15';

/** 各赛制规则配置 */
export const SCORING_SYSTEMS: Record<ScoringSystem, {
  label: string;
  /** 获胜所需分数 */
  winningScore: number;
  /** 单局最高分数（封顶） */
  maxScore: number;
  /** 获胜所需最小分差 */
  minWinDiff: number;
}> = {
  '21': { label: '21分制', winningScore: 21, maxScore: 30, minWinDiff: 2 },
  // 15分制：先到15分且净胜2分；14:14后延续；21分封顶（20:20时下一分决胜，21:20）
  '15': { label: '15分制', winningScore: 15, maxScore: 21, minWinDiff: 2 },
} as const;

/** 获取赛制规则，缺省为21分制（兼容历史数据） */
export const getScoringRules = (system?: ScoringSystem) => SCORING_SYSTEMS[system ?? '21'];

// 积分系统相关常量
export const RATING = {
  /** 初始积分 */
  INITIAL_RATING: 2000,
} as const;

// 统计相关常量
export const STATS = {
  /** 近期活动统计天数 */
  RECENT_ACTIVITY_DAYS: 30,
  /** 比赛历史记录保留上限 */
  SCORE_HISTORY_LIMIT: 50,
} as const;
