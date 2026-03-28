import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Player, Match, MatchType, MatchMode, ScoreMode, Theme, UndoSnapshot, DaySnapshot, PlayerSnapshot, SettlementResult } from '../types';
import { generateId, isGameWon, isMatchWon } from '../utils/helpers';
import { calculateRatingChanges, applyRatingChanges, calculateLevels, getInitialRating } from '../utils/rating';
import { db } from '../services/supabase';
import { STATS, RATING } from '../constants';

type NotificationType = 'success' | 'error' | 'info';

interface Notification {
  message: string;
  type: NotificationType;
}

interface AppState {
  players: Player[];
  matches: Match[];
  currentMatch: Match | null;
  theme: Theme;
  loading: boolean;
  daySnapshots: DaySnapshot[];
  notification: Notification | null;

  // 通知
  showNotification: (message: string, type: NotificationType) => void;
  clearNotification: () => void;

  // 数据加载
  loadFromCloud: () => Promise<void>;

  addPlayer: (name: string) => Promise<Player>;
  updatePlayer: (id: string, name: string) => Promise<void>;
  deletePlayer: (id: string) => Promise<void>;
  createMatch: (type: MatchType, mode: MatchMode, scoreMode: ScoreMode, team1Players: Player[], team2Players: Player[], matchDate?: string) => Match;
  updateCurrentMatch: (match: Match) => void;
  addScore: (team: 'team1' | 'team2') => Promise<void>;
  setGameScore: (gameIndex: number, team1Score: number, team2Score: number) => Promise<void>;
  undoScore: () => void;
  finishMatch: () => Promise<void>;
  deleteMatch: (id: string) => Promise<void>;
  deleteMatches: (ids: string[]) => Promise<void>;
  resetAllRatings: () => Promise<void>;
  loadMatch: (id: string) => void;
  toggleTheme: () => void;
  importData: (players: Player[], matches: Match[]) => Promise<void>;
  clearAllData: () => Promise<void>;

  // 比赛日清算系统
  getUnsettledDates: () => string[];
  settleDay: (date: string) => Promise<SettlementResult>;
  confirmSettlement: (date: string, snapshot: DaySnapshot) => Promise<void>;
  rollbackDay: (date: string) => Promise<void>;
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : '操作失败';
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      players: [],
      matches: [],
      currentMatch: null,
      theme: 'light' as Theme,
      loading: false,
      daySnapshots: [],
      notification: null,

      showNotification: (message: string, type: NotificationType) => {
        set({ notification: { message, type } });
      },

      clearNotification: () => {
        set({ notification: null });
      },

      // 从云端加载数据
      loadFromCloud: async () => {
        set({ loading: true });
        try {
          const [dbPlayers, dbMatches, dbSnapshots] = await Promise.all([
            db.fetchPlayers(),
            db.fetchMatches(),
            db.fetchDaySnapshots(),
          ]);
          const players: Player[] = dbPlayers.map(p => ({
            id: p.id, name: p.name, avatar: p.avatar, createdAt: p.created_at,
            rating: p.rating ?? getInitialRating(),
          }));
          const matches: Match[] = dbMatches.map(m => ({
            id: m.id, type: m.type as MatchType, mode: m.mode as MatchMode,
            scoreMode: (m.score_mode || 'point-by-point') as ScoreMode,
            team1: m.team1, team2: m.team2, currentGame: m.current_game,
            games: m.games, status: m.status as Match['status'],
            winner: m.winner as Match['winner'], createdAt: m.created_at,
            completedAt: m.completed_at, scoreHistory: [], ratingChanges: m.rating_changes || undefined,
            matchDate: m.match_date,
          }));
          set({ players, matches, daySnapshots: dbSnapshots });
        } catch (err) {
          console.error('加载云端数据失败:', err);
          get().showNotification(getErrorMessage(err), 'error');
        } finally {
          set({ loading: false });
        }
      },

