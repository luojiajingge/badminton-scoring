import React, { useState, useMemo } from 'react';
import { useStore } from '../store';
import { calculateLevels, getLevelLabel, getPlayerRating } from '../utils/rating';
import { nameToPinyinKey } from '../utils/pinyin';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend, Area, AreaChart
} from 'recharts';

// ===== 球员统计图表子组件 =====
interface PlayerChartsProps {
  playerId: string;
  playerName: string;
}

const PlayerCharts: React.FC<PlayerChartsProps> = ({ playerId, playerName }) => {
  const matches = useStore((state) => state.matches);

  const stats = useMemo(() => {
    const playerMatches = matches.filter(m =>
      m.status === 'completed' &&
      (m.team1.players.some(p => p.id === playerId) || m.team2.players.some(p => p.id === playerId))
    );

    if (playerMatches.length === 0) return null;

    // 胜负趋势
    const trend = playerMatches.map(m => {
      const isTeam1 = m.team1.players.some(p => p.id === playerId);
      const won = (m.winner === 'team1' && isTeam1) || (m.winner === 'team2' && !isTeam1);
      const date = new Date(m.createdAt);
      const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
      return { date: dateStr, result: won ? 1 : 0, won, label: won ? '胜' : '负' };
    });

    // 每场比赛得分详情
    const scoreDetails = playerMatches.map((m, idx) => {
      const isTeam1 = m.team1.players.some(p => p.id === playerId);
      const teamScore = isTeam1 ? m.team1.score : m.team2.score;
      const oppScore = isTeam1 ? m.team2.score : m.team1.score;
      const won = (m.winner === 'team1' && isTeam1) || (m.winner === 'team2' && !isTeam1);
      return {
        match: `第${idx + 1}场`,
        我的得分: teamScore,
        对手得分: oppScore,
        差值: teamScore - oppScore,
        结果: won ? '胜' : '负',
      };
    });

    // 对手分布
    const opponentMap = new Map<string, { name: string; wins: number; losses: number }>();
    playerMatches.forEach(m => {
      const isTeam1 = m.team1.players.some(p => p.id === playerId);
      const opponents = isTeam1 ? m.team2.players : m.team1.players;
      const opponentName = opponents.map(p => p.name).join(' & ');
      const won = (m.winner === 'team1' && isTeam1) || (m.winner === 'team2' && !isTeam1);
      const existing = opponentMap.get(opponentName) || { name: opponentName, wins: 0, losses: 0 };
      if (won) existing.wins++; else existing.losses++;
      opponentMap.set(opponentName, existing);
    });
    const opponentData = Array.from(opponentMap.values()).map(o => ({
      name: o.name.length > 6 ? o.name.slice(0, 6) + '…' : o.name,
      fullName: o.name,
      胜: o.wins,
      负: o.losses,
    }));

    // 比赛时段分布
    const hourMap = new Map<number, number>();
    playerMatches.forEach(m => {
      const hour = new Date(m.createdAt).getHours();
      hourMap.set(hour, (hourMap.get(hour) || 0) + 1);
    });
    const hourData = Array.from(hourMap.entries()).map(([hour, count]) => ({
      时段: `${hour}:00`,
      比赛场次: count,
    }));

    // 总胜率
    const wins = trend.filter(t => t.won).length;
    const losses = trend.length - wins;
    const pieData = [
      { name: '胜', value: wins },
      { name: '负', value: losses },
    ];

    return { trend, scoreDetails, opponentData, hourData, pieData, totalMatches: playerMatches.length, wins, losses };
  }, [matches, playerId]);

  if (!stats) {
    return <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)' }}>暂无比赛数据</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '12px 0' }}>
      {/* 概览卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
        <div style={{ background: 'var(--bg-secondary)', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--primary-color)' }}>{stats.totalMatches}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>总场次</div>
        </div>
        <div style={{ background: 'var(--bg-secondary)', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#52c41a' }}>{stats.wins}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>胜场</div>
        </div>
        <div style={{ background: 'var(--bg-secondary)', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#ff4d4f' }}>{stats.losses}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>负场</div>
        </div>
      </div>

      {/* 胜负比例饼图 */}
      <div className="card">
        <div className="card-title">胜负比例</div>
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Pie
              data={stats.pieData}
              cx="50%"
              cy="50%"
              innerRadius={40}
              outerRadius={65}
              dataKey="value"
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
            >
              <Cell fill="#52c41a" />
              <Cell fill="#ff4d4f" />
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* 胜负趋势 */}
      <div className="card">
        <div className="card-title">胜负趋势</div>
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={stats.trend}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis domain={[0, 1]} ticks={[0, 1]} tickFormatter={v => v === 1 ? '胜' : '负'} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v: number) => v === 1 ? '胜' : '负'} />
            <Area type="monotone" dataKey="result" stroke="#1890ff" fill="#1890ff" fillOpacity={0.15} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* 每场比赛得分对比 */}
      {stats.scoreDetails.length > 0 && (
        <div className="card">
          <div className="card-title">比赛得分对比</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={stats.scoreDetails}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
              <XAxis dataKey="match" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="我的得分" fill="#1890ff" radius={[2, 2, 0, 0]} />
              <Bar dataKey="对手得分" fill="#ff4d4f" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 对手分布 */}
      {stats.opponentData.length > 0 && (
        <div className="card">
          <div className="card-title">对手战绩</div>
          <ResponsiveContainer width="100%" height={Math.max(160, stats.opponentData.length * 36)}>
            <BarChart data={stats.opponentData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={70} />
              <Tooltip
                formatter={(v: number, name: string) => [v, name]}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? ''}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="胜" fill="#52c41a" stackId="a" />
              <Bar dataKey="负" fill="#ff4d4f" stackId="a" radius={[0, 2, 2, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 比赛时段分布 */}
      {stats.hourData.length > 1 && (
        <div className="card">
          <div className="card-title">活跃时段</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={stats.hourData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
              <XAxis dataKey="时段" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="比赛场次" fill="#722ed1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

// ===== 主组件 =====
export const PlayerManagement: React.FC = () => {
  const players = useStore((state) => state.players);
  const addPlayer = useStore((state) => state.addPlayer);
  const updatePlayer = useStore((state) => state.updatePlayer);
  const deletePlayer = useStore((state) => state.deletePlayer);

  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);

  const levels = calculateLevels(players);

  const filtered = players.filter(p => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    if (p.name.toLowerCase().includes(q)) return true;
    const key = nameToPinyinKey(p.name);
    const [full, first] = key.split('|');
    return full.includes(q) || first.includes(q);
  });

  const matchCount = (playerId: string): number => {
    const matches = useStore.getState().matches;
    return matches.filter(m =>
      m.team1.players.some(p => p.id === playerId) ||
      m.team2.players.some(p => p.id === playerId)
    ).length;
  };

  const winRate = (playerId: string): string => {
    const matches = useStore.getState().matches.filter(m =>
      m.team1.players.some(p => p.id === playerId) ||
      m.team2.players.some(p => p.id === playerId)
    );
    if (matches.length === 0) return '0%';
    const wins = matches.filter(m => m.winner === 'team1' && m.team1.players.some(p => p.id === playerId) ||
      m.winner === 'team2' && m.team2.players.some(p => p.id === playerId)).length;
    return Math.round(wins / matches.length * 100) + '%';
  };

  const handleAdd = async () => {
    if (!newName.trim() || actionLoading) return;
    setActionLoading(true);
    try {
      await addPlayer(newName.trim());
      setNewName('');
      setShowAdd(false);
    } catch {
      // store already shows notification
    } finally {
      setActionLoading(false);
    }
  };

  const handleEdit = async () => {
    if (!editingId || !editName.trim() || actionLoading) return;
    setActionLoading(true);
    try {
      await updatePlayer(editingId, editName.trim());
      setEditingId(null);
      setEditName('');
    } catch {
      // store already shows notification
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      await deletePlayer(id);
      setDeleteConfirm(null);
      if (expandedPlayerId === id) setExpandedPlayerId(null);
    } catch {
      // store already shows notification
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="fade-in">
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: '600', fontSize: '16px' }}>球员管理</span>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>共 {players.length} 人</span>
        </div>
        <input
          type="text"
          className="input"
          placeholder="搜索球员（支持拼音）..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ fontSize: '14px' }}
        />
      </div>

      {/* 添加球员 */}
      {showAdd ? (
        <div className="card" style={{ marginTop: '8px' }}>
          <input
            type="text"
            className="input"
            placeholder="输入球员姓名"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setShowAdd(false); }}
            autoFocus
          />
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setShowAdd(false); setNewName(''); }} disabled={actionLoading}>取消</button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleAdd} disabled={!newName.trim() || actionLoading}>{actionLoading ? '添加中...' : '添加'}</button>
          </div>
        </div>
      ) : (
        <button className="btn btn-primary btn-full" onClick={() => setShowAdd(true)} style={{ marginTop: '8px' }}>
          + 添加球员
        </button>
      )}

      {/* 球员列表 */}
      {filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '24px' }}>
          {players.length === 0 ? '还没有球员，请添加' : '没有匹配的球员'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
          {filtered.map(player => (
            <div key={player.id}>
              <div className="card" style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '6px 10px', cursor: 'pointer',
              }} onClick={() => setExpandedPlayerId(expandedPlayerId === player.id ? null : player.id)}>
                <div style={{ flex: 1 }}>
                  {editingId === player.id ? (
                    <input
                      type="text"
                      className="input"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleEdit(); if (e.key === 'Escape') setEditingId(null); }}
                      autoFocus
                      onClick={e => e.stopPropagation()}
                      style={{ fontSize: '15px', padding: '6px 10px' }}
                    />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '16px', fontWeight: '500' }}>{player.name}</span>
                      <span style={{
                        fontSize: '11px', padding: '1px 6px', borderRadius: '8px',
                        backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)',
                      }}>
                        {getLevelLabel(levels.get(player.id) ?? -1)}
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {matchCount(player.id)}场 · 胜率{winRate(player.id)} · {getPlayerRating(player)}分
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)', transition: 'transform 0.2s', transform: expandedPlayerId === player.id ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block' }}>
                        ▶
                      </span>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '6px', marginLeft: '8px' }} onClick={e => e.stopPropagation()}>
                  {editingId === player.id ? (
                    <>
                      <button className="btn btn-primary" onClick={handleEdit} disabled={actionLoading} style={{ padding: '2px 8px', fontSize: '12px' }}>{actionLoading ? '保存中...' : '保存'}</button>
                      <button className="btn btn-secondary" onClick={() => setEditingId(null)} style={{ padding: '2px 8px', fontSize: '12px' }}>取消</button>
                    </>
                  ) : (
                    <>
                      <button className="btn btn-secondary" onClick={() => { setEditingId(player.id); setEditName(player.name); }} style={{ padding: '2px 8px', fontSize: '12px' }}>编辑</button>
                      {deleteConfirm === player.id ? (
                        <button className="btn btn-danger" onClick={() => handleDelete(player.id)} disabled={actionLoading} style={{ padding: '2px 8px', fontSize: '12px' }}>{actionLoading ? '删除中...' : '确认?'}</button>
                      ) : (
                        <button className="btn btn-danger" onClick={() => setDeleteConfirm(player.id)} style={{ padding: '2px 8px', fontSize: '12px' }}>删除</button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* 展开的图形化统计 */}
              {expandedPlayerId === player.id && (
                <div style={{ padding: '0 8px 8px' }}>
                  <PlayerCharts playerId={player.id} playerName={player.name} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}


    </div>
  );
};
