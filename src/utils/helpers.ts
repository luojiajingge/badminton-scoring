import { v4 as uuidv4 } from 'uuid';
import type { Player, Match, PlayerStats, HeadToHead, LeaderboardEntry, ExportData } from '../types';
import { BADMINTON, STATS } from '../constants';

export const generateId = (): string => uuidv4();
export const getWinningScore = (): number => BADMINTON.WINNING_SCORE;

export const isGameWon = (score1: number, score2: number): boolean => {
  const maxScore = Math.max(score1, score2);
  const minScore = Math.min(score1, score2);
  const diff = maxScore - minScore;
  // 30分封顶：只能是 30:29
  if (maxScore >= BADMINTON.MAX_SCORE) {
    return maxScore === BADMINTON.MAX_SCORE && minScore === BADMINTON.MAX_SCORE - 1;
  }
  // 正常：>=21 且分差>=2
  if (maxScore >= BADMINTON.WINNING_SCORE && diff >= BADMINTON.MIN_WIN_DIFF) return true;
  return false;
};

export const isMatchWon = (gamesWon: number, mode: Match['mode']): boolean => {
  if (mode === 'single') return true; // 单局赛直接判定
  const gamesNeeded = mode === 'best-of-3' ? 2 : 3;
  return gamesWon >= gamesNeeded;
};

export const getGamesNeeded = (mode: Match['mode']): number => {
  if (mode === 'single') return 1;
  return mode === 'best-of-3' ? 2 : 3;
};

export const getModeLabel = (mode: Match['mode']): string => {
  if (mode === 'single') return '单局赛';
  if (mode === 'best-of-3') return '三局两胜';
  return '五局三胜';
};

export const getScoreModeLabel = (mode: Match['scoreMode']): string => {
  return mode === 'point-by-point' ? '逐球计分' : '直接输入比分';
};

export const formatDate = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
};

export const formatDuration = (start: number, end: number): string => {
  const diff = Math.floor((end - start) / 1000);
  const minutes = Math.floor(diff / 60);
  const seconds = diff % 60;
  return `${minutes}分${seconds}秒`;
};

export const calculatePlayerStats = (playerId: string, matches: Match[]): PlayerStats => {
  const stats: PlayerStats = {
    playerId, totalMatches: 0, wins: 0, losses: 0, winRate: 0, points: 0, recentMatches: [], rating: 2000, level: -1,
  };
  matches.forEach((match) => {
    if (match.status !== 'completed') return;
    const inTeam1 = match.team1.players.some((p) => p.id === playerId);
    const inTeam2 = match.team2.players.some((p) => p.id === playerId);
    if (!inTeam1 && !inTeam2) return;
    stats.totalMatches++;
    if (match.winner === 'team1' && inTeam1) { stats.wins++; stats.points += 3; }
    else if (match.winner === 'team2' && inTeam2) { stats.wins++; stats.points += 3; }
    else { stats.losses++; }
    stats.recentMatches.push(match.id);
  });
  stats.winRate = stats.totalMatches > 0 ? Math.round((stats.wins / stats.totalMatches) * 100) : 0;
  stats.recentMatches = stats.recentMatches.slice(-10);
  return stats;
};

export const calculateHeadToHead = (player1Id: string, player2Id: string, matches: Match[]): HeadToHead => {
  const h2h: HeadToHead = { player1Id, player2Id, player1Wins: 0, player2Wins: 0, totalMatches: 0 };
  matches.forEach((match) => {
    if (match.status !== 'completed') return;
    const p1InTeam1 = match.team1.players.some((p) => p.id === player1Id);
    const p1InTeam2 = match.team2.players.some((p) => p.id === player1Id);
    const p2InTeam1 = match.team1.players.some((p) => p.id === player2Id);
    const p2InTeam2 = match.team2.players.some((p) => p.id === player2Id);
    if ((p1InTeam1 && p2InTeam1) || (p1InTeam2 && p2InTeam2)) return;
    if (!p1InTeam1 && !p1InTeam2) return;
    if (!p2InTeam1 && !p2InTeam2) return;
    h2h.totalMatches++;
    if (match.winner === 'team1') { if (p1InTeam1) h2h.player1Wins++; else h2h.player2Wins++; }
    else { if (p1InTeam2) h2h.player1Wins++; else h2h.player2Wins++; }
  });
  return h2h;
};