      addPlayer: async (name: string) => {
        const player: Player = { id: generateId(), name, createdAt: Date.now(), rating: getInitialRating() };
        set((state) => ({ players: [...state.players, player] }));
        try {
          const row = await db.addPlayer(name, player.createdAt);
          set((state) => ({
            players: state.players.map(p => p.id === player.id ? { ...p, id: row.id } : p),
          }));
          player.id = row.id;
        } catch (err) {
          // 回滚：移除刚添加的 player
          set((state) => ({ players: state.players.filter(p => p.id !== player.id) }));
          get().showNotification(getErrorMessage(err), 'error');
        }
        return player;
      },

      updatePlayer: async (id: string, name: string) => {
        const oldName = get().players.find(p => p.id === id)?.name;
        set((state) => ({ players: state.players.map(p => p.id === id ? { ...p, name } : p) }));
        try {
          await db.updatePlayer(id, name);
        } catch (err) {
          // 回滚：恢复旧名称
          if (oldName !== undefined) {
            set((state) => ({ players: state.players.map(p => p.id === id ? { ...p, name: oldName } : p) }));
          }
          get().showNotification(getErrorMessage(err), 'error');
        }
      },

      deletePlayer: async (id: string) => {
        // 先云端后本地
        try {
          await db.deletePlayer(id);
          set((state) => ({ players: state.players.filter(p => p.id !== id) }));
        } catch (err) {
          get().showNotification(getErrorMessage(err), 'error');
        }
      },

      createMatch: (type, mode, scoreMode, team1Players, team2Players, matchDate) => {
        const today = new Date().toISOString().split('T')[0];
        const match: Match = {
          id: generateId(), type, mode, scoreMode,
          team1: { players: team1Players, score: 0, gamesWon: 0 },
          team2: { players: team2Players, score: 0, gamesWon: 0 },
          currentGame: 1, games: [{ team1Score: 0, team2Score: 0 }],
          status: 'ongoing', createdAt: Date.now(), scoreHistory: [],
          matchDate: matchDate || today,
        };
        set({ currentMatch: match });
        return match;
      },

      updateCurrentMatch: (match) => { set({ currentMatch: match }); },


      // 公共：处理比赛完成逻辑（积分计算 + 保存）
      handleMatchCompletion: async (updatedMatch: Match, team1: Team, team2: Team) => {
        if (updatedMatch.status !== 'completed') return updatedMatch;
        const allPlayers = [...team1.players, ...team2.players];
        const activeIds = new Set();
        // 只标记历史已参赛球员（不含本次），rating != 初始值 说明之前打过
        get().players.forEach(p => { if (p.rating !== undefined && p.rating !== getInitialRating()) activeIds.add(p.id); });
        const levels = calculateLevels([...get().players, ...allPlayers], activeIds);
        const ratingChanges = calculateRatingChanges(updatedMatch, allPlayers, levels);
        // 生成比赛编号: 日期_序号
        const matchDate = updatedMatch.matchDate || new Date().toISOString().split('T')[0];
        const sameDayCount = get().matches.filter(m => m.matchDate === matchDate).length;
        const matchNumber = `${matchDate}_${sameDayCount + 1}`;
        const finalMatch = { ...updatedMatch, ratingChanges, matchNumber };
        const updatedPlayers = applyRatingChanges(get().players, ratingChanges);
        set({ players: updatedPlayers });
        for (const rc of ratingChanges) {
          try { await db.updatePlayerRating(rc.playerId, rc.ratingAfter); } catch (e) { console.error(e); }
        }
        set((state) => ({ matches: [finalMatch, ...state.matches] }));
        try { await db.addMatch(finalMatch); } catch (err) {
          get().showNotification('比赛已结束，但保存到云端失败', 'error');
        }
        return finalMatch;
      },

