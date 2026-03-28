import { BADMINTON } from '../constants';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * 羽毛球比分校验
 * 规则：
 * - 21分制，先到21分且领先≥2分获胜
 * - 20:20后继续，直到一方领先≥2分
 * - 上限30分：29:29时下一分决胜（30:29）
 *
 * 关键约束：如果胜方得分≥22，则败方得分必须≥20
 *   （否则比赛在胜方到21分时就该结束了）
 */
export function validateGameScore(score1: number, score2: number): ValidationResult {
  if (score1 < 0 || score2 < 0) return { valid: false, error: '比分不能为负数' };
  if (score1 === score2) return { valid: false, error: '不能出现平局' };
  if (score1 > BADMINTON.MAX_SCORE || score2 > BADMINTON.MAX_SCORE) return { valid: false, error: '单局最高30分' };

  const maxScore = Math.max(score1, score2);
  const minScore = Math.min(score1, score2);
  const diff = maxScore - minScore;

  // 30分特殊：只能是30:29
  if (maxScore === BADMINTON.MAX_SCORE) {
    if (minScore !== BADMINTON.MAX_SCORE - 1) return { valid: false, error: '30分时对方必须是29分（30:29）' };
    return { valid: true };
  }

  // 胜方必须≥21
  if (maxScore < BADMINTON.WINNING_SCORE) return { valid: false, error: '至少需要达到21分才能获胜' };

  // 胜方=21：败方0~19都行（分差≥2即可）
  // 胜方=22~29：败方必须≥20（否则21分时就该结束了），且分差≥2
  if (maxScore === BADMINTON.WINNING_SCORE) {
    if (diff < BADMINTON.MIN_WIN_DIFF) return { valid: false, error: '需要领先2分才能获胜' };
    return { valid: true };
  }

  // 胜方22~29
  if (minScore < BADMINTON.WINNING_SCORE - 1) return { valid: false, error: `胜方${maxScore}分时，败方至少应有20分` };
  if (diff < BADMINTON.MIN_WIN_DIFF) return { valid: false, error: '需要领先2分才能获胜（除非30:29）' };
  return { valid: true };
}