export const generateLeaderboard = (players: Player[], matches: Match[]): LeaderboardEntry[] => {
  const entries = players.map((player) => {
    const stats = calculatePlayerStats(player.id, matches);
    return { player, points: stats.points, wins: stats.wins, losses: stats.losses, winRate: stats.winRate, rating: stats.rating ?? 2000, level: stats.level ?? -1 };
  });
  entries.sort((a, b) => { if (b.points !== a.points) return b.points - a.points; return b.winRate - a.winRate; });
  return entries.map((entry, index) => ({ ...entry, rank: index + 1 }));
};

export const exportData = (players: Player[], matches: Match[]): void => {
  const data: ExportData = { version: '1.0.0', exportedAt: Date.now(), players, matches };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `badminton-data-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_ARRAY_LENGTH = 10000;

function validateExportData(data: unknown): ExportData {
  if (!data || typeof data !== 'object') {
    throw new Error('导入失败：文件内容不是有效的 JSON 对象');
  }
  const obj = data as Record<string, unknown>;

  // version
  if (typeof obj.version !== 'string') {
    throw new Error('导入失败：缺少版本号或版本号格式错误');
  }

  // players
  if (!Array.isArray(obj.players)) {
    throw new Error('导入失败：球员数据格式错误（应为数组）');
  }
  if (obj.players.length > MAX_ARRAY_LENGTH) {
    throw new Error(`导入失败：球员数量超过上限（${MAX_ARRAY_LENGTH}）`);
  }
  for (let i = 0; i < obj.players.length; i++) {
    const p = obj.players[i];
    if (!p || typeof p !== 'object') {
      throw new Error(`导入失败：第 ${i + 1} 个球员数据格式错误`);
    }
    const player = p as Record<string, unknown>;
    if (typeof player.id !== 'string') {
      throw new Error(`导入失败：第 ${i + 1} 个球员缺少 id`);
    }
    if (typeof player.name !== 'string') {
      throw new Error(`导入失败：第 ${i + 1} 个球员缺少 name`);
    }
    if (typeof player.createdAt !== 'number') {
      throw new Error(`导入失败：第 ${i + 1} 个球员缺少 createdAt`);
    }
  }

  // matches
  if (!Array.isArray(obj.matches)) {
    throw new Error('导入失败：比赛数据格式错误（应为数组）');
  }
  if (obj.matches.length > MAX_ARRAY_LENGTH) {
    throw new Error(`导入失败：比赛数量超过上限（${MAX_ARRAY_LENGTH}）`);
  }
  const validMatchTypes = ['singles', 'doubles'];
  const validMatchStatuses = ['ongoing', 'completed'];
  for (let i = 0; i < obj.matches.length; i++) {
    const m = obj.matches[i];
    if (!m || typeof m !== 'object') {
      throw new Error(`导入失败：第 ${i + 1} 场比赛数据格式错误`);
    }
    const match = m as Record<string, unknown>;
    if (typeof match.id !== 'string') {
      throw new Error(`导入失败：第 ${i + 1} 场比赛缺少 id`);
    }
    if (typeof match.type !== 'string' || !validMatchTypes.includes(match.type)) {
      throw new Error(`导入失败：第 ${i + 1} 场比赛 type 无效`);
    }
    if (typeof match.status !== 'string' || !validMatchStatuses.includes(match.status)) {
      throw new Error(`导入失败：第 ${i + 1} 场比赛 status 无效`);
    }
  }

  return obj as unknown as ExportData;
}

export const importData = (file: File): Promise<ExportData> => {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_FILE_SIZE) {
      reject(new Error('导入失败：文件大小超过 10MB 限制'));
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const raw = JSON.parse(e.target?.result as string);
        const data = validateExportData(raw);
        resolve(data);
      } catch (error) {
        reject(error instanceof Error ? error : new Error('导入失败：JSON 解析错误'));
      }
    };
    reader.onerror = () => reject(new Error('导入失败：文件读取错误'));
    reader.readAsText(file);
  });
};

export const getActivityFrequency = (matches: Match[]): Map<string, number> => {
  const frequency = new Map<string, number>();
  const thirtyDaysAgo = Date.now() - STATS.RECENT_ACTIVITY_DAYS * 24 * 60 * 60 * 1000;
  matches.forEach((match) => {
    if (match.createdAt < thirtyDaysAgo) return;
    const date = new Date(match.createdAt).toISOString().split('T')[0];
    frequency.set(date, (frequency.get(date) || 0) + 1);
  });
  return frequency;
};