      addScore: async (team) => {
        const { currentMatch } = get();
        if (!currentMatch || currentMatch.status !== 'ongoing') return;
        const gameIndex = currentMatch.currentGame - 1;
        const games = currentMatch.games.map(g => ({ ...g }));
        if (!games[gameIndex]) games[gameIndex] = { team1Score: 0, team2Score: 0 };

        const undoDiff: UndoSnapshot = {
          team, gameIndex,
          prevTeam1Score: games[gameIndex].team1Score, prevTeam2Score: games[gameIndex].team2Score,
          prevGamesWon1: currentMatch.team1.gamesWon, prevGamesWon2: currentMatch.team2.gamesWon,
          prevCurrentGame: currentMatch.currentGame, prevStatus: currentMatch.status,
          prevWinner: currentMatch.winner, hadGameWinner: !!games[gameIndex].winner,
          prevPlayers: [...get().players],
        };

        if (team === 'team1') games[gameIndex].team1Score++;
        else games[gameIndex].team2Score++;

        let scoreHistory = [...currentMatch.scoreHistory, { team, gameIndex, timestamp: Date.now(), previousSnapshot: undoDiff }];
        if (scoreHistory.length > STATS.SCORE_HISTORY_LIMIT) scoreHistory = scoreHistory.slice(-STATS.SCORE_HISTORY_LIMIT);

        let team1 = { ...currentMatch.team1 };
        let team2 = { ...currentMatch.team2 };
        let currentGame = currentMatch.currentGame;
        let status: Match['status'] = currentMatch.status;
        let winner: Match['winner'] = currentMatch.winner;

        if (isGameWon(games[gameIndex].team1Score, games[gameIndex].team2Score)) {
          const gw = games[gameIndex].team1Score > games[gameIndex].team2Score ? 'team1' : 'team2';
          games[gameIndex].winner = gw;
          if (gw === 'team1') team1 = { ...team1, gamesWon: team1.gamesWon + 1 };
          else team2 = { ...team2, gamesWon: team2.gamesWon + 1 };
          if (isMatchWon(Math.max(team1.gamesWon, team2.gamesWon), currentMatch.mode)) {
            status = 'completed'; winner = team1.gamesWon > team2.gamesWon ? 'team1' : 'team2';
          } else { currentGame++; games.push({ team1Score: 0, team2Score: 0 }); }
        }

        let updatedMatch: Match = {
          ...currentMatch, team1, team2, games, currentGame, status, winner, scoreHistory,
          completedAt: status === 'completed' ? Date.now() : undefined,
        };
        if (status === 'completed') {
          updatedMatch = await get().handleMatchCompletion(updatedMatch, team1, team2);
        }
        set({ currentMatch: updatedMatch });
      },

      setGameScore: async (gameIndex, team1Score, team2Score) => {
        const { currentMatch } = get();
        if (!currentMatch || currentMatch.status !== 'ongoing') return;
        if (gameIndex >= currentMatch.games.length) return;

        const games = currentMatch.games.map(g => ({ ...g }));
        games[gameIndex] = { team1Score, team2Score };
        let team1 = { ...currentMatch.team1 };
        let team2 = { ...currentMatch.team2 };
        let currentGame = currentMatch.currentGame;
        let status: Match['status'] = currentMatch.status;
        let winner: Match['winner'] = currentMatch.winner;

        const gw = team1Score > team2Score ? 'team1' : 'team2';
        games[gameIndex].winner = gw;
        if (gw === 'team1') team1 = { ...team1, gamesWon: team1.gamesWon + 1 };
        else team2 = { ...team2, gamesWon: team2.gamesWon + 1 };
        if (isMatchWon(Math.max(team1.gamesWon, team2.gamesWon), currentMatch.mode)) {
          status = 'completed'; winner = team1.gamesWon > team2.gamesWon ? 'team1' : 'team2';
        } else {
          currentGame = gameIndex + 2;
          if (currentGame > games.length) games.push({ team1Score: 0, team2Score: 0 });
        }

        let updatedMatch: Match = {
          ...currentMatch, team1, team2, games, currentGame, status, winner,
          completedAt: status === 'completed' ? Date.now() : undefined,
        };
        if (status === 'completed') {
          updatedMatch = await get().handleMatchCompletion(updatedMatch, team1, team2);
        }
        set({ currentMatch: updatedMatch });
      },

