import React from 'react';
import { useStore } from '../store';
import { calculateLevels, getLevelLabel, getPlayerRating } from '../utils/rating';

const LEVEL_COLORS: Record<number, string> = {
  0: '#faad14', // L0 金色
  1: '#1890ff', // L1 蓝色
  2: '#52c41a', // L2 绿色
  3: '#8c8c8c', // L3 灰色
  4: '#8c8c8c', // L4 灰色
};

export const Leaderboard: React.FC = () => {
  const players = useStore((state) => state.players);
  const matches = useStore((state) => state.matches);
  
  const levels = calculateLevels(players);
  
  // 计算每个球员的战绩
  const playerStats = players.map(player => {
    const completedMatches = matches.filter(m => m.status === 'completed');
    const playerMatches = completedMatches.filter(m =>
      m.team1.players.some(p => p.id === player.id) ||
      m.team2.players.some(p => p.id === player.id)
    );
    const wins = playerMatches.filter(m => {
      const inTeam1 = m.team1.players.some(p => p.id === player.id);
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
  
  // 按积分从高到低排序
  playerStats.sort((a, b) => b.rating - a.rating);
  
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
        {playerStats.map((entry, index) => {
          const rank = index + 1;
          const levelColor = entry.level >= 0 ? LEVEL_COLORS[entry.level] : 'var(--text-secondary)';
          return (
            <div key={entry.player.id} className="leaderboard-item">
              <div className={`leaderboard-rank ${getRankClass(rank)}`}>
                {rank}
              </div>
              <div className="leaderboard-info">
                <div className="leaderboard-name">
                  {entry.player.name}
                  <span style={{
                    marginLeft: '6px', fontSize: '11px', padding: '1px 6px', borderRadius: '8px',
                    backgroundColor: entry.level >= 0 ? `${levelColor}20` : 'var(--bg-secondary)',
                    color: levelColor,
                  }}>
                    {getLevelLabel(entry.level)}
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
