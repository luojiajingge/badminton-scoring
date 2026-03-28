import { describe, it, expect } from 'vitest';
import { nameToPinyinKey, pinyinMatch } from '../utils/pinyin';

describe('nameToPinyinKey', () => {
  it('张三 -> zhangsan|zs', () => {
    expect(nameToPinyinKey('张三')).toBe('zhangsan|zs');
  });

  it('王小明 -> wangxiaoming|wxm', () => {
    expect(nameToPinyinKey('王小明')).toBe('wangxiaoming|wxm');
  });
});

describe('pinyinMatch', () => {
  it('精确匹配', () => {
    expect(pinyinMatch('张三', '张三')).toBe(true);
  });

  it('全拼匹配', () => {
    expect(pinyinMatch('zhangsan', '张三')).toBe(true);
  });

  it('首字母匹配', () => {
    expect(pinyinMatch('zs', '张三')).toBe(true);
  });

  it('不匹配', () => {
    expect(pinyinMatch('lisi', '张三')).toBe(false);
  });
});
