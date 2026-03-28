import { describe, it, expect } from 'vitest';
import { calculateLevels, getLevelLabel, getPlayerRating, calculateRatingChanges, applyRatingChanges } from '../utils/rating';
import type { Player, Match } from '../types';

const makePlayer = (id: string, rating: number): Player => ({
  id, name: id, createdAt: Date.now(), rating,
});

const makeMatch = (p1: Player, p2: Player, winner: 'team1' | 'team2'): Match => ({
  id: 'test', type: 'singles', mode: 'single', scoreMode: 'direct-input',
  team1: { players: [p1], score: 0, gamesWon: winner === 'team1' ? 1 : 0 },
  team2: { players: [p2], score: 0, gamesWon: winner === 'team2' ? 1 : 0 },
  currentGame: 1, games: [{ team1Score: winner === 'team1' ? 21 : 10, team2Score: winner === 'team2' ? 21 : 10, winner }],
  status: 'completed', winner, createdAt: Date.now(), scoreHistory: [],
});

describe('getPlayerRating', () => {
  it('默认返回2000', () => {
    expect(getPlayerRating({ id: '1', name: 'a', createdAt: 0 })).toBe(2000);
  });
  it('返回设置的rating', () => {
    expect(getPlayerRating(makePlayer('1', 2050))).toBe(2050);
  });
});

describe('calculateLevels', () => {
  it('不足5人有积分变动的全部L2', () => {
    const players = [makePlayer('1', 2100), makePlayer('2', 2050), makePlayer('3', 1950)];
    const levels = calculateLevels(players);
    players.forEach(p => expect(levels.get(p.id)).toBe(2));
  });
  it('未参赛球员(初始积分)不在级别中', () => {
    expect(calculateLevels([makePlayer('1', 2000)]).get('1')).toBeUndefined();
  });
  it('5人以上按排名划分级别', () => {
    const players = [
      makePlayer('1', 2200), makePlayer('2', 2100), makePlayer('3', 2050),
      makePlayer('4', 1950), makePlayer('5', 1900),
    ];
    const levels = calculateLevels(players);
    expect(levels.get('1')).toBe(0);
    expect(levels.get('2')).toBe(1);
    expect(levels.get('3')).toBe(2);
    expect(levels.get('4')).toBe(3);
    expect(levels.get('5')).toBe(4);
  });
});

describe('getLevelLabel', () => {
  it('未定级', () => expect(getLevelLabel(-1)).toBe('未定级'));
  it('L0', () => expect(getLevelLabel(0)).toBe('L0'));
});

describe('calculateRatingChanges', () => {
  it('同级单打胜负各±50', () => {
    const p1 = makePlayer('1', 2050);
    const p2 = makePlayer('2', 1950);
    const match = makeMatch(p1, p2, 'team1');
    const changes = calculateRatingChanges(match, [p1, p2], new Map());
    expect(changes.find(c => c.playerId === '1')!.delta).toBe(50);
    expect(changes.find(c => c.playerId === '2')!.delta).toBe(-50);
  });

  // ⚠️ 已知 BUG：L0=最强, L4=最弱，但代码用级别数值大小判断强弱方向反了
  // L0(数值0) 被当作弱方，L4(数值4) 被当作强方
  it('L0赢L4：强方赢+10', () => {
    const players = Array.from({ length: 10 }, (_, i) => makePlayer(String(i), 2200 - i * 40));
    const levels = calculateLevels(players);
    const p1 = players[0]; // L0 最强
    const p9 = players[9]; // L4 最弱
    const match: Match = {
      id: 'test', type: 'singles', mode: 'single', scoreMode: 'direct-input',
      team1: { players: [p1], score: 0, gamesWon: 1 },
      team2: { players: [p9], score: 0, gamesWon: 0 },
      currentGame: 1, games: [{ team1Score: 21, team2Score: 10, winner: 'team1' }],
      status: 'completed', winner: 'team1', createdAt: Date.now(), scoreHistory: [],
    };
    const changes = calculateRatingChanges(match, [p1, p9], levels);
    // L0(team1)是强方，team1赢 → strongWin=10
    expect(changes.find(c => c.playerId === '0')!.delta).toBe(10);
  });

  it('L4赢L0：弱方赢+90', () => {
    const players = Array.from({ length: 10 }, (_, i) => makePlayer(String(i), 2200 - i * 40));
    const levels = calculateLevels(players);
    const p1 = players[0]; // L0 最强
    const p9 = players[9]; // L4 最弱
    const match: Match = {
      id: 'test', type: 'singles', mode: 'single', scoreMode: 'direct-input',
      team1: { players: [p9], score: 0, gamesWon: 1 },
      team2: { players: [p1], score: 0, gamesWon: 0 },
      currentGame: 1, games: [{ team1Score: 21, team2Score: 10, winner: 'team1' }],
      status: 'completed', winner: 'team1', createdAt: Date.now(), scoreHistory: [],
    };
    const changes = calculateRatingChanges(match, [p9, p1], levels);
    // L4(team1)是弱方，team1赢 → weakWin=90
    expect(changes.find(c => c.playerId === '9')!.delta).toBe(90);
  });
});

describe('applyRatingChanges', () => {
  it('正确应用积分变动', () => {
    const players = [makePlayer('1', 2000), makePlayer('2', 2000)];
    const changes = [
      { playerId: '1', playerName: 'a', delta: 50, ratingBefore: 2000, ratingAfter: 2050 },
      { playerId: '2', playerName: 'b', delta: -50, ratingBefore: 2000, ratingAfter: 1950 },
    ];
    const updated = applyRatingChanges(players, changes);
    expect(updated.find(p => p.id === '1')!.rating).toBe(2050);
    expect(updated.find(p => p.id === '2')!.rating).toBe(1950);
  });
});