      undoScore: () => {
        const { currentMatch, matches } = get();
        if (!currentMatch || currentMatch.scoreHistory.length === 0) return;
        const lastEntry = currentMatch.scoreHistory[currentMatch.scoreHistory.length - 1];
        const snap = lastEntry.previousSnapshot;
        if (snap && typeof snap === 'object' && 'prevTeam1Score' in snap) {
          const u = snap as UndoSnapshot;
          const games = currentMatch.games.map((g, i) => {
            if (i === u.gameIndex) return { ...g, team1Score: u.prevTeam1Score, team2Score: u.prevTeam2Score, winner: u.hadGameWinner ? g.winner : undefined };
            return g;
          });
          while (games.length > u.prevCurrentGame) games.pop();
          const restored: Match = {
            ...currentMatch, games,
            team1: { ...currentMatch.team1, gamesWon: u.prevGamesWon1 },
            team2: { ...currentMatch.team2, gamesWon: u.prevGamesWon2 },
            currentGame: u.prevCurrentGame, status: u.prevStatus, winner: u.prevWinner,
            scoreHistory: currentMatch.scoreHistory.slice(0, -1), completedAt: undefined,
          };
          if (u.prevPlayers && u.prevPlayers.length > 0) {
            set({ currentMatch: restored, matches: matches.filter(m => m.id !== currentMatch.id), players: u.prevPlayers });
          } else if (currentMatch.status === 'completed') {
            set({ currentMatch: restored, matches: matches.filter(m => m.id !== currentMatch.id) });
          } else {
            set({ currentMatch: restored });
          }
          return;
        }
        if (snap && typeof snap === 'object' && 'games' in snap) {
          const restored = snap as Match;
          if (currentMatch.status === 'completed') set({ currentMatch: restored, matches: matches.filter(m => m.id !== currentMatch.id) });
          else set({ currentMatch: restored });
          return;
        }
        const games = currentMatch.games.map((g, i) => {
          if (i === lastEntry.gameIndex) return lastEntry.team === 'team1' ? { ...g, team1Score: Math.max(0, g.team1Score - 1) } : { ...g, team2Score: Math.max(0, g.team2Score - 1) };
          return g;
        });
        set({ currentMatch: { ...currentMatch, games, scoreHistory: currentMatch.scoreHistory.slice(0, -1) } });
      },

      finishMatch: async () => {
        const { currentMatch } = get();
        if (currentMatch && currentMatch.status === 'ongoing') {
          try { await db.addMatch(currentMatch); } catch (err) { console.error('保存比赛失败:', err); }
          set((state) => ({ matches: [currentMatch, ...state.matches] }));
        }
        set({ currentMatch: null });
      },

      deleteMatch: async (id) => {
        const { players, matches } = get();
        const match = matches.find(m => m.id === id);
        let updatedPlayers = players;
        if (match?.ratingChanges) {
          const adjustments = new Map<string, number>();
          for (const rc of match.ratingChanges) {
            adjustments.set(rc.playerId, (adjustments.get(rc.playerId) || 0) - rc.delta);
          }
          updatedPlayers = players.map(p => {
            const adj = adjustments.get(p.id);
            if (adj !== undefined) {
              return { ...p, rating: (p.rating ?? RATING.INITIAL_RATING) + adj };
            }
            return p;
          });
        }
        try {
          await db.deleteMatch(id);
          if (match?.ratingChanges) {
            for (const rc of match.ratingChanges) {
              const p = updatedPlayers.find(x => x.id === rc.playerId);
              if (p) await db.updatePlayerRating(rc.playerId, p.rating ?? RATING.INITIAL_RATING);
            }
          }
          set({ matches: matches.filter(m => m.id !== id), players: updatedPlayers });
        } catch (err) {
          get().showNotification(getErrorMessage(err), 'error');
        }
      },

      deleteMatches: async (ids) => {
        const { players, matches } = get();
        const ratingAdjustments: Map<string, number> = new Map();

        for (const id of ids) {
          const match = matches.find(m => m.id === id);
          if (match?.ratingChanges) {
            for (const rc of match.ratingChanges) {
              const current = ratingAdjustments.get(rc.playerId) || 0;
              ratingAdjustments.set(rc.playerId, current - rc.delta);
            }
          }
        }

        let updatedPlayers = [...players];
        for (const [playerId, adjustment] of ratingAdjustments) {
          updatedPlayers = updatedPlayers.map(p => {
            if (p.id === playerId) {
              const newRating = (p.rating ?? RATING.INITIAL_RATING) + adjustment;
              return { ...p, rating: newRating };
            }
            return p;
          });
        }

        try {
          await Promise.all(ids.map(id => db.deleteMatch(id)));
          for (const [playerId] of ratingAdjustments) {
            const player = updatedPlayers.find(p => p.id === playerId);
            if (player) {
              await db.updatePlayerRating(playerId, player.rating ?? RATING.INITIAL_RATING);
            }
          }
          set({ matches: matches.filter(m => !ids.includes(m.id)), players: updatedPlayers });
        } catch (err) {
          get().showNotification(getErrorMessage(err), 'error');
          throw err;
        }
      },

