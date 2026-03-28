import React, { useState, useMemo } from 'react';
import { useStore } from '../store';
import { calculatePlayerStats, calculateHeadToHead, getActivityFrequency } from '../utils/helpers';

export const Statistics: React.FC = () => {
  const players = useStore((state) => state.players);
  const matches = useStore((state) => state.matches);
  const [selectedPlayer1, setSelectedPlayer1] = useState('');
  const [selectedPlayer2, setSelectedPlayer2] = useState('');

  const completedMatches = useMemo(
    () => matches.filter((m) => m.status === 'completed'),
    [matches]
  );

  const activityFrequency = useMemo(() => getActivityFrequency(completedMatches), [completedMatches]);

  const totalMatches = completedMatches.length;
  const totalGames = completedMatches.reduce((sum, m) => {
    // Guard: ensure games array exists and count only won games
    if (!m.games || !Array.isArray(m.games)) return sum;
    return sum + m.games.filter((g) => g.winner).length;
  }, 0);

  const activePlayers = useMemo(() => {
    const ids = new Set<string>();
    completedMatches.forEach((m) => {
      if (m.team1?.players) m.team1.players.forEach((p) => ids.add(p.id));
      if (m.team2?.players) m.team2.players.forEach((p) => ids.add(p.id));
    });
    return ids.size;
  }, [completedMatches]);

  // Build a map of player names from both current players and matches (for deleted players)
  const allPlayerNames = useMemo(() => {
    const nameMap = new Map<string, string>();
    players.forEach((p) => nameMap.set(p.id, p.name));
    // Also extract names from match history for deleted players
    matches.forEach((m) => {
      if (m.team1?.players) m.team1.players.forEach((p) => {
        if (!nameMap.has(p.id)) nameMap.set(p.id, p.name);
      });
      if (m.team2?.players) m.team2.players.forEach((p) => {
        if (!nameMap.has(p.id)) nameMap.set(p.id, p.name);
      });
    });
    return nameMap;
  }, [players, matches]);

  const getPlayerName = (id: string) => allPlayerNames.get(id) ?? '已删除的玩家';

  // Player stats: include deleted players that appear in matches
  const playerStatsList = useMemo(() => {
    const playerIds = new Set<string>();
    players.forEach((p) => playerIds.add(p.id));
    completedMatches.forEach((m) => {
      if (m.team1?.players) m.team1.players.forEach((p) => playerIds.add(p.id));
      if (m.team2?.players) m.team2.players.forEach((p) => playerIds.add(p.id));
    });

    return Array.from(playerIds)
      .map((id) => ({
        playerId: id,
        playerName: getPlayerName(id),
        stats: calculatePlayerStats(id, completedMatches),
      }))
      .filter((p) => p.stats.totalMatches > 0)
      .sort((a, b) => b.stats.winRate - a.stats.winRate);
  }, [players, completedMatches, allPlayerNames]);

  const h2h = useMemo(() => {
    if (!selectedPlayer1 || !selectedPlayer2 || selectedPlayer1 === selectedPlayer2) return null;
    return calculateHeadToHead(selectedPlayer1, selectedPlayer2, completedMatches);
  }, [selectedPlayer1, selectedPlayer2, completedMatches]);

  // Players for H2H dropdown: include deleted players from matches
  const h2hPlayers = useMemo(() => {
    const ids = new Set<string>();
    players.forEach((p) => ids.add(p.id));
    completedMatches.forEach((m) => {
      if (m.team1?.players) m.team1.players.forEach((p) => ids.add(p.id));
      if (m.team2?.players) m.team2.players.forEach((p) => ids.add(p.id));
    });
    return Array.from(ids).map((id) => ({
      id,
      name: getPlayerName(id),
    }));
  }, [players, completedMatches, allPlayerNames]);

  // Activity calendar data (last 30 days)
  const calendarData = useMemo(() => {
    const days: { date: string; count: number }[] = [];
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      days.push({ date: key, count: activityFrequency.get(key) || 0 });
    }
    return days;
  }, [activityFrequency]);

  const maxActivity = Math.max(...calendarData.map((d) => d.count), 1);

  if (completedMatches.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📊</div>
        <div>暂无统计数据</div>
        <div style={{ fontSize: '12px', marginTop: '8px' }}>完成比赛后将显示统计</div>
      </div>
    );
  }

  return (
    <div className="fade-in">
      {/* Overview */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{totalMatches}</div>
          <div className="stat-label">总比赛场次</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{totalGames}</div>
          <div className="stat-label">总局数</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{activePlayers}</div>
          <div className="stat-label">活跃玩家</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{matches.filter((m) => m.type === 'singles').length}</div>
          <div className="stat-label">单打场次</div>
        </div>
      </div>

      {/* Player Win Rate */}
      {playerStatsList.length > 0 && (
        <div className="card">
          <div className="card-title">玩家胜率排行</div>
          {playerStatsList.map(({ playerId, playerName, stats }) => (
            <div key={playerId} style={{ marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '14px', fontWeight: 500 }}>
                  {playerName}
                  {!players.find((p) => p.id === playerId) && (
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginLeft: '4px' }}>(已删除)</span>
                  )}
                </span>
                <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                  {stats.wins}胜 {stats.losses}负 ({stats.winRate}%)
                </span>
              </div>
              <div style={{ height: '8px', backgroundColor: 'var(--bg-color)', borderRadius: '4px', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${stats.winRate}%`,
                    background: 'linear-gradient(90deg, var(--primary-color), var(--success-color))',
                    borderRadius: '4px',
                    transition: 'width 0.3s',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Head to Head */}
      <div className="card">
        <div className="card-title">对阵记录查询</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '8px', alignItems: 'center', marginBottom: '12px' }}>
          <select
            className="input"
            value={selectedPlayer1}
            onChange={(e) => setSelectedPlayer1(e.target.value)}
          >
            <option value="">选择玩家1</option>
            {h2hPlayers.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <span style={{ fontWeight: 600 }}>VS</span>
          <select
            className="input"
            value={selectedPlayer2}
            onChange={(e) => setSelectedPlayer2(e.target.value)}
          >
            <option value="">选择玩家2</option>
            {h2hPlayers.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        {h2h && (
          <div className="h2h-display">
            <div className="h2h-player">
              <div style={{ fontSize: '14px', fontWeight: 500 }}>{getPlayerName(selectedPlayer1)}</div>
              <div className="h2h-score">{h2h.player1Wins}</div>
            </div>
            <div className="h2h-vs">
              {h2h.totalMatches > 0 ? (
                <>共 {h2h.totalMatches} 场</>
              ) : (
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>暂无对阵记录</span>
              )}
            </div>
            <div className="h2h-player">
              <div style={{ fontSize: '14px', fontWeight: 500 }}>{getPlayerName(selectedPlayer2)}</div>
              <div className="h2h-score">{h2h.player2Wins}</div>
            </div>
          </div>
        )}
        {!h2h && selectedPlayer1 && selectedPlayer2 && selectedPlayer1 === selectedPlayer2 && (
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>请选择不同的玩家</p>
        )}
      </div>

      {/* Activity Frequency */}
      <div className="card">
        <div className="card-title">近30天活动频率</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {calendarData.map((d) => (
            <div
              key={d.date}
              title={`${d.date}: ${d.count}场`}
              style={{
                width: '14px',
                height: '14px',
                borderRadius: '2px',
                backgroundColor: d.count === 0 ? 'var(--border-color)' : `rgba(24, 144, 255, ${Math.min(d.count / maxActivity + 0.3, 1)})`,
              }}
            />
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
          <span>30天前</span>
          <span>今天</span>
        </div>
      </div>
    </div>
  );
};
