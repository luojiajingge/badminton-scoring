import React, { useState, useMemo } from 'react';
import { useStore } from '../store';
import { calculateLevels, getLevelLabel, getPlayerRating } from '../utils/rating';
import { nameToPinyinKey } from '../utils/pinyin';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, Area, AreaChart
} from 'recharts';

// ===== 球员统计图表子组件 =====
interface PlayerChartsProps {
  playerId: string;
  playerName: string;
}

const PlayerCharts: React.FC<PlayerChartsProps> = ({ playerId, playerName }) => {
  const matches = useStore((state) => state.matches);
  const allPlayers = useStore((state) => state.players);
  const [shareNotice, setShareNotice] = useState<string | null>(null);

  const stats = useMemo(() => {
    const playerMatches = matches.filter(m =>
      m.status === 'completed' &&
      (m.team1.players.some(p => p.id === playerId) || m.team2.players.some(p => p.id === playerId))
    );

    if (playerMatches.length === 0) return null;

    // 按日期汇总胜负趋势
    const dateMap = new Map<string, { wins: number; losses: number }>();
    playerMatches.forEach(m => {
      const isTeam1 = m.team1.players.some(p => p.id === playerId);
      const won = (m.winner === 'team1' && isTeam1) || (m.winner === 'team2' && !isTeam1);
      const dateStr = m.matchDate || new Date(m.createdAt).toISOString().split('T')[0];
      const displayDate = dateStr.slice(5).replace('-', '/');
      const entry = dateMap.get(displayDate) || { wins: 0, losses: 0 };
      if (won) entry.wins++; else entry.losses++;
      dateMap.set(displayDate, entry);
    });
    const trendData = Array.from(dateMap.entries()).map(([date, { wins, losses }]) => ({
      date, 胜: wins, 负: losses,
    }));

    // 活跃日期分布
    const activeDateMap = new Map<string, number>();
    playerMatches.forEach(m => {
      const dateStr = m.matchDate || new Date(m.createdAt).toISOString().split('T')[0];
      const displayDate = dateStr.slice(5).replace('-', '/');
      activeDateMap.set(displayDate, (activeDateMap.get(displayDate) || 0) + 1);
    });
    const activeDateData = Array.from(activeDateMap.entries()).map(([date, count]) => ({
      日期: date, 场次: count,
    }));

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

    // 总胜率
    const wins = playerMatches.filter(m => {
      const isTeam1 = m.team1.players.some(p => p.id === playerId);
      return (m.winner === 'team1' && isTeam1) || (m.winner === 'team2' && !isTeam1);
    }).length;
    const losses = playerMatches.length - wins;
    const pieData = [
      { name: '胜', value: wins },
      { name: '负', value: losses },
    ];

    return { trendData, activeDateData, opponentData, pieData, totalMatches: playerMatches.length, wins, losses };
  }, [matches, playerId]);

  const handleShare = () => {
    const player = allPlayers.find(p => p.id === playerId);
    if (!player || !stats) return;

    const rating = getPlayerRating(player);
    const levels = calculateLevels(allPlayers);
    const level = levels.get(playerId);
    const levelLabel = level !== undefined && level >= 0 ? getLevelLabel(level) : '未定级';

    // 计算排名
    const sorted = [...allPlayers].sort((a, b) => (b.rating ?? 2000) - (a.rating ?? 2000));
    const rank = sorted.findIndex(p => p.id === playerId) + 1;
    const winRate = stats.totalMatches > 0 ? Math.round((stats.wins / stats.totalMatches) * 100) : 0;

    // 诙谐评价
    let comment = '';
    if (stats.totalMatches < 3) {
      comment = '🏸 新手上路，未来可期！';
    } else if (winRate >= 80) {
      comment = '👑 球场霸主，谁来挑战？';
    } else if (winRate >= 60) {
      comment = '🔥 实力选手，稳如泰山！';
    } else if (winRate >= 50) {
      comment = '⚔️ 势均力敌，越战越勇！';
    } else if (winRate >= 30) {
      comment = '💪 屡败屡战，精神可嘉！';
    } else {
      comment = '🎯 积分扶贫大使，人人爱打！';
    }
    if (rating >= 2200) comment = '🏆 积分天花板，独孤求败！' + comment;
    if (rank === 1 && allPlayers.length > 3) comment = '🥇 天下第一，谁与争锋！';

    const text = [
      `🏸 球员名片 | ${playerName}`,
      `━━━━━━━━━━━━━━━`,
      `📊 总场次: ${stats.totalMatches}  胜: ${stats.wins}  负: ${stats.losses}`,
      `📈 胜率: ${winRate}%  |  积分: ${rating}  |  级别: ${levelLabel}`,
      `🏅 排名: 第${rank}名 / 共${allPlayers.length}人`,
      `━━━━━━━━━━━━━━━`,
      comment,
    ].join('\n');

    navigator.clipboard.writeText(text).then(() => {
      setShareNotice('✅ 已复制到剪贴板，可直接粘贴到微信分享');
      setTimeout(() => setShareNotice(null), 3000);
    }).catch(() => {
      setShareNotice('❌ 复制失败，请手动复制');
      setTimeout(() => setShareNotice(null), 3000);
    });
  };

  if (!stats) {
    return <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)' }}>暂无比赛数据</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '12px 0' }}>
      {/* 概览卡片 + 分享按钮 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
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
        <button
          onClick={handleShare}
          style={{
            background: 'var(--primary-color)', color: '#fff', border: 'none', borderRadius: '10px',
            padding: '12px', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
          }}
        >
          一键分享
        </button>
      </div>

      {shareNotice && (
        <div style={{
          padding: '10px', borderRadius: '8px', fontSize: '13px', textAlign: 'center',
          backgroundColor: shareNotice.startsWith('✅') ? 'rgba(82,196,26,0.1)' : 'rgba(245,34,45,0.1)',
          color: shareNotice.startsWith('✅') ? '#52c41a' : '#ff4d4f',
        }}>
          {shareNotice}
        </div>
      )}

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
              label={({ name, percent }: any) => `${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`}
            >
              <Cell fill="#52c41a" />
              <Cell fill="#ff4d4f" />
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* 胜负趋势（柱形图） */}
      <div className="card">
        <div className="card-title">胜负趋势</div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={stats.trendData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="胜" stackId="a" fill="#52c41a" radius={[2, 2, 0, 0]} />
            <Bar dataKey="负" stackId="a" fill="#ff4d4f" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

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
                formatter={(v: any, name: any) => [v, name]}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? ''}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="胜" fill="#52c41a" stackId="a" />
              <Bar dataKey="负" fill="#ff4d4f" stackId="a" radius={[0, 2, 2, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 活跃日期分布 */}
      {stats.activeDateData.length > 0 && (
        <div className="card">
          <div className="card-title">活跃日期</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={stats.activeDateData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
              <XAxis dataKey="日期" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="场次" fill="#722ed1" radius={[4, 4, 0, 0]} />
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
