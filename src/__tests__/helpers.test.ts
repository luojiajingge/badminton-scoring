import { describe, it, expect } from 'vitest';
import { isGameWon, isMatchWon, getGamesNeeded, getModeLabel, getScoreModeLabel, formatDate, generateLeaderboard } from '../utils/helpers';
import type { Player, Match } from '../types';

describe('isGameWon', () => {
  it('21:19 胜', () => expect(isGameWon(21, 19)).toBe(true));
  it('21:20 不胜（分差<2）', () => expect(isGameWon(21, 20)).toBe(false));
  it('22:20 胜', () => expect(isGameWon(22, 20)).toBe(true));
  it('30:29 胜', () => expect(isGameWon(30, 29)).toBe(true));
  it('30:28 不胜', () => expect(isGameWon(30, 28)).toBe(false));
  it('20:18 不胜', () => expect(isGameWon(20, 18)).toBe(false));
});

describe('isMatchWon', () => {
  it('单局赛直接判定', () => expect(isMatchWon(1, 'single')).toBe(true));
  it('三局两胜需2局', () => expect(isMatchWon(2, 'best-of-3')).toBe(true));
  it('三局两胜1局不够', () => expect(isMatchWon(1, 'best-of-3')).toBe(false));
  it('五局三胜需3局', () => expect(isMatchWon(3, 'best-of-5')).toBe(true));
});

describe('getGamesNeeded', () => {
  expect(getGamesNeeded('single')).toBe(1);
  expect(getGamesNeeded('best-of-3')).toBe(2);
  expect(getGamesNeeded('best-of-5')).toBe(3);
});

describe('getModeLabel', () => {
  expect(getModeLabel('single')).toBe('单局赛');
  expect(getModeLabel('best-of-3')).toBe('三局两胜');
  expect(getModeLabel('best-of-5')).toBe('五局三胜');
});

describe('getScoreModeLabel', () => {
  expect(getScoreModeLabel('point-by-point')).toBe('逐球计分');
  expect(getScoreModeLabel('direct-input')).toBe('直接输入比分');
});

describe('formatDate', () => {
  const ts = new Date(2026, 2, 28, 10, 30).getTime();
  const result = formatDate(ts);
  expect(result).toContain('2026');
});

describe('generateLeaderboard', () => {
  const players: Player[] = [
    { id: '1', name: 'A', createdAt: 0, rating: 2050 },
    { id: '2', name: 'B', createdAt: 0, rating: 1950 },
    { id: '3', name: 'C', createdAt: 0, rating: 2000 },
  ];
  const matches: Match[] = [];
  const board = generateLeaderboard(players, matches);
  expect(board[0].rank).toBe(1);
  expect(board[0].player.name).toBe('A');
  expect(board).toHaveLength(3);
});
