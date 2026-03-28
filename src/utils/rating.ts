import type { Player, Match, RatingChange } from '../types';
import { RATING } from '../constants';

const INITIAL_RATING = RATING.INITIAL_RATING;

// K值表：根据级别差，返回 { weakWin, strongWin }
// weakWin: 弱方赢时每人加减分
// strongWin: 强方赢时每人加减分
const K_TABLE: Record<number, { weakWin: number; strongWin: number }> = {
  0: { weakWin: 50, strongWin: 50 },
  1: { weakWin: 65, strongWin: 35 },
  2: { weakWin: 75, strongWin: 25 },
  3: { weakWin: 85, strongWin: 15 },
  4: { weakWin: 90, strongWin: 10 },
};

export function getInitialRating(): number {
  return INITIAL_RATING;
}

export function getPlayerRating(player: Player): number {
  return player.rating ?? INITIAL_RATING;
}

// 计算所有球员的级别（基于积分排名）
// L0: 前20%, L1: 20-40%, L2: 40-60%, L3: 60-80%, L4: 后20%
// 不足5人全部 L2，未参赛(无积分)返回 -1
export function calculateLevels(players: Player[], activeIds?: Set<string>): Map<string, number> {
  const levels = new Map<string, number>();
  
  // 只计算有比赛记录的球员：优先用 activeIds，否则 fallback 到 rating != 初始值
  const rated = players.filter(p => {
    if (activeIds) return activeIds.has(p.id);
    return p.rating !== undefined && p.rating !== INITIAL_RATING;
  });
  
  if (rated.length < 5) {
    // 不足5人，有积分的全部 L2
    rated.forEach(p => levels.set(p.id, 2));
    return levels;
  }
  
  // 按积分从高到低排序
  const sorted = [...rated].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || a.name.localeCompare(b.name, 'zh'));
  const total = sorted.length;
  
  sorted.forEach((player, index) => {
    const percentile = index / total;
    if (percentile < 0.2) levels.set(player.id, 0);
    else if (percentile < 0.4) levels.set(player.id, 1);
    else if (percentile < 0.6) levels.set(player.id, 2);
    else if (percentile < 0.8) levels.set(player.id, 3);
    else levels.set(player.id, 4);
  });
  
  return levels;
}

export function getLevelLabel(level: number): string {
  if (level < 0) return '未定级';
  return `L${level}`;
}

// 获取队伍平均级别（用于双打）
function getTeamAvgLevel(players: Player[], levels: Map<string, number>): number {
  const playerLevels = players.map(p => {
    const l = levels.get(p.id);
    return l !== undefined && l >= 0 ? l : null; // null = 无级别
  });
  
  // 如果有人没有级别，返回 null
  if (playerLevels.some(l => l === null)) return -1; // -1 表示有人无级别
  
  const avg = playerLevels.reduce((sum, l) => sum + (l ?? 0), 0) / playerLevels.length;
  return Math.round(avg);
}

// 计算比赛积分变动（零和）
export function calculateRatingChanges(
  match: Match,
  players: Player[],
  levels: Map<string, number>,
): RatingChange[] {
  if (match.status !== 'completed' || !match.winner) return [];
  
  const allPlayers = [...match.team1.players, ...match.team2.players];
  const isWinner = (p: Player) => {
    if (match.winner === 'team1') return match.team1.players.some(tp => tp.id === p.id);
    return match.team2.players.some(tp => tp.id === p.id);
  };
  
  let kValue: number;
  
  if (match.type === 'singles') {
    // 单打：直接比较两人级别
    const p1 = match.team1.players[0];
    const p2 = match.team2.players[0];
    const l1 = levels.get(p1.id);
    const l2 = levels.get(p2.id);
    
    if (l1 === undefined || l2 === undefined || l1 < 0 || l2 < 0) {
      kValue = 50; // 有人无级别，按同级
    } else {
      const diff = l1 - l2; // 正值 = p1级别高
      const entry = K_TABLE[Math.round(Math.abs(diff))] || K_TABLE[4];
      if (diff >= 0) {
        // L数值小=级别高=强方。diff>=0 意味着 l1>=l2，即 p1 级别更低=更弱
        kValue = match.winner === 'team1' ? entry.weakWin : entry.strongWin;
      } else {
        kValue = match.winner === 'team1' ? entry.strongWin : entry.weakWin;
      }
    }
  } else {
    // 双打：比较队伍平均级别
    const avg1 = getTeamAvgLevel(match.team1.players, levels);
    const avg2 = getTeamAvgLevel(match.team2.players, levels);
    
    if (avg1 < 0 || avg2 < 0) {
      kValue = 50; // 有人无级别，按同级
    } else {
      const diff = avg1 - avg2;
      const entry = K_TABLE[Math.round(Math.abs(diff))] || K_TABLE[4];
      if (diff >= 0) {
        // L数值小=级别高=强方。diff>=0 意味着 avg1>=avg2，即 team1 平均级别更低=更弱
        kValue = match.winner === 'team1' ? entry.weakWin : entry.strongWin;
      } else {
        kValue = match.winner === 'team1' ? entry.strongWin : entry.weakWin;
      }
    }
  }
  
  return allPlayers.map(player => {
    const ratingBefore = getPlayerRating(player);
    const won = isWinner(player);
    const delta = won ? kValue : -kValue;
    const lv = levels.get(player.id);
    return {
      playerId: player.id,
      playerName: player.name,
      delta,
      ratingBefore,
      ratingAfter: Math.max(0, ratingBefore + delta),
      levelBefore: lv !== undefined ? lv : -1,
    };
  });
}

// 应用积分变动到 players
export function applyRatingChanges(players: Player[], changes: RatingChange[]): Player[] {
  const changeMap = new Map(changes.map(c => [c.playerId, c]));
  return players.map(p => {
    const change = changeMap.get(p.id);
    if (change) {
      return { ...p, rating: change.ratingAfter };
    }
    return p;
  });
}
