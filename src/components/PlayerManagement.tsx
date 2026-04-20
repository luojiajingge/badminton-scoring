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

    // 比分分析：焦灼局（分差<=3）vs 碾压局（分差>=8）
    let closeGames = 0, blowoutGames = 0, totalScoreDiff = 0;
    playerMatches.forEach(m => {
      const isTeam1 = m.team1.players.some(p => p.id === playerId);
      const won = (m.winner === 'team1' && isTeam1) || (m.winner === 'team2' && !isTeam1);
      if (m.games && m.games.length > 0) {
        m.games.forEach(g => {
          const myScore = isTeam1 ? g.team1Score : g.team2Score;
          const oppScore = isTeam1 ? g.team2Score : g.team1Score;
          const diff = Math.abs(myScore - oppScore);
          totalScoreDiff += diff;
          if (diff <= 3) closeGames++;
          if (diff >= 8) blowoutGames++;
        });
      }
    });

    // 连胜/连败分析
    let maxWinStreak = 0, maxLoseStreak = 0, curStreak = 0, curIsWin = false;
    playerMatches.forEach(m => {
      const isTeam1 = m.team1.players.some(p => p.id === playerId);
      const won = (m.winner === 'team1' && isTeam1) || (m.winner === 'team2' && !isTeam1);
      if (won === curIsWin) { curStreak++; }
      else { curStreak = 1; curIsWin = won; }
      if (curIsWin && curStreak > maxWinStreak) maxWinStreak = curStreak;
      if (!curIsWin && curStreak > maxLoseStreak) maxLoseStreak = curStreak;
    });

    // 打球频度（天数为单位）
    const playDays = new Set(playerMatches.map(m => m.matchDate || new Date(m.createdAt).toISOString().split('T')[0])).size;
    const avgPerDay = playerMatches.length > 0 ? (playerMatches.length / playDays).toFixed(1) : '0';

    return {
      trendData, activeDateData, opponentData, pieData,
      totalMatches: playerMatches.length, wins, losses,
      closeGames, blowoutGames, avgScoreDiff: playerMatches.length > 0 ? (totalScoreDiff / playerMatches.length).toFixed(1) : '0',
      maxWinStreak, maxLoseStreak, playDays, avgPerDay,
    };
  }, [matches, playerId]);

  const stars = (n: number) => '★'.repeat(Math.min(5, Math.max(1, n)));

  const handleShare = () => {
    const player = allPlayers.find(p => p.id === playerId);
    if (!player || !stats) return;

    const rating = getPlayerRating(player);
    const levels = calculateLevels(allPlayers);
    const level = levels.get(playerId);
    const levelLabel = level !== undefined && level >= 0 ? getLevelLabel(level) : '未定级';

    const sorted = [...allPlayers].sort((a, b) => (b.rating ?? 2000) - (a.rating ?? 2000));
    const rank = sorted.findIndex(p => p.id === playerId) + 1;
    const winRate = stats.totalMatches > 0 ? Math.round((stats.wins / stats.totalMatches) * 100) : 0;
    const t = stats.totalMatches;

    // === 五维画像 ===

    // 1. 活跃度 (1-5)
    let activityLevel = 1;
    if (t >= 50) activityLevel = 5;
    else if (t >= 30) activityLevel = 4;
    else if (t >= 15) activityLevel = 3;
    else if (t >= 5) activityLevel = 2;
    const activityStars = stars(activityLevel);
    const activityTag = ['', '佛系选手', '偶尔露面', '羽球常客', '羽球狂人', '着魔了'][activityLevel];
    const activityDesc = [
      '来无影去无踪，神龙见首不见尾',
      '偶尔来打打，主打一个参与感',
      '球场老面孔，风雨无阻',
      '一周不打手痒，两天不打心慌',
      '不是在打球，就是在去打球的路上',
    ][activityLevel - 1];

    // 2. 硬实力 (1-5)
    let powerLevel = 1;
    if (rating >= 2200) powerLevel = 5;
    else if (rating >= 2100) powerLevel = 4;
    else if (rating >= 2000) powerLevel = 3;
    else if (rating >= 1900) powerLevel = 2;
    const powerStars = stars(powerLevel);
    const powerTag = ['', '萌新入门', '稳步进阶', '中坚力量', '实力高手', '积分天花板'][powerLevel];
    const powerDesc = [
      '球场上最可爱的存在',
      '每天都在进步，潜力股',
      '积分榜中游，不好惹的存在',
      '积分榜上游，实力说话',
      '独孤求败，高处不胜寒',
    ][powerLevel - 1];

    // 3. 统治力 (1-5)
    let dominanceLevel = 1;
    if (winRate >= 75) dominanceLevel = 5;
    else if (winRate >= 60) dominanceLevel = 4;
    else if (winRate >= 45) dominanceLevel = 3;
    else if (winRate >= 30) dominanceLevel = 2;
    const dominanceStars = stars(dominanceLevel);
    const dominanceTag = ['', '提分宝宝', '有来有回', '胜率过半', '胜率机器', '降维打击'][dominanceLevel];
    const dominanceDesc = [
      '深得民心，人人都爱跟你打',
      '五五开选手，谁打都不怕',
      '赢多输少，对手的噩梦',
      '胜率就是你的名片',
      '对手见面先问：今天能不能放水？',
    ][dominanceLevel - 1];

    // 4. 比赛风格 (1-5)
    const totalGames = stats.closeGames + stats.blowoutGames;
    let styleTag = '稳扎稳打';
    let styleDesc = '每分必争，稳中求胜';
    if (totalGames > 0) {
      const closeRatio = stats.closeGames / totalGames;
      const blowRatio = stats.blowoutGames / totalGames;
      if (closeRatio > 0.5) { styleTag = '刀尖舞者'; styleDesc = '擅长焦灼局，大心脏选手'; }
      else if (blowRatio > 0.5 && winRate >= 50) { styleTag = '绝不留情'; styleDesc = '从不拖泥带水，赢球不废话'; }
      else if (blowRatio > 0.5 && winRate < 50) { styleTag = '快乐至上'; styleDesc = '比分不重要，出出汗就行'; }
    }

    // 5. 稳定性 (1-5)
    let stabilityLevel = 3;
    if (stats.maxWinStreak >= 5 || stats.maxLoseStreak >= 5) stabilityLevel = 2;
    if (stats.maxWinStreak >= 3 && stats.maxLoseStreak >= 3) stabilityLevel = 1;
    if (stats.maxWinStreak <= 3 && stats.maxLoseStreak <= 2) stabilityLevel = 4;
    if (stats.maxLoseStreak <= 1 && t >= 10) stabilityLevel = 5;
    const stabilityStars = stars(stabilityLevel);
    const stabilityTag = ['', '过山车', '状态型', '一般般', '很稳定', '稳如老狗'][stabilityLevel];
    const stabilityDesc = [
      '不是超神就是超鬼，看心情',
      '状态好谁都能赢，状态差谁都能输',
      '发挥中规中矩，偶有亮点',
      '发挥稳定，值得信赖',
      '发挥永远在水准之上',
    ][stabilityLevel - 1];

    // 一句话评价（根据画像组合）
    let oneLiner = '';
    if (t < 3) {
      oneLiner = '新手上路，传奇待续。羽毛球场，等你来战！';
    } else if (powerLevel >= 5 && dominanceLevel >= 5) {
      oneLiner = '积分榜的常客，对手的噩梦。别人打球靠运气，你打球靠实力。';
    } else if (activityLevel >= 4 && dominanceLevel <= 2) {
      oneLiner = '铁打的球架流水的分——输了比赛赢了快乐，积分界的活菩萨。';
    } else if (activityLevel <= 2 && dominanceLevel >= 4) {
      oneLiner = '不鸣则已一鸣惊人。传说中的"神秘高手"，出手即是胜利。';
    } else if (stabilityLevel <= 2) {
      oneLiner = '状态型选手，今天超神还是超鬼？掷个硬币吧。';
    } else if (styleTag === '刀尖舞者') {
      oneLiner = '专打关键分，心脏不好别跟你打。焦灼局？那只是日常。';
    } else if (powerLevel >= 4 && dominanceLevel >= 4) {
      oneLiner = '实力与战绩齐飞，积分共排名一色。球场上最靓的仔。';
    } else if (dominanceLevel >= 3) {
      oneLiner = '稳扎稳打步步为营，球场的常青树。不突出，但不好惹。';
    } else {
      oneLiner = '热爱可抵岁月长，每次挥拍都是对羽毛球的深情告白。';
    }

    // 连胜/连败彩蛋
    let streakNote = '';
    if (stats.maxWinStreak >= 5) streakNote = `\n🔥 最长连胜: ${stats.maxWinStreak}场`;
    if (stats.maxLoseStreak >= 5) streakNote += `
💀 最长连败: ${stats.maxLoseStreak}场`;

    const text = [
      `🏸 球员战报 | ${playerName}`,
      `━━━━━━━━━━━━━━━`,
      `📊 ${t}场 ${stats.wins}胜${stats.losses}负  胜率${winRate}%  积分${rating}`,
      `🏅 排名: 第${rank}/${allPlayers.length}人  级别: ${levelLabel}`,
      `📅 活跃${stats.playDays}天  日均${stats.avgPerDay}场${streakNote}`,
      `━━━━━━━━━━━━━━━`,
      `🎭 球员画像`,
      `活跃度: ${activityStars} ${activityTag}——${activityDesc}`,
      `硬实力: ${powerStars} ${powerTag}——${powerDesc}`,
      `统治力: ${dominanceStars} ${dominanceTag}——${dominanceDesc}`,
      `风  格: ${styleTag}——${styleDesc}`,
      `稳定性: ${stabilityStars} ${stabilityTag}——${stabilityDesc}`,
      `━━━━━━━━━━━━━━━`,
      `💬 ${oneLiner}`,
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
