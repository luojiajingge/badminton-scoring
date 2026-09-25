import { describe, it, expect } from 'vitest';
import { validateGameScore } from '../utils/scoreValidator';

describe('validateGameScore 15分制', () => {
  it('15:0 应该合法', () => {
    expect(validateGameScore(15, 0, '15').valid).toBe(true);
  });
  it('15:13 应该合法（分差≥2）', () => {
    expect(validateGameScore(15, 13, '15').valid).toBe(true);
  });
  it('15:14 应该不合法（分差<2）', () => {
    expect(validateGameScore(15, 14, '15').valid).toBe(false);
  });
  it('16:14 应该合法（14:14后延续）', () => {
    expect(validateGameScore(16, 14, '15').valid).toBe(true);
  });
  it('16:13 应该不合法（15分时就该结束）', () => {
    expect(validateGameScore(16, 13, '15').valid).toBe(false);
  });
  it('21:20 应该合法（一分决胜）', () => {
    expect(validateGameScore(21, 20, '15').valid).toBe(true);
  });
  it('21:19 应该不合法（封顶只能21:20）', () => {
    expect(validateGameScore(21, 19, '15').valid).toBe(false);
  });
  it('22:20 应该不合法（超过21分封顶）', () => {
    expect(validateGameScore(22, 20, '15').valid).toBe(false);
  });
  it('14:12 应该不合法（未达15分）', () => {
    expect(validateGameScore(14, 12, '15').valid).toBe(false);
  });
  it('缺省参数按21分制：15:13 不合法', () => {
    expect(validateGameScore(15, 13).valid).toBe(false);
  });
});

describe('validateGameScore', () => {
  // 基本胜负
  it('21:0 应该合法', () => {
    expect(validateGameScore(21, 0).valid).toBe(true);
  });

  it('21:19 应该合法（分差≥2）', () => {
    expect(validateGameScore(21, 19).valid).toBe(true);
  });

  it('21:20 应该不合法（分差<2）', () => {
    expect(validateGameScore(21, 20).valid).toBe(false);
  });

  it('0:21 应该合法', () => {
    expect(validateGameScore(0, 21).valid).toBe(true);
  });

  // 延分规则
  it('22:20 应该合法', () => {
    expect(validateGameScore(22, 20).valid).toBe(true);
  });

  it('25:23 应该合法', () => {
    expect(validateGameScore(25, 23).valid).toBe(true);
  });

  it('22:19 应该不合法（败方<20）', () => {
    expect(validateGameScore(22, 19).valid).toBe(false);
  });

  // 30分封顶
  it('30:29 应该合法', () => {
    expect(validateGameScore(30, 29).valid).toBe(true);
  });

  it('30:28 应该不合法', () => {
    expect(validateGameScore(30, 28).valid).toBe(false);
  });

  it('31:29 应该不合法（超过30分）', () => {
    expect(validateGameScore(31, 29).valid).toBe(false);
  });

  // 边界条件
  it('负数不合法', () => {
    expect(validateGameScore(-1, 21).valid).toBe(false);
    expect(validateGameScore(21, -1).valid).toBe(false);
  });

  it('平局不合法', () => {
    expect(validateGameScore(0, 0).valid).toBe(false);
    expect(validateGameScore(21, 21).valid).toBe(false);
  });

  it('未达到21分不合法', () => {
    expect(validateGameScore(20, 18).valid).toBe(false);
  });

  it('错误信息应该准确', () => {
    expect(validateGameScore(21, 20).error).toContain('2分');
    expect(validateGameScore(22, 19).error).toContain('20分');
    expect(validateGameScore(0, 0).error).toContain('平局');
  });
});
