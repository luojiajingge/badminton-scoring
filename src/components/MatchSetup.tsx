import { VoiceInput } from './VoiceInput';
import React, { useState, useMemo } from 'react';
import { useStore } from '../store';
import type { MatchType, MatchMode, ScoreMode, Player } from '../types';
import { nameToPinyinKey } from '../utils/pinyin';

type SetupMode = 'manual' | 'quick';

interface MatchSetupProps {
  onStart: () => void;
}

// 获取今天的日期字符串
const getTodayDate = () => new Date().toISOString().split('T')[0];

export const MatchSetup: React.FC<MatchSetupProps> = ({ onStart }) => {
  const players = useStore((state) => state.players);
  const currentMatch = useStore((state) => state.currentMatch);
  const createMatch = useStore((state) => state.createMatch);
  const addPlayer = useStore((state) => state.addPlayer);

  const [setupMode, setSetupMode] = useState<SetupMode>('quick');
  const [matchType, setMatchType] = useState<MatchType>('singles');
  const [matchMode, setMatchMode] = useState<MatchMode>('single');
  const [scoreMode, setScoreMode] = useState<ScoreMode>('direct-input');
  const [matchDate, setMatchDate] = useState<string>(getTodayDate());
  const [team1Selected, setTeam1Selected] = useState<string[]>([]);
  const [team2Selected, setTeam2Selected] = useState<string[]>([]);
  const [search1, setSearch1] = useState('');
  const [search2, setSearch2] = useState('');

  const playersPerTeam = matchType === 'singles' ? 1 : 2;

  const availablePlayers = useMemo(() => {
    const team2Set = new Set(team2Selected);
    const team1Set = new Set(team1Selected);
    return players.filter(p => !team2Set.has(p.id));
  }, [players, team2Selected]);

  const availablePlayers2 = useMemo(() => {
    const team1Set = new Set(team1Selected);
    return players.filter(p => !team1Set.has(p.id));
  }, [players, team1Selected]);

  const filtered1 = useMemo(() => {
    if (!search1.trim()) return availablePlayers;
    const q = search1.trim().toLowerCase();
    return availablePlayers.filter(p => {
      const py = nameToPinyinKey(p.name);
      return p.name.toLowerCase().includes(q) || py.includes(q);
    });
  }, [availablePlayers, search1]);
  const filtered2 = useMemo(() => {
    if (!search2.trim()) return availablePlayers2;
    const q = search2.trim().toLowerCase();
    return availablePlayers2.filter(p => {
      const py = nameToPinyinKey(p.name);
      return p.name.toLowerCase().includes(q) || py.includes(q);
    });
  }, [availablePlayers2, search2]);
  const handlePlayerSelect = (playerId: string, team: 'team1' | 'team2') => {
    if (team === 'team1') {
      if (team1Selected.includes(playerId)) {
        setTeam1Selected(team1Selected.filter(id => id !== playerId));
      } else if (team1Selected.length < playersPerTeam) {
        setTeam1Selected([...team1Selected, playerId]);
      }
    } else {
      if (team2Selected.includes(playerId)) {
        setTeam2Selected(team2Selected.filter(id => id !== playerId));
      } else if (team2Selected.length < playersPerTeam) {
        setTeam2Selected([...team2Selected, playerId]);
      }
    }
  };

  const canStart = team1Selected.length === playersPerTeam && team2Selected.length === playersPerTeam;

  const handleStart = () => {
    const team1Players = team1Selected
      .map(id => players.find(p => p.id === id))
      .filter((p): p is Player => p !== undefined);
    const team2Players = team2Selected
      .map(id => players.find(p => p.id === id))
      .filter((p): p is Player => p !== undefined);
    if (team1Players.length !== playersPerTeam || team2Players.length !== playersPerTeam) {
      console.error('Player selection incomplete');
      return;
    }
    // 检查未清算日期
    const unsettled = useStore.getState().getUnsettledDates();
    const earlierUnsettled = unsettled.filter(d => d < matchDate);
    if (earlierUnsettled.length > 0) {
      alert(earlierUnsettled[0] + ' 等日期有比赛未清算，请先清算后再录入新比赛');
      return;
    }
    createMatch(matchType, matchMode, scoreMode, team1Players, team2Players, matchDate);
    onStart();
  };

  const renderTeamSelect = (
    team: 'team1' | 'team2',
    selected: string[],
    filtered: typeof players,
    search: string,
    setSearch: (v: string) => void,
  ) => {
    const selectedNames = selected.map(id => players.find(p => p.id === id)).filter(Boolean);
    const needSearch = players.length > 6;

    return (
      <div className="card">
        <div className="card-title">
          {team === 'team1' ? '队伍1' : '队伍2'}
          <span style={{ fontWeight: 'normal', fontSize: '12px', color: 'var(--text-secondary)' }}>
            （选{playersPerTeam}人）
          </span>
        </div>

        {/* 已选标签 */}
        {selectedNames.length > 0 && (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
            {selectedNames.map(p => p && (
              <span key={p.id} style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                padding: '5px 12px', borderRadius: '14px', fontSize: '15px',
                backgroundColor: 'var(--primary-color)', color: '#fff',
              }}>
                {p.name}
                <span onClick={() => handlePlayerSelect(p.id, team)}
                  style={{ cursor: 'pointer', opacity: 0.8, fontSize: '15px', lineHeight: 1 }}>✕</span>
              </span>
            ))}
          </div>
        )}

        {/* 搜索框 */}
        {needSearch && (
          <div style={{ position: 'relative', marginBottom: '10px' }}>
            <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', fontSize: '14px' }}>🔍</span>
            <input type="text" className="input" placeholder="搜索选手..."
              value={search} onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: '32px', fontSize: '13px', padding: '8px 8px 8px 32px' }} />
          </div>
        )}

        {/* 选手网格（可滚动） */}
        <div style={{
          maxHeight: '180px', overflowY: 'auto', overflowX: 'hidden',
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px',
        }}>
          {filtered.map(player => {
            const isSelected = selected.includes(player.id);
            const isDisabled = team === 'team1'
              ? team2Selected.includes(player.id)
              : team1Selected.includes(player.id);
            return (
              <div key={player.id}
                className={`player-option ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
                onClick={() => !isDisabled && handlePlayerSelect(player.id, team)}
                style={{
                  padding: '8px 2px', fontSize: '15px', borderRadius: '6px',
                  opacity: isDisabled ? 0.4 : 1,
                  cursor: isDisabled ? 'not-allowed' : 'pointer',
                  border: isSelected ? '2px solid var(--primary-color)' : '1px solid var(--border-color)',
                  backgroundColor: isSelected ? 'rgba(24, 144, 255, 0.1)' : 'var(--card-bg)',
                }}>
                {player.name}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px', padding: '12px' }}>
              {needSearch ? '没有匹配的选手' : '还没有选手，请先添加'}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fade-in">
      {/* 模式切换 Tab */}
      <div className="card" style={{ padding: '4px' }}>
        <div style={{ display: 'flex', gap: '4px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', padding: '4px' }}>
          <button
            className={`btn ${setupMode === 'quick' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ flex: 1, padding: '10px', fontSize: '14px' }}
            onClick={() => setSetupMode('quick')}
          >
            快速录入
          </button>
          <button
            className={`btn ${setupMode === 'manual' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ flex: 1, padding: '10px', fontSize: '14px' }}
            onClick={() => setSetupMode('manual')}
          >
            手工录入
          </button>
        </div>
      </div>

      {/* 清算状态 */}
      {(() => {
        const snapshots = useStore.getState().daySnapshots;
        const settled = snapshots.filter(s => s.status === 'settled').sort((a, b) => b.date.localeCompare(a.date));
        if (settled.length > 0) {
          return (
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center', marginTop: '4px' }}>
              已清算至：{settled[0].date}
            </div>
          );
        }
        return null;
      })()}

      {/* 快速录入模式 */}
      {setupMode === 'quick' && <VoiceInput onMatchCreated={onStart} />}

      {/* 手动设置模式 */}
      {setupMode === 'manual' && (
        <>
          {/* 进行中的比赛提示 */}
          {currentMatch && currentMatch.status === 'ongoing' && (
            <div className="card" style={{ textAlign: 'center', backgroundColor: 'rgba(24,144,255,0.1)', border: '1px solid rgba(24,144,255,0.3)' }}>
              <p style={{ marginBottom: '12px', color: 'var(--text-primary)' }}>📌 你有进行中的比赛</p>
            </div>
          )}

          {/* 比赛日期 */}
          <div className="card">
            <div className="card-title">比赛日期</div>
            <input
              type="date"
              className="input"
              value={matchDate}
              onChange={(e) => setMatchDate(e.target.value)}
              max={getTodayDate()}
              style={{ width: '100%', fontSize: '16px' }}
            />
          </div>

          {/* 比赛类型 */}
          <div className="card">
            <div className="card-title">比赛类型</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className={`btn ${matchType === 'singles' ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1 }}
                onClick={() => { setMatchType('singles'); setTeam1Selected([]); setTeam2Selected([]); }}>单打</button>
              <button className={`btn ${matchType === 'doubles' ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1 }}
                onClick={() => { setMatchType('doubles'); setTeam1Selected([]); setTeam2Selected([]); }}>双打</button>
            </div>
          </div>
          {/* 队伍选择 */}
          {renderTeamSelect('team1', team1Selected, filtered1, search1, setSearch1)}
          {renderTeamSelect('team2', team2Selected, filtered2, search2, setSearch2)}

          {/* 局数设置 */}
          <div className="card" style={{ fontSize: '13px' }}>
            <div className="card-title" style={{ fontSize: '14px' }}>局数设置</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className={`btn ${matchMode === 'single' ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1 }}
                onClick={() => setMatchMode('single')}>单局赛</button>
              <button className={`btn ${matchMode === 'best-of-3' ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1 }}
                onClick={() => setMatchMode('best-of-3')}>三局两胜</button>
              <button className={`btn ${matchMode === 'best-of-5' ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1 }}
                onClick={() => setMatchMode('best-of-5')}>五局三胜</button>
            </div>
          </div>

          {/* 计分方式 */}
          <div className="card" style={{ fontSize: '13px' }}>
            <div className="card-title" style={{ fontSize: '14px' }}>计分方式</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className={`btn ${scoreMode === 'point-by-point' ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1 }}
                onClick={() => setScoreMode('point-by-point')}>🏸 逐球计分</button>
              <button className={`btn ${scoreMode === 'direct-input' ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1 }}
                onClick={() => setScoreMode('direct-input')}>✏️ 输入比分</button>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>
              {scoreMode === 'point-by-point' ? '每球点击 +1 按钮' : '直接输入每局最终比分（如 21:12）'}
            </div>
          </div>

          <button className="btn btn-primary btn-lg btn-full" onClick={handleStart} disabled={!canStart}>开始比赛</button>
          {players.length === 0 && (
            <div className="card" style={{ textAlign: 'center', marginTop: '12px', fontSize: '14px', color: 'var(--text-secondary)' }}>
              还没有球员？请先到「球员」页面添加
            </div>
          )}
        </>
      )}
    </div>
  );
};
