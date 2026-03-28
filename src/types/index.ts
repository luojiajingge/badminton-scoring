export interface Player {
  id: string;
  name: string;
  avatar?: string;
  createdAt: number;
  rating?: number; // 积分，初始2000
}

export type MatchType = 'singles' | 'doubles';
export type MatchMode = 'single' | 'best-of-3' | 'best-of-5';
export type ScoreMode = 'point-by-point' | 'direct-input';

export interface Team {
  players: Player[];
  score: number;
  gamesWon: number;
}

export interface GameScore {
  team1Score: number;
  team2Score: number;
  winner?: 'team1' | 'team2';
}

export interface RatingChange {
  levelBefore?: number;
  playerId: string;
  playerName: string;
  delta: number;
  ratingBefore: number;
  ratingAfter: number;
}

export interface Match {
  id: string;
  type: MatchType;
  mode: MatchMode;
  scoreMode: ScoreMode;
  team1: Team;
  team2: Team;
  currentGame: number;
  games: GameScore[];
  status: 'ongoing' | 'completed';
  winner?: 'team1' | 'team2';
  createdAt: number;
  completedAt?: number;
  scoreHistory: ScoreHistoryEntry[];
  ratingChanges?: RatingChange[]; // 积分变动记录
  matchDate?: string; // 比赛所属日期 "2026-03-27"
}

export interface ScoreHistoryEntry {
  team: 'team1' | 'team2';
  gameIndex: number;
  timestamp: number;
  previousSnapshot?: UndoSnapshot | Match;
}

export interface UndoSnapshot {
  team: 'team1' | 'team2';
  gameIndex: number;
  prevTeam1Score: number;
  prevTeam2Score: number;
  prevGamesWon1: number;
  prevGamesWon2: number;
  prevCurrentGame: number;
  prevStatus: Match['status'];
  prevWinner: Match['winner'];
  hadGameWinner: boolean;
  prevPlayers: Player[];
}

export interface PlayerStats {
  playerId: string;
  totalMatches: number;
  wins: number;
  losses: number;
  winRate: number;
  points: number;
  rating: number;
  level: number; // 0-4, -1 means no level yet
  recentMatches: string[];
}

export interface HeadToHead {
  player1Id: string;
  player2Id: string;
  player1Wins: number;
  player2Wins: number;
  totalMatches: number;
}

export interface LeaderboardEntry {
  rank: number;
  player: Player;
  points: number;
  wins: number;
  losses: number;
  winRate: number;
  rating: number;
  level: number;
}

export type Theme = 'light' | 'dark';

export interface ExportData {
  version: string;
  exportedAt: number;
  players: Player[];
  matches: Match[];
}

// 比赛日清算系统相关类型
export interface PlayerSnapshot {
  playerId: string;
  name: string;
  rating: number;
  level: number;
  totalWins: number;
  totalLosses: number;
  totalMatches: number;
}

export interface DaySnapshot {
  id: string;
  date: string; // "2026-03-27"
  createdAt: number;
  playerSnapshots: PlayerSnapshot[];
  matchIds: string[];
  status: 'settled' | 'pending';
}

export interface SettlementResult {
  date: string;
  consistent: boolean; // 实时数据与清算结果是否一致
  playerResults: {
    playerId: string;
    name: string;
    realtimeRating: number; // 当前实时积分
    settledRating: number; // 清算后积分
    diff: number; // 差异
  }[];
  snapshot: DaySnapshot; // 清算快照（确认后保存）
}