      resetAllRatings: async () => {
        const { players } = get();
        const previousPlayers = [...players];
        const updatedPlayers = players.map(p => ({ ...p, rating: RATING.INITIAL_RATING }));
        set({ players: updatedPlayers });
        try {
          await Promise.all(players.map(p => db.updatePlayerRating(p.id, RATING.INITIAL_RATING)));
        } catch (err) {
          // 回滚
          set({ players: previousPlayers });
          get().showNotification(getErrorMessage(err), 'error');
        }
      },

      loadMatch: (id) => {
        const { matches } = get();
        const match = matches.find(m => m.id === id);
        if (match) set({ currentMatch: match });
      },

      toggleTheme: () => { set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })); },

      importData: async (players, matches) => {
        const previousPlayers = get().players;
        const previousMatches = get().matches;
        set(() => ({ players, matches }));
        try {
          for (const p of players) await db.addPlayer(p.name, p.createdAt);
          for (const m of matches) await db.addMatch(m);
        } catch (err) {
          // 回滚
          set({ players: previousPlayers, matches: previousMatches });
          get().showNotification(getErrorMessage(err), 'error');
        }
      },

      clearAllData: async () => {
        const previousPlayers = get().players;
        const previousMatches = get().matches;
        const previousSnapshots = get().daySnapshots;
        set({ players: [], matches: [], currentMatch: null, daySnapshots: [] });
        try {
          await db.clearAllMatches();
        } catch (err) {
          // 回滚
          set({ players: previousPlayers, matches: previousMatches, daySnapshots: previousSnapshots });
          get().showNotification(getErrorMessage(err), 'error');
        }
      },

      // ========== 比赛日清算系统 ==========

      getUnsettledDates: () => {
        const { matches, daySnapshots } = get();
        const settledDates = new Set(daySnapshots.filter(s => s.status === 'settled').map(s => s.date));

        const datesWithMatches = new Set<string>();
        matches.forEach(m => {
          if (m.matchDate && m.status === 'completed') {
            datesWithMatches.add(m.matchDate);
          }
        });

        const unsettledDates = Array.from(datesWithMatches)
          .filter(d => !settledDates.has(d))
          .sort((a, b) => a.localeCompare(b));

        return unsettledDates;
      },

      settleDay: async (date: string) => {
        const { players, matches, daySnapshots } = get();

        const sortedSnapshots = [...daySnapshots]
          .filter(s => s.status === 'settled' && s.date < date)
          .sort((a, b) => b.date.localeCompare(a.date));

        let basePlayerData: Map<string, { rating: number; wins: number; losses: number; matches: number }>;
        if (sortedSnapshots.length > 0) {
          const lastSnapshot = sortedSnapshots[0];
          basePlayerData = new Map(
            lastSnapshot.playerSnapshots.map(ps => [
              ps.playerId,
              { rating: ps.rating, wins: ps.totalWins, losses: ps.totalLosses, matches: ps.totalMatches }
            ])
          );
        } else {
          basePlayerData = new Map(
            players.map(p => [p.id, { rating: RATING.INITIAL_RATING, wins: 0, losses: 0, matches: 0 }])
          );
        }

        const dayMatches = matches
          .filter(m => m.matchDate === date && m.status === 'completed')
          .sort((a, b) => a.createdAt - b.createdAt);

        const settledPlayerData = new Map(basePlayerData);

        for (const match of dayMatches) {
          if (!match.ratingChanges) continue;

          for (const rc of match.ratingChanges) {
            const current = settledPlayerData.get(rc.playerId) || {
              rating: RATING.INITIAL_RATING,
              wins: 0,
              losses: 0,
              matches: 0
            };

            const isWin = rc.delta > 0;
            settledPlayerData.set(rc.playerId, {
              rating: current.rating + rc.delta,
              wins: current.wins + (isWin ? 1 : 0),
              losses: current.losses + (isWin ? 0 : 1),
              matches: current.matches + 1,
            });
          }
        }

        const playerSnapshots: PlayerSnapshot[] = [];
        const levels = calculateLevels(players);

        for (const [playerId, data] of settledPlayerData) {
          const player = players.find(p => p.id === playerId);
          if (player) {
            playerSnapshots.push({
              playerId,
              name: player.name,
              rating: data.rating,
              level: levels.get(playerId) ?? -1,
              totalWins: data.wins,
              totalLosses: data.losses,
              totalMatches: data.matches,
            });
          }
        }

        const snapshot: DaySnapshot = {
          id: generateId(),
          date,
          createdAt: Date.now(),
          playerSnapshots,
          matchIds: dayMatches.map(m => m.id),
          status: 'pending',
        };

        const playerResults = players.map(player => {
          const realtimeRating = player.rating ?? RATING.INITIAL_RATING;
          const settledData = settledPlayerData.get(player.id);
          const settledRating = settledData ? settledData.rating : RATING.INITIAL_RATING;
          return {
            playerId: player.id,
            name: player.name,
            realtimeRating,
            settledRating,
            diff: realtimeRating - settledRating,
          };
        });

        const consistent = playerResults.every(pr => pr.diff === 0);

        return {
          date,
          consistent,
          playerResults,
          snapshot,
        };
      },

      confirmSettlement: async (date: string, snapshot: DaySnapshot) => {
        const finalSnapshot = { ...snapshot, status: 'settled' as const };

        try {
          await db.addDaySnapshot(finalSnapshot);
        } catch (err) {
          get().showNotification(getErrorMessage(err), 'error');
          throw err;
        }

        set((state) => ({
          daySnapshots: [...state.daySnapshots, finalSnapshot],
        }));
      },

      rollbackDay: async (date: string) => {
        const { matches, daySnapshots } = get();

        const sortedSnapshots = [...daySnapshots]
          .filter(s => s.status === 'settled' && s.date < date)
          .sort((a, b) => b.date.localeCompare(a.date));

        const snapshotsToDelete = daySnapshots.filter(s => s.date >= date);
        for (const s of snapshotsToDelete) {
          try {
            await db.deleteDaySnapshot(s.id);
          } catch (err) {
            console.error('删除快照失败:', err);
          }
        }

        let restoredPlayers: Player[];
        if (sortedSnapshots.length > 0) {
          const targetSnapshot = sortedSnapshots[0];
          const snapshotPlayerMap = new Map(
            targetSnapshot.playerSnapshots.map(ps => [ps.playerId, ps])
          );

          restoredPlayers = get().players.map(p => {
            const sp = snapshotPlayerMap.get(p.id);
            if (sp) {
              return { ...p, rating: sp.rating };
            }
            return { ...p, rating: RATING.INITIAL_RATING };
          });
        } else {
          restoredPlayers = get().players.map(p => ({ ...p, rating: RATING.INITIAL_RATING }));
        }

        const matchesToDelete = matches.filter(m => m.matchDate === date);
        for (const m of matchesToDelete) {
          try {
            await db.deleteMatch(m.id);
          } catch (err) {
            console.error('删除比赛失败:', err);
          }
        }

        for (const p of restoredPlayers) {
          try {
            await db.updatePlayerRating(p.id, p.rating ?? RATING.INITIAL_RATING);
          } catch (err) {
            console.error('更新球员积分失败:', err);
          }
        }

        set({
          players: restoredPlayers,
          matches: matches.filter(m => m.matchDate !== date),
          daySnapshots: daySnapshots.filter(s => s.date < date),
        });
      },
    }),
    {
      name: 'badminton-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        players: state.players,
        matches: state.matches.map(m => ({ ...m, scoreHistory: m.scoreHistory?.slice(-10) || [] })),
        currentMatch: null,
        theme: state.theme,
        daySnapshots: state.daySnapshots,
      }),
    }
  )
);
