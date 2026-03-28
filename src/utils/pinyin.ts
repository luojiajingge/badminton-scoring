import { pinyin } from 'pinyin-pro';

/**
 * Convert a name to a pinyin key for search matching
 * Returns full pinyin and first letter pinyin separated by |
 * Example: "张三" -> "zhangsan|zs"
 */
export function nameToPinyinKey(name: string): string {
  const full = pinyin(name, { toneType: 'none', type: 'array' }).join('').toLowerCase();
  const first = pinyin(name, { pattern: 'first', toneType: 'none', type: 'array' }).join('').toLowerCase();
  return full + '|' + first;
}

/**
 * Check if input matches target name using pinyin
 */
export function pinyinMatch(input: string, targetName: string): boolean {
  const key = nameToPinyinKey(targetName);
  const inputKey = nameToPinyinKey(input);
  const [full, first] = key.split('|');
  const [inputFull, inputFirst] = inputKey.split('|');
  if (full === inputFull || inputFull.includes(full) || full.includes(inputFull)) return true;
  if (first === inputFirst || inputFirst.includes(first) || first.includes(inputFirst)) return true;
  if (input === targetName) return true;
  return false;
}
