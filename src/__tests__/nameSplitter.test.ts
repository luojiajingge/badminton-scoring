import { describe, it, expect } from 'vitest';
import { splitNames } from '../utils/nameSplitter';
import type { Player } from '../types';

const players: Player[] = [
  { id: '1', name: '张三', createdAt: 0 },
  { id: '2', name: '李四', createdAt: 0 },
  { id: '3', name: '王五', createdAt: 0 },
  { id: '4', name: '赵六', createdAt: 0 },
];

describe('splitNames', () => {
  it('精确匹配单个', () => {
    expect(splitNames('张三', players)).toEqual(['张三']);
  });

  it('拆分连写名字', () => {
    expect(splitNames('张三李四', players)).toEqual(['张三', '李四']);
  });

  it('无法拆分返回原文', () => {
    expect(splitNames('不存在的人', players)).toEqual(['不存在的人']);
  });

  it('空输入', () => {
    expect(splitNames('', players)).toEqual(['']);
  });
});
