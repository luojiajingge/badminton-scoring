import { getScoringRules, SCORING_SYSTEMS } from '../constants';
import type { ScoringSystem } from '../types';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * 羽毛球比分校验
 * 规则（21分制为例）：
 * - 先到21分且领先≥2分获胜
 * - 20:20后继续，直到一方领先≥2分
 * - 上限30分：29:29时下一分决胜（30:29）
 *
 * 15分制：先到15分且领先≥2分，14:14后延续，上限21分（20:20时下一分决胜，21:20）
 *
 * 关键约束：如果胜方得分超过目标分，则败方得分必须≥目标分-1
 *   （否则比赛在胜方到目标分时就该结束了）
 */
export function validateGameScore(score1: number, score2: number, system: ScoringSystem = '21'): ValidationResult {
  const { winningScore, maxScore, minWinDiff } = getScoringRules(system);
  const label = SCORING_SYSTEMS[system].label;

  if (score1 < 0 || score2 < 0) return { valid: false, error: '比分不能为负数' };
  if (score1 === score2) return { valid: false, error: '不能出现平局' };
  if (score1 > maxScore || score2 > maxScore) return { valid: false, error: `${label}单局最高${maxScore}分` };

  const max = Math.max(score1, score2);
  const min = Math.min(score1, score2);
  const diff = max - min;

  // 封顶分特殊：只能是一分决胜（21分制30:29，15分制21:20）
  if (max === maxScore) {
    if (min !== maxScore - 1) return { valid: false, error: `${maxScore}分时对方必须是${maxScore - 1}分（${maxScore}:${maxScore - 1}）` };
    return { valid: true };
  }

  // 胜方必须达到目标分
  if (max < winningScore) return { valid: false, error: `${label}至少需要达到${winningScore}分才能获胜` };

  // 胜方=目标分：败方0~目标分-2都行（分差≥2即可）
  // 胜方超过目标分：败方必须≥目标分-1（否则到目标分时就该结束了），且分差≥2
  if (max === winningScore) {
    if (diff < minWinDiff) return { valid: false, error: '需要领先2分才能获胜' };
    return { valid: true };
  }

  // 胜方超过目标分且未到封顶
  if (min < winningScore - 1) return { valid: false, error: `胜方${max}分时，败方至少应有${winningScore - 1}分` };
  if (diff < minWinDiff) return { valid: false, error: `需要领先2分才能获胜（除非${maxScore}:${maxScore - 1}）` };
  return { valid: true };
}
