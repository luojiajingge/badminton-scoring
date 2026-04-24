import React, { useState, useMemo, useCallback } from 'react';
import { useStore } from '../store';
import { calculateLevels, getLevelLabel } from '../utils/rating';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import {
  generateAICommentary,
  isAIConfigured,
  getCachedCommentary,
  setCachedCommentary,
  clearCachedCommentary,
  calculateHistoricalStats,
} from '../services/ai';
import type { AICommentary } from '../services/ai';

const SEP = '━━━━━━━━━━━━━━━';

interface PlayerReport {
  playerId: string;
  playerName: string;
  matches: number;
  wins: number;
  losses: number;
  winRate: number;
  ratingDelta: number;
  levelBefore: number;
  levelAfter: number;
}

export const DayReport: React.FC = () => {
  const players = useStore((state) => state.players);
  const matches = useStore((state) => state.matches);

  const [selectedDate, setSelectedDate] = useState('');
  const [shareNotice, setShareNotice] = useState<string | null>(null);

  // AI 点评相关状态
  const [aiCommentary, setAiCommentary] = useState<AICommentary | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiShareNotice, setAiShareNotice] = useState<string | null>(null);

  // 所有已完成的比赛
  const completedMatches = useMemo(
    () => matches.filter((m) => m.status === 'completed'),
    [matches],
  );

  // 按日期筛选后的比赛
  const filteredMatches = useMemo(
    () => selectedDate
      ? completedMatches.filter((m) => m.matchDate === selectedDate)
      : completedMatches,
    [completedMatches, selectedDate],
  );

  // 可选日期列表（倒序）
  const availableDates = useMemo(() => {
    const dateSet = new Set<string>();
    completedMatches.forEach((m) => {
      if (m.matchDate) dateSet.add(m.matchDate);
    });
    return Array.from(dateSet).sort((a, b) => b.localeCompare(a));
  }, [completedMatches]);

  // 当前级别
  const currentLevels = useMemo(() => calculateLevels(players), [players]);

  // 球员名称映射（含已删除球员）
  const playerNames = useMemo(() => {
    const nameMap = new Map<string, string>();
    players.forEach((p) => nameMap.set(p.id, p.name));
    matches.forEach((m) => {
      m.team1?.players.forEach((p) => { if (!nameMap.has(p.id)) nameMap.set(p.id, p.name); });
      m.team2?.players.forEach((p) => { if (!nameMap.has(p.id)) nameMap.set(p.id, p.name); });
    });
    return nameMap;
  }, [players, matches]);

  // 每个球员的统计数据
  const reports = useMemo((): PlayerReport[] => {
    const map = new Map<string, PlayerReport>();

    filteredMatches.forEach((match) => {
      const allPlayersInMatch = [...match.team1.players, ...match.team2.players];
      allPlayersInMatch.forEach((p) => {
        if (!map.has(p.id)) {
          map.set(p.id, {
            playerId: p.id,
            playerName: playerNames.get(p.id) || p.name,
            matches: 0,
            wins: 0,
            losses: 0,
            winRate: 0,
            ratingDelta: 0,
            levelBefore: -1,
            levelAfter: -1,
          });
        }
        const report = map.get(p.id)!;
        report.matches++;

        const isTeam1 = match.team1.players.some((tp) => tp.id === p.id);
        const won = (match.winner === 'team1' && isTeam1) || (match.winner === 'team2' && !isTeam1);
        if (won) report.wins++; else report.losses++;

        // 积分变动
        const rc = match.ratingChanges?.find((c) => c.playerId === p.id);
        if (rc) {
          report.ratingDelta += rc.delta;
          // 记录第一场的 levelBefore
          if (report.levelBefore < 0) {
            report.levelBefore = rc.levelBefore ?? -1;
          }
        }
      });
    });

    // 计算胜率和最终级别
    const result = Array.from(map.values());
    result.forEach((r) => {
      r.winRate = r.matches > 0 ? Math.round((r.wins / r.matches) * 100) : 0;
      // 当前级别
      const lv = currentLevels.get(r.playerId);
      r.levelAfter = lv !== undefined ? lv : -1;
    });

    // 按胜率降序，胜率相同按积分变动降序
    result.sort((a, b) => b.winRate - a.winRate || b.ratingDelta - a.ratingDelta);
    return result;
  }, [filteredMatches, playerNames, currentLevels]);

  // 总览数据
  const totalParticipants = reports.length;
  const totalMatches = filteredMatches.length;

  // 图表数据
  const winRateChartData = useMemo(
    () => reports.map((r) => ({ name: r.playerName, 胜率: r.winRate })),
    [reports],
  );

  const ratingDeltaChartData = useMemo(
    () => reports.map((r) => ({ name: r.playerName, 积分变动: r.ratingDelta })),
    [reports],
  );

  const activityChartData = useMemo(
    () => [...reports].sort((a, b) => b.matches - a.matches).map((r) => ({ name: r.playerName, 局数: r.matches })),
    [reports],
  );

  // 格式化日期显示
  const formatDateLabel = (dateStr: string) => {
    const [, month, day] = dateStr.split('-');
    return `${month}月${day}日`;
  };

  // 格式化级别变化
  const formatLevelChange = (before: number, after: number) => {
    const b = getLevelLabel(before);
    const a = getLevelLabel(after);
    if (before < 0 || after < 0) return '';
    if (before === after) return a;
    const arrow = after < before ? '↑' : '↓';
    return `${b}→${a}${arrow}`;
  };

  // 一键分享赛事日报

  // ======== AI 犀利点评 ========

  // 生成 AI 点评输入数据（供 handleAIGenerate 和 handleShare 共用）
  const buildAIInputData = useCallback(() => {
    if (reports.length === 0) return null;

    const isDay = !!selectedDate;
    const dateLabel = isDay ? formatDateLabel(selectedDate!) : '总战绩';

    // MVP
    const mvp = [...reports].sort((a, b) => {
      if (a.wins >= 2 && b.wins >= 2) return b.winRate - a.winRate;
      return b.wins - a.wins;
    })[0];

    // 积分涨幅王
    const topGainer = [...reports].filter((r) => r.ratingDelta > 0).sort((a, b) => b.ratingDelta - a.ratingDelta)[0];

    // 参赛劳模
    const busiest = [...reports].sort((a, b) => b.matches - a.matches)[0];

    // 连胜之王
    const streakMap = new Map<string, { cur: number; max: number; curIsWin: boolean }>();
    const sortedMatches = [...filteredMatches].sort((a, b) => a.createdAt - b.createdAt);
    sortedMatches.forEach((m) => {
      const allP = [...m.team1.players, ...m.team2.players];
      allP.forEach((p) => {
        const s = streakMap.get(p.id) || { cur: 0, max: 0, curIsWin: false };
        const isTeam1 = m.team1.players.some((tp) => tp.id === p.id);
        const won = (m.winner === 'team1' && isTeam1) || (m.winner === 'team2' && !isTeam1);
        if (won === s.curIsWin) { s.cur++; } else { s.cur = 1; s.curIsWin = won; }
        if (s.curIsWin && s.cur > s.max) s.max = s.cur;
        streakMap.set(p.id, s);
      });
    });
    const streakWinner = reports
      .map((r) => ({ ...r, maxStreak: streakMap.get(r.playerId)?.max || 0 }))
      .filter((r) => r.maxStreak >= 2)
      .sort((a, b) => b.maxStreak - a.maxStreak)[0];

    // 爆冷专家
    const upsetMap = new Map<string, number>();
    sortedMatches.forEach((m) => {
      if (!m.ratingChanges || m.ratingChanges.length === 0) return;
      const winners = m.ratingChanges.filter((rc) => rc.delta > 0);
      const losers = m.ratingChanges.filter((rc) => rc.delta < 0);
      if (winners.length === 0 || losers.length === 0) return;
      const avgWinnerLevel = winners.reduce((s, rc) => s + (rc.levelBefore ?? 2), 0) / winners.length;
      const avgLoserLevel = losers.reduce((s, rc) => s + (rc.levelBefore ?? 2), 0) / losers.length;
      if (avgWinnerLevel > avgLoserLevel) {
        winners.forEach((rc) => upsetMap.set(rc.playerId, (upsetMap.get(rc.playerId) || 0) + 1));
      }
    });
    const upsetEntry = Array.from(upsetMap.entries())
      .filter(([, count]) => count >= 1)
      .sort((a, b) => b[1] - a[1])[0];

    // 带历史数据的 reports
    const reportsWithHistory = reports.map((r) => {
      const hist = calculateHistoricalStats(r.playerId, completedMatches);
      return { ...r, totalMatches: hist.totalMatches, totalWinRate: hist.totalWinRate };
    });

    const singles = filteredMatches.filter((m) => m.type === 'singles').length;
    const doubles = filteredMatches.filter((m) => m.type === 'doubles').length;

    // 构建比赛明细
    const matchDetails = sortedMatches.map((m) => {
      const t1Names = m.team1.players.map((p) => playerNames.get(p.id) || p.name).join('&');
      const t2Names = m.team2.players.map((p) => playerNames.get(p.id) || p.name).join('&');
      // 使用每局实际分数，如 "21:18 15:21 21:12"
      const gameScores = m.games
        .filter((g) => g.team1Score > 0 || g.team2Score > 0)
        .map((g) => `${g.team1Score}:${g.team2Score}`)
        .join(' ');
      const score = gameScores || `${m.team1.gamesWon}:${m.team2.gamesWon}`;
      return {
        team1Names: t1Names,
        team2Names: t2Names,
        score,
        type: m.type,
        winner: m.winner ?? 'team1',
      };
    });

    return {
      date: dateLabel,
      reports: reportsWithHistory,
      totalParticipants,
      totalMatches,
      singles,
      doubles,
      mvp: mvp ? { ...mvp, totalMatches: 0, totalWinRate: 0 } : null,
      topGainer: topGainer ? { ...topGainer, totalMatches: 0, totalWinRate: 0 } : null,
      busiest: busiest ? { ...busiest, totalMatches: 0, totalWinRate: 0 } : null,
      streakWinner: streakWinner ? { ...streakWinner, totalMatches: 0, totalWinRate: 0 } : null,
      upsetKing: upsetEntry
        ? { playerId: upsetEntry[0], playerName: playerNames.get(upsetEntry[0]) || '未知', count: upsetEntry[1] }
        : null,
      matchDetails,
    };
  }, [reports, selectedDate, filteredMatches, completedMatches, playerNames, totalParticipants, totalMatches]);

  // 处理 AI 点评生成
  const handleAIGenerate = useCallback(async (forceRefresh = false) => {
    const inputData = buildAIInputData();
    if (!inputData) return;

    // 检查缓存
    if (!forceRefresh) {
      const cached = getCachedCommentary(inputData.date);
      if (cached) {
        setAiCommentary(cached);
        setAiError(null);
        return;
      }
    }

    setAiLoading(true);
    setAiError(null);

    try {
      const result = await generateAICommentary(inputData);
      setAiCommentary(result);
      setCachedCommentary(inputData.date, result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI 点评生成失败';
      setAiError(msg);
      setAiCommentary(null);
    } finally {
      setAiLoading(false);
    }
  }, [buildAIInputData]);

  // 日期切换时重置 AI 状态
  const handleDateChange = (date: string) => {
    setSelectedDate(date);
    setAiCommentary(null);
    setAiError(null);
    setAiLoading(false);
    setAiShareNotice(null);
  };

  // 分享 AI 点评内容
  const handleShareAICommentary = () => {
    if (!aiCommentary) return;

    const isDay = !!selectedDate;
    const title = isDay ? `🏸 AI 犀利点评 | ${formatDateLabel(selectedDate!)}` : '🏸 AI 犀利点评';

    const lines: string[] = [title, SEP];
    aiCommentary.playerComments.forEach((pc) => {
      lines.push(`【${pc.name}】${pc.comment}`);
    });
    lines.push('');
    lines.push(SEP);
    lines.push(`💬 ${aiCommentary.summary}`);
    lines.push('');
    lines.push('—— 由 AI 毒舌评论员倾情出品');

    const text = lines.join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setAiShareNotice('✅ AI 点评已复制到剪贴板');
      setTimeout(() => setAiShareNotice(null), 3000);
    }).catch(() => {
      setAiShareNotice('❌ 复制失败，请手动复制');
      setTimeout(() => setAiShareNotice(null), 3000);
    });
  };

  // 一键分享赛事日报（原逻辑）
  const handleShare = () => {
    if (reports.length === 0) return;

    const isDay = !!selectedDate;
    const title = isDay ? `🏸 赛事日报 | ${formatDateLabel(selectedDate!)}` : '🏸 总战绩报告';

    // MVP：胜场>=2取最高胜率，否则取最多胜场
    const mvp = [...reports].sort((a, b) => {
      if (a.wins >= 2 && b.wins >= 2) return b.winRate - a.winRate;
      return b.wins - a.wins;
    })[0];

    // 积分涨幅王
    const topGainer = [...reports].filter(r => r.ratingDelta > 0).sort((a, b) => b.ratingDelta - a.ratingDelta)[0];

    // 参赛劳模
    const busiest = [...reports].sort((a, b) => b.matches - a.matches)[0];

    // 连胜之王：从 filteredMatches 中按时间顺序计算每人当日最长连胜
    const streakMap = new Map<string, { cur: number; max: number; curIsWin: boolean }>();
    const sortedMatches = [...filteredMatches].sort((a, b) => a.createdAt - b.createdAt);
    sortedMatches.forEach(m => {
      const allP = [...m.team1.players, ...m.team2.players];
      allP.forEach(p => {
        const s = streakMap.get(p.id) || { cur: 0, max: 0, curIsWin: false };
        const isTeam1 = m.team1.players.some(tp => tp.id === p.id);
        const won = (m.winner === 'team1' && isTeam1) || (m.winner === 'team2' && !isTeam1);
        if (won === s.curIsWin) { s.cur++; } else { s.cur = 1; s.curIsWin = won; }
        if (s.curIsWin && s.cur > s.max) s.max = s.cur;
        streakMap.set(p.id, s);
      });
    });
    const streakWinner = reports
      .map(r => ({ ...r, maxStreak: streakMap.get(r.playerId)?.max || 0 }))
      .filter(r => r.maxStreak >= 2)
      .sort((a, b) => b.maxStreak - a.maxStreak)[0];

    // 爆冷专家：以下克上（ratingChanges 中 delta 为正且 levelBefore > 对应对手 levelBefore 的次数）
    const upsetMap = new Map<string, number>();
    sortedMatches.forEach(m => {
      if (!m.ratingChanges || m.ratingChanges.length === 0) return;
      const winners = m.ratingChanges.filter(rc => rc.delta > 0);
      const losers = m.ratingChanges.filter(rc => rc.delta < 0);
      if (winners.length === 0 || losers.length === 0) return;
      const avgWinnerLevel = winners.reduce((s, rc) => s + (rc.levelBefore ?? 2), 0) / winners.length;
      const avgLoserLevel = losers.reduce((s, rc) => s + (rc.levelBefore ?? 2), 0) / losers.length;
      // level 数值大 = 级别低 = 弱方，赢了就是爆冷
      if (avgWinnerLevel > avgLoserLevel) {
        winners.forEach(rc => upsetMap.set(rc.playerId, (upsetMap.get(rc.playerId) || 0) + 1));
      }
    });
    const upsetKing = Array.from(upsetMap.entries())
      .filter(([, count]) => count >= 1)
      .sort((a, b) => b[1] - a[1])[0];

    // 诙谐总结语
    const avgWinRate = reports.reduce((s, r) => s + r.winRate, 0) / reports.length;
    let summary = '';
    if (reports.length <= 3) {
      summary = '小场切磋，高手过招，不在于多而在于精。';
    } else if (upsetKing) {
      summary = '今天最大的新闻不是谁赢了，而是谁输了！爆冷才是羽毛球的最大魅力。';
    } else if (totalMatches >= 10 && avgWinRate >= 55) {
      summary = '今天是个血拼日，人人都打满了鸡血！精彩对决一场接一场。';
    } else if (mvp && mvp.winRate === 100 && mvp.wins >= 3) {
      summary = `今天的赛场只有一个人在教做人——${mvp.playerName}，其余都是陪练。`;
    } else if (topGainer && topGainer.ratingDelta >= 200) {
      summary = `${topGainer.playerName}今天赚得盆满钵满，积分涨幅堪比牛市！`;
    } else if (reports.length >= 6) {
      summary = '群雄逐鹿的一天，各路神仙各显神通，球场如战场！';
    } else {
      summary = '挥汗如雨的赛场，每一拍都是热爱。今天也是元气满满的一天！';
    }

    // 构建分享文本
    const lines: string[] = [title, SEP];

    // 概览
    const singles = filteredMatches.filter(m => m.type === 'singles').length;
    const doubles = filteredMatches.filter(m => m.type === 'doubles').length;
    lines.push(`👥 ${totalParticipants}人参赛  🏸 ${totalMatches}场对决`);
    if (isDay && (singles > 0 || doubles > 0)) {
      const parts: string[] = [];
      if (singles > 0) parts.push(`单打${singles}场`);
      if (doubles > 0) parts.push(`双打${doubles}场`);
      lines.push(`📊 ${parts.join(' | ')}`);
    }
    lines.push('');

    // MVP
    if (mvp) {
      lines.push('🏆 今日MVP');
      lines.push(`${mvp.playerName}  ${mvp.wins}胜${mvp.losses}负  胜率${mvp.winRate}%  积分${mvp.ratingDelta >= 0 ? '+' : ''}${mvp.ratingDelta}`);
      lines.push('');
    }

    // 积分涨幅王
    if (topGainer) {
      lines.push('📈 积分涨幅王');
      const lvChange = formatLevelChange(topGainer.levelBefore, topGainer.levelAfter);
      lines.push(`${topGainer.playerName}  +${topGainer.ratingDelta}分${lvChange ? '  ' + lvChange : ''}`);
      lines.push('');
    }

    // 今日之最
    const funFacts: string[] = [];
    if (busiest && busiest.matches >= 3) {
      funFacts.push(`参赛劳模: ${busiest.playerName}(${busiest.matches}局)`);
    }
    if (streakWinner && streakWinner.maxStreak >= 3) {
      funFacts.push(`连胜之王: ${streakWinner.playerName}(${streakWinner.maxStreak}连胜)`);
    }
    if (upsetKing) {
      const name = playerNames.get(upsetKing[0]) || '未知';
      funFacts.push(`爆冷专家: ${name}(${upsetKing[1]}次以下克上)`);
    }
    if (funFacts.length > 0) {
      lines.push('🔥 今日之最');
      funFacts.forEach(f => lines.push(f));
      lines.push('');
    }

    // 全员战绩
    lines.push('📊 全员战绩');
    reports.forEach(r => {
      const delta = r.ratingDelta >= 0 ? `+${r.ratingDelta}` : `${r.ratingDelta}`;
      lines.push(`${r.playerName}  ${r.wins}胜${r.losses}负 ${r.winRate}%  ${delta}`);
    });

    lines.push('');
    lines.push(SEP);

    // 如果有 AI 点评，使用 AI 点评替换模板总结
    if (aiCommentary) {
      lines.push('');
      lines.push('🤖 AI 犀利点评');
      aiCommentary.playerComments.forEach((pc) => {
        lines.push(`【${pc.name}】${pc.comment}`);
      });
      lines.push('');
      lines.push(`💬 ${aiCommentary.summary}`);
    } else {
      lines.push(`💬 ${summary}`);
    }

    const text = lines.join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setShareNotice('✅ 已复制到剪贴板，可直接粘贴分享');
      setTimeout(() => setShareNotice(null), 3000);
    }).catch(() => {
      setShareNotice('❌ 复制失败，请手动复制');
      setTimeout(() => setShareNotice(null), 3000);
    });
  };

  if (completedMatches.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📋</div>
        <div>暂无比赛数据</div>
        <div style={{ fontSize: '12px', marginTop: '8px' }}>完成比赛后将显示报告</div>
      </div>
    );
  }

  const COLORS = ['#1890ff', '#2fc25b', '#facc14', '#f04864', '#8543e0', '#13c2c2', '#fa8c16', '#eb2f96'];

  return (
    <div className="fade-in">
      {/* 日期选择器 */}
      <div className="card">
        <div className="card-title">选择日期</div>
        <select
          className="input"
          value={selectedDate}
          onChange={(e) => handleDateChange(e.target.value)}
        >
          <option value="">全部（全局统计）</option>
          {availableDates.map((date) => (
            <option key={date} value={date}>{formatDateLabel(date)}</option>
          ))}
        </select>
      </div>

      {/* 总览 */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{totalParticipants}</div>
          <div className="stat-label">参赛人数</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{totalMatches}</div>
          <div className="stat-label">总场次</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            {reports.length > 0
              ? Math.round(reports.reduce((s, r) => s + r.wins, 0) / reports.reduce((s, r) => s + r.matches, 0) * 100)
              : 0}%
          </div>
          <div className="stat-label">平均胜率</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            {reports.length > 0
              ? (reports.reduce((s, r) => s + Math.abs(r.ratingDelta), 0) / reports.length).toFixed(0)
              : 0}
          </div>
          <div className="stat-label">场均积分波动</div>
        </div>
      </div>

      {/* 球员统计列表 */}
      {reports.length > 0 && (
        <div className="card">
          <div className="card-title">球员统计</div>
          {reports.map((r, idx) => (
            <div key={r.playerId} style={{
              display: 'flex',
              alignItems: 'center',
              padding: '10px 0',
              borderBottom: idx < reports.length - 1 ? '1px solid var(--border-color)' : 'none',
            }}>
              {/* 排名 */}
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '13px', fontWeight: 600, marginRight: 10, flexShrink: 0,
                background: idx === 0 ? 'linear-gradient(135deg, #f5af19, #f12711)' :
                  idx === 1 ? 'linear-gradient(135deg, #bdc3c7, #2c3e50)' :
                  idx === 2 ? 'linear-gradient(135deg, #b8860b, #8b4513)' :
                  'var(--bg-color)',
                color: idx < 3 ? '#fff' : 'var(--text-secondary)',
              }}>
                {idx + 1}
              </div>
              {/* 球员信息 */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                  <span style={{ fontWeight: 500, fontSize: '14px' }}>{r.playerName}</span>
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    {r.wins}胜{r.losses}负
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: '12px', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                  <span>{r.matches}局</span>
                  <span>胜率 <b style={{ color: r.winRate >= 50 ? 'var(--success-color)' : 'var(--danger-color)' }}>{r.winRate}%</b></span>
                  <span>
                    积分 <b style={{ color: r.ratingDelta >= 0 ? 'var(--success-color)' : 'var(--danger-color)' }}>
                      {r.ratingDelta >= 0 ? '+' : ''}{r.ratingDelta}
                    </b>
                  </span>
                  <span>
                    {getLevelLabel(r.levelBefore)} → {getLevelLabel(r.levelAfter)}
                    {r.levelBefore >= 0 && r.levelAfter >= 0 && r.levelBefore !== r.levelAfter && (
                      r.levelAfter < r.levelBefore
                        ? <span style={{ color: 'var(--success-color)' }}> ↑</span>
                        : <span style={{ color: 'var(--danger-color)' }}> ↓</span>
                    )}
                  </span>
                </div>
                {/* 胜率进度条 */}
                <div style={{ height: 6, backgroundColor: 'var(--bg-color)', borderRadius: 3, overflow: 'hidden', marginTop: 6 }}>
                  <div style={{
                    height: '100%',
                    width: `${r.winRate}%`,
                    background: r.winRate >= 60 ? 'var(--success-color)' : r.winRate >= 40 ? 'var(--primary-color)' : 'var(--danger-color)',
                    borderRadius: 3,
                    transition: 'width 0.3s',
                  }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 一键分享 */}
      {reports.length > 0 && (
        <div className="card">
          <button
            className="btn btn-primary btn-full"
            onClick={handleShare}
          >
            {selectedDate ? '📋 一键分享赛事日报' : '📋 一键分享总战绩'}
          </button>
          {shareNotice && (
            <div style={{
              marginTop: '8px',
              padding: '8px 12px',
              borderRadius: '6px',
              fontSize: '13px',
              textAlign: 'center',
              backgroundColor: shareNotice.startsWith('✅') ? 'rgba(82,196,26,0.1)' : 'rgba(245,34,45,0.1)',
              color: shareNotice.startsWith('✅') ? '#52c41a' : '#ff4d4f',
            }}>
              {shareNotice}
            </div>
          )}
        </div>
      )}

      {/* AI 犀利点评 */}
      {reports.length > 0 && isAIConfigured() && selectedDate && (
        <div className="card">
          <div className="card-title">🤖 AI 犀利点评</div>

          {!aiLoading && !aiCommentary && !aiError && (
            <button
              className="btn btn-full"
              style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: '#fff',
                border: 'none',
              }}
              onClick={() => handleAIGenerate()}
            >
              ✨ 生成 AI 犀利点评
            </button>
          )}

          {aiLoading && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{
                display: 'inline-block',
                width: 32, height: 32,
                border: '3px solid var(--border-color)',
                borderTopColor: '#764ba2',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }} />
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              <div style={{ marginTop: 12, fontSize: '14px', color: 'var(--text-secondary)' }}>
                AI 正在酝酿毒舌点评，请稍候...
              </div>
              <div style={{ marginTop: 4, fontSize: '12px', color: 'var(--text-secondary)', opacity: 0.6 }}>
                通常需要 30-60 秒
              </div>
            </div>
          )}

          {aiError && (
            <div style={{
              padding: '12px',
              borderRadius: '8px',
              backgroundColor: 'rgba(245,34,45,0.08)',
              fontSize: '13px',
              color: 'var(--danger-color)',
            }}>
              <div style={{ marginBottom: 8 }}>😅 {aiError}</div>
              <button
                className="btn"
                style={{ fontSize: '12px', padding: '4px 12px' }}
                onClick={() => handleAIGenerate(true)}
              >
                重试
              </button>
            </div>
          )}

          {aiCommentary && !aiLoading && (
            <div>
              {/* 球员点评 */}
              {aiCommentary.playerComments.map((pc, i) => (
                <div key={i} style={{
                  padding: '10px 12px',
                  borderRadius: '8px',
                  marginBottom: 8,
                  backgroundColor: 'var(--bg-color)',
                  borderLeft: '3px solid',
                  borderLeftColor: i === 0 ? '#f5af19' : i === 1 ? '#bdc3c7' : i === 2 ? '#b8860b' : 'var(--primary-color)',
                }}>
                  <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: 4 }}>{pc.name}</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{pc.comment}</div>
                </div>
              ))}

              {/* 全场总结 */}
              {aiCommentary.summary && (
                <div style={{
                  padding: '12px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(102,126,234,0.08)',
                  fontSize: '14px',
                  lineHeight: 1.6,
                  fontStyle: 'italic',
                  textAlign: 'center',
                  marginTop: 8,
                }}>
                  💬 {aiCommentary.summary}
                </div>
              )}

              {/* 操作按钮 */}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button
                  className="btn"
                  style={{ flex: 1, fontSize: '13px' }}
                  onClick={() => handleAIGenerate(true)}
                >
                  🔄 重新生成
                </button>
                <button
                  className="btn btn-primary"
                  style={{ flex: 1, fontSize: '13px' }}
                  onClick={handleShareAICommentary}
                >
                  📋 分享点评
                </button>
              </div>
              {aiShareNotice && (
                <div style={{
                  marginTop: 8,
                  padding: '8px 12px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  textAlign: 'center',
                  backgroundColor: aiShareNotice.startsWith('✅') ? 'rgba(82,196,26,0.1)' : 'rgba(245,34,45,0.1)',
                  color: aiShareNotice.startsWith('✅') ? '#52c41a' : '#ff4d4f',
                }}>
                  {aiShareNotice}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 图表：胜率对比 */}
      {reports.length > 1 && (
        <div className="card">
          <div className="card-title">胜率对比</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={winRateChartData} margin={{ top: 5, right: 5, bottom: 5, left: -15 }}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
              <Tooltip formatter={(v) => `${v}%`} />
              <Bar dataKey="胜率" radius={[4, 4, 0, 0]}>
                {winRateChartData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.胜率 >= 60 ? '#52c41a' : entry.胜率 >= 40 ? '#1890ff' : '#ff4d4f'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 图表：积分变动 */}
      {reports.length > 1 && (
        <div className="card">
          <div className="card-title">积分变动</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={ratingDeltaChartData} margin={{ top: 5, right: 5, bottom: 5, left: -15 }}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => `${Number(v) >= 0 ? '+' : ''}${v}`} />
              <Bar dataKey="积分变动" radius={[4, 4, 0, 0]}>
                {ratingDeltaChartData.map((entry, i) => (
                  <Cell key={i} fill={entry.积分变动 >= 0 ? '#52c41a' : '#ff4d4f'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 图表：参赛活跃度 */}
      {reports.length > 1 && (
        <div className="card">
          <div className="card-title">参赛活跃度</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={activityChartData} margin={{ top: 5, right: 5, bottom: 5, left: -15 }}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="局数" fill="#1890ff" radius={[4, 4, 0, 0]}>
                {activityChartData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};
