import type { Player } from '../types';
import { pinyinMatch } from './pinyin';

/**
 * 将连写的名字拆分成已有球员的组合
 * 支持同音字匹配，例如 "王鹏万瑞清" → ["王鹏", "万蕊清"]
 */
export function splitNames(input: string, players: Player[]): string[] {
  if (!input || players.length === 0) return [input];
  
  // 先检查直接精确匹配
  if (players.some(p => p.name === input)) return [input];
  
  const result: string[] = [];
  
  function backtrack(start: number): boolean {
    if (start >= input.length) return true;
    
    // 尝试不同长度的子串（2~5个字符）
    for (let len = Math.min(input.length - start, 5); len >= 2; len--) {
      const substr = input.substring(start, start + len);
      // 精确匹配：必须名字长度和子串长度完全一致
      const exactMatch = players.find(p => p.name === substr);
      // 拼音匹配：允许同音字，但长度差不超过1
      const pinyinMatched = players.find(p => 
        Math.abs(p.name.length - substr.length) <= 1 && 
        pinyinMatch(substr, p.name)
      );
      const matched = exactMatch || pinyinMatched;
      if (matched) {
        result.push(matched.name); // 返回正确的球员名
        if (backtrack(start + substr.length)) return true;
        result.pop();
      }
    }
    return false;
  }
  
  if (backtrack(0)) return result;
  return [input]; // 无法拆分
}

export function splitTeamNames(names: string[], players: Player[]): string[] {
  const result: string[] = [];
  for (const name of names) {
    result.push(...splitNames(name, players));
  }
  return result;
}
