// 羽毛球比赛相关常量
export const BADMINTON = {
  /** 获胜所需分数 */
  WINNING_SCORE: 21,
  /** 单局最高分数（30分封顶） */
  MAX_SCORE: 30,
  /** 获胜所需最小分差 */
  MIN_WIN_DIFF: 2,
} as const;

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
