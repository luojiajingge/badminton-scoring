import { createClient } from '@supabase/supabase-js';
import type { DaySnapshot, PlayerSnapshot, Match, RatingChange } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('Supabase environment variables not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.');
}

export const supabase = createClient(supabaseUrl || '', supabaseKey || '');

// Supabase 表字段用 snake_case，需要转换
interface PlayerRow {
  id: string;
  name: string;
  avatar?: string;
  created_at: number;
  user_id: string;
  rating?: number;
  rating_changes?: RatingChange[] | null;
}

interface TeamRow {
  players: { id: string; name: string; avatar?: string; createdAt: number; rating?: number }[];
  score: number;
  gamesWon: number;
}

interface GameScoreRow {
  team1Score: number;
  team2Score: number;
  winner?: 'team1' | 'team2';
}

interface MatchRow {
  id: string;
  type: string;
  mode: string;
  score_mode: string;
  team1: TeamRow;
  team2: TeamRow;
  current_game: number;
  games: GameScoreRow[];
  status: string;
  winner?: string;
  created_at: number;
  completed_at?: number;
  user_id: string;
  rating?: number;
  rating_changes?: RatingChange[] | null;
  match_date?: string;
}

interface DaySnapshotRow {
  id: string;
  date: string;
  created_at: number;
  player_snapshots: PlayerSnapshot[];
  match_ids: string[];
  status: 'settled' | 'pending';
}

interface DaySnapshotUpdateRow {
  status?: 'settled' | 'pending';
  player_snapshots?: PlayerSnapshot[];
  match_ids?: string[];
}

function checkError(error: unknown): void {
  if (error) {
    const message = error instanceof Error ? error.message : (error as { message?: string })?.message || '数据库操作失败';
    throw new Error(message);
  }
}

export const db = {
  // 玩家
  async fetchPlayers(): Promise<PlayerRow[]> {
    const { data, error } = await supabase.from('players').select('*').order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async addPlayer(name: string, createdAt: number): Promise<PlayerRow> {
    const { data, error } = await supabase.from('players').insert({ name, created_at: createdAt }).select().single();
    if (error) throw error;
    return data;
  },

  async updatePlayer(id: string, name: string): Promise<void> {
    const { error } = await supabase.from('players').update({ name }).eq('id', id);
    checkError(error);
  },

  async updatePlayerRating(id: string, rating: number): Promise<void> {
    const { error } = await supabase.from('players').update({ rating }).eq('id', id);
    checkError(error);
  },

  async deletePlayer(id: string): Promise<void> {
    const { error } = await supabase.from('players').delete().eq('id', id);
    checkError(error);
  },

  // 比赛
  async fetchMatches(): Promise<MatchRow[]> {
    const { data, error } = await supabase.from('matches').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async addMatch(match: Match): Promise<MatchRow> {
    const row = {
      type: match.type,
      mode: match.mode,
      score_mode: match.scoreMode || 'point-by-point',
      team1: match.team1,
      team2: match.team2,
      current_game: match.currentGame,
      games: match.games,
      status: match.status,
      winner: match.winner || null,
      created_at: match.createdAt,
      completed_at: match.completedAt || null,
      rating_changes: match.ratingChanges || null,
      match_date: match.matchDate || null,
    };
    const { data, error } = await supabase.from('matches').insert(row).select().single();
    if (error) throw error;
    return data;
  },

  async updateMatch(id: string, match: Partial<Match>): Promise<void> {
    const row: Record<string, unknown> = {};
    if (match.team1 !== undefined) row.team1 = match.team1;
    if (match.team2 !== undefined) row.team2 = match.team2;
    if (match.currentGame !== undefined) row.current_game = match.currentGame;
    if (match.games !== undefined) row.games = match.games;
    if (match.status !== undefined) row.status = match.status;
    if (match.winner !== undefined) row.winner = match.winner || null;
    if (match.completedAt !== undefined) row.completed_at = match.completedAt || null;
    if (match.ratingChanges !== undefined) row.rating_changes = match.ratingChanges || null;
    const { error } = await supabase.from('matches').update(row).eq('id', id);
    checkError(error);
  },

  async deleteMatch(id: string): Promise<void> {
    const { error } = await supabase.from('matches').delete().eq('id', id);
    checkError(error);
  },

  async clearAllMatches(): Promise<void> {
    const { error } = await supabase.from('matches').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    checkError(error);
  },

  // 日清算快照
  async fetchDaySnapshots(): Promise<DaySnapshot[]> {
    const { data, error } = await supabase.from('day_snapshots').select('*').order('date', { ascending: true });
    if (error) throw error;
    return (data || []).map((row: DaySnapshotRow) => ({
      id: row.id,
      date: row.date,
      createdAt: row.created_at,
      playerSnapshots: row.player_snapshots as PlayerSnapshot[],
      matchIds: row.match_ids,
      status: row.status,
    }));
  },

  async addDaySnapshot(snapshot: DaySnapshot): Promise<void> {
    const row = {
      id: snapshot.id,
      date: snapshot.date,
      created_at: snapshot.createdAt,
      player_snapshots: snapshot.playerSnapshots,
      match_ids: snapshot.matchIds,
      status: snapshot.status,
    };
    const { error } = await supabase.from('day_snapshots').insert(row);
    if (error) throw error;
  },

  async updateDaySnapshot(id: string, snapshot: Partial<DaySnapshot>): Promise<void> {
    const row: DaySnapshotUpdateRow = {};
    if (snapshot.status !== undefined) row.status = snapshot.status;
    if (snapshot.playerSnapshots !== undefined) row.player_snapshots = snapshot.playerSnapshots;
    if (snapshot.matchIds !== undefined) row.match_ids = snapshot.matchIds;
    const { error } = await supabase.from('day_snapshots').update(row).eq('id', id);
    checkError(error);
  },

  async deleteDaySnapshot(id: string): Promise<void> {
    const { error } = await supabase.from('day_snapshots').delete().eq('id', id);
    checkError(error);
  },

  async deleteDaySnapshotsByDate(date: string): Promise<void> {
    const { error } = await supabase.from('day_snapshots').delete().eq('date', date);
    checkError(error);
  },

  // 获取指定日期之后的所有已清算快照
  async fetchDaySnapshotsAfterDate(date: string): Promise<DaySnapshot[]> {
    const { data, error } = await supabase.from('day_snapshots')
      .select('*')
      .gt('date', date)
      .eq('status', 'settled')
      .order('date', { ascending: true });
    if (error) throw error;
    return (data || []).map((row: DaySnapshotRow) => ({
      id: row.id,
      date: row.date,
      createdAt: row.created_at,
      playerSnapshots: row.player_snapshots as PlayerSnapshot[],
      matchIds: row.match_ids,
      status: row.status,
    }));
  },

  // 删除指定日期的所有比赛
  async deleteMatchesByDate(date: string): Promise<void> {
    const { error } = await supabase.from('matches').delete().eq('match_date', date);
    checkError(error);
  },
};
