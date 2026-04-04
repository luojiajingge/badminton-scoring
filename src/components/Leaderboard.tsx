import React, { useMemo, useState } from 'react';
import { useStore } from '../store';
import { calculateLevels, getPlayerRating } from '../utils/rating';

const LEVEL_META: Record<number, { color: string; label: string; icon: string }> = {
  0: { color: '#faad14', label: '顶尖组', icon: '🥇' },
  1: { color: '#1890ff', label: '进阶组', icon: '🥈' },
  2: { color: '#52c41a', label: '标准组', icon: '🥉' },
  3: { color: '#8c8c8c', label: '成长组', icon: '📈' },
  4: { color: '#bfbfbf', label: '新秀组', icon: '🌱' },
};

export const Leaderboard: React.FC = () => {
  const players = useStore((state) => state.players);
  const matches = useStore((state) => state.matches);
  const [levelFilter, setLevelFilter] = useState<number | 'all' | 'unrated'>('all');

  const levels = useMemo(() => calculateLevels(players), [players]);

  const playerStats = useMemo(() => {
    const completedMatches = matches.filter((m) => m.status === 'completed');

    const stats = players.map((player) => {
      const playerMatches = completedMatches.filter((m) =>
        m.team1.players.some((p) => p.id === player.id) ||
        m.team2.players.some((p) => p.id === player.id)
      );
      const wins = playerMatches.filter((m) => {
        const inTeam1 = m.team1.players.some((p) => p.id === player.id);
        return (m.winner === 'team1' && inTeam1) || (m.winner === 'team2' && !inTeam1);
      }).length;

      return {
        player,
        rating: getPlayerRating(player),
        level: levels.get(player.id) ?? -1,
        totalMatches: playerMatches.length,
        wins,
        losses: playerMatches.length - wins,
        winRate: playerMatches.length > 0 ? Math.round((wins / playerMatches.length) * 100) : 0,
      };
    });

    stats.sort((a, b) => b.rating - a.rating);
    return stats;
  }, [players, matches, levels]);

  const filteredPlayerStats = useMemo(() => {
    if (levelFilter === 'all') return playerStats;
    if (levelFilter === 'unrated') return playerStats.filter((entry) => entry.level < 0);
    return playerStats.filter((entry) => entry.level === levelFilter);
  }, [playerStats, levelFilter]);
  
  if (players.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">🏆</div>
        <div>暂无排行数据</div>
        <div style={{ fontSize: '12px', marginTop: '8px' }}>完成比赛后将显示排名</div>
      </div>
    );
  }
  
  const getRankClass = (rank: number) => {
    if (rank === 1) return 'gold';
    if (rank === 2) return 'silver';
    if (rank === 3) return 'bronze';
    return '';
  };

  return (
    <div className="fade-in">
      <div className="card">
        <div className="card-title">积分排行榜</div>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          初始2000分 · 级别按积分排名动态划分（L0~L4）
        </p>
        <div className="leaderboard-filter-bar">
          <button
            className={`leaderboard-filter-chip ${levelFilter === 'all' ? 'active' : ''}`}
            onClick={() => setLevelFilter('all')}
          >
            全部
          </button>
          {Object.entries(LEVEL_META).map(([level, meta]) => {
            const levelNum = Number(level);
            const isActive = levelFilter === levelNum;
            return (
              <button
                key={level}
                className={`leaderboard-filter-chip ${isActive ? 'active' : ''}`}
                onClick={() => setLevelFilter(levelNum)}
                style={isActive ? undefined : { borderColor: `${meta.color}70`, color: meta.color }}
              >
                {meta.icon} L{level}
              </button>
            );
          })}
          <button
            className={`leaderboard-filter-chip ${levelFilter === 'unrated' ? 'active' : ''}`}
            onClick={() => setLevelFilter('unrated')}
          >
            ❔ 未定级
          </button>
        </div>
        {filteredPlayerStats.length === 0 && (
          <div className="leaderboard-filter-empty">当前筛选下暂无球员</div>
        )}
        {filteredPlayerStats.map((entry, index) => {
          const rank = index + 1;
          const levelMeta = entry.level >= 0 ? LEVEL_META[entry.level] : null;
          return (
            <div key={entry.player.id} className="leaderboard-item">
              <div className={`leaderboard-rank ${getRankClass(rank)}`}>
                {rank}
              </div>
              <div className="leaderboard-info">
                <div className="leaderboard-name">{entry.player.name}</div>
                <div className="leaderboard-level-row">
                  <span
                    className="leaderboard-level-chip"
                    style={{
                      backgroundColor: levelMeta ? `${levelMeta.color}20` : 'var(--bg-color)',
                      color: levelMeta ? levelMeta.color : 'var(--text-secondary)',
                    }}
                  >
                    {levelMeta ? `${levelMeta.icon} L${entry.level}` : '❔ 未定级'}
                  </span>
                  <span className="leaderboard-level-chip-text">
                    {levelMeta ? levelMeta.label : '暂无有效比赛数据'}
                  </span>
                </div>
                <div className="leaderboard-stats">
                  {entry.totalMatches}场 {entry.wins}胜 {entry.losses}负
                </div>
              </div>
              <div className="leaderboard-points">{entry.rating}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
