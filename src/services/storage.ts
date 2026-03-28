import type { Player, Match, Theme } from '../types';

const STORAGE_KEYS = {
  PLAYERS: 'badminton_players',
  MATCHES: 'badminton_matches',
  THEME: 'badminton_theme',
};

// 存储服务
export const storageService = {
  // 玩家相关
  getPlayers: (): Player[] => {
    const data = localStorage.getItem(STORAGE_KEYS.PLAYERS);
    return data ? JSON.parse(data) : [];
  },

  savePlayers: (players: Player[]): void => {
    localStorage.setItem(STORAGE_KEYS.PLAYERS, JSON.stringify(players));
  },

  // 比赛相关
  getMatches: (): Match[] => {
    const data = localStorage.getItem(STORAGE_KEYS.MATCHES);
    return data ? JSON.parse(data) : [];
  },

  saveMatches: (matches: Match[]): void => {
    localStorage.setItem(STORAGE_KEYS.MATCHES, JSON.stringify(matches));
  },

  // 主题相关
  getTheme: (): Theme => {
    const theme = localStorage.getItem(STORAGE_KEYS.THEME) as Theme;
    return theme || 'light';
  },

  saveTheme: (theme: Theme): void => {
    localStorage.setItem(STORAGE_KEYS.THEME, theme);
  },

  // 清除所有数据
  clearAll: (): void => {
    localStorage.removeItem(STORAGE_KEYS.PLAYERS);
    localStorage.removeItem(STORAGE_KEYS.MATCHES);
  },
};
