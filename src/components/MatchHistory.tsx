import React, { useState, useMemo } from 'react';
import { useStore } from '../store';
import { formatDate } from '../utils/helpers';
import type { Match } from '../types';

export const MatchHistory: React.FC = () => {
  const matches = useStore((state) => state.matches);
  const deleteMatch = useStore((state) => state.deleteMatch);
  const deleteMatches = useStore((state) => state.deleteMatches);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedMatchIds, setSelectedMatchIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [dateFilter, setDateFilter] = useState('');

  const completedMatches = useMemo(() =>
    matches.filter((m) => m.status === 'completed').sort((a, b) => b.createdAt - a.createdAt),
    [matches]
  );

  // 动态生成比赛编号
  const matchNumberMap = useMemo(() => {
    const map = new Map<string, string>();
    const dateCount = new Map<string, number>();
    // 按创建时间排序生成编号
    [...completedMatches].sort((a, b) => a.createdAt - b.createdAt).forEach(m => {
      const d = m.matchDate || '';
      const count = (dateCount.get(d) || 0) + 1;
      dateCount.set(d, count);
      map.set(m.id, d ? d + '_' + count : '');
    });
    return map;
  }, [completedMatches]);

  const filteredMatches = useMemo(() => {
    if (!dateFilter) return completedMatches;
    return completedMatches.filter(m => {
      const d = m.matchDate || '';
      return d.includes(dateFilter);
    });
  }, [completedMatches, dateFilter]);

  // 获取所有有比赛的日期
  const availableDates = useMemo(() => {
    const dates = new Set<string>();
    completedMatches.forEach(m => {
      if (m.matchDate) dates.add(m.matchDate);
    });
    return Array.from(dates).sort().reverse();
  }, [completedMatches]);

  const getTeamName = (players: { name: string }[]) => {
    return players.map((p) => p.name).join(' & ');
  };

  const getPlayedGames = (match: Match) => {
    const playedGames = match.games.filter((g) => g.winner || g.team1Score > 0 || g.team2Score > 0);
    if (playedGames.length > 0) return playedGames;
    return [{ team1Score: match.team1.gamesWon, team2Score: match.team2.gamesWon }];
  };

  const getPlayedGameScores = (match: Match) => {
    return getPlayedGames(match).map((g) => `${g.team1Score}:${g.team2Score}`).join(' / ');
  };

  const getResultBadge = (match: Match, team: 'team1' | 'team2') => {
    if (!match.winner) {
      return <span className="history-result-badge neutral">未结算</span>;
    }
    const won = match.winner === team;
    return (
      <span className={`history-result-badge ${won ? 'win' : 'lose'}`}>
        {won ? '✅ 胜' : '❌ 负'}
      </span>
    );
  };

  const handleDelete = async (id: string) => {
    if (actionLoading) return;
    if (confirm('确定要删除这场比赛记录吗？')) {
      setActionLoading(true);
      try {
        await deleteMatch(id);
        setSelectedMatch(null);
      } catch {
        // store already shows notification
      } finally {
        setActionLoading(false);
      }
    }
  };

  const toggleMatchSelection = (id: string) => {
    const newSelected = new Set(selectedMatchIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedMatchIds(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedMatchIds.size === filteredMatches.length) {
      setSelectedMatchIds(new Set());
    } else {
      setSelectedMatchIds(new Set(filteredMatches.map(m => m.id)));
    }
  };

  const handleBatchDelete = () => {
    setShowDeleteConfirm(true);
  };

  const confirmBatchDelete = async () => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      await deleteMatches(Array.from(selectedMatchIds));
      setSelectedMatchIds(new Set());
      setShowDeleteConfirm(false);
      setIsMultiSelectMode(false);
    } catch {
    } finally {
      setActionLoading(false);
    }
  };

  const exitMultiSelectMode = () => {
    setIsMultiSelectMode(false);
    setSelectedMatchIds(new Set());
  };

  if (completedMatches.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📋</div>
        <div>暂无历史记录</div>
        <div style={{ fontSize: '12px', marginTop: '8px' }}>完成比赛后将显示在这里</div>
      </div>
    );
  }

  return (
    <div className="fade-in">
      {/* Batch Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">确认批量删除</div>
            <div className="modal-body">
              <p>确定要删除选中的 {selectedMatchIds.size} 场比赛记录吗？</p>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                相关球员的积分将被回退（如果有积分变动记录）
              </p>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowDeleteConfirm(false)}>取消</button>
              <button className="btn btn-danger" onClick={confirmBatchDelete} disabled={actionLoading}>
                {actionLoading ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Multi-select toolbar */}
      {isMultiSelectMode && (
        <div className="card" style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button className="btn btn-secondary btn-sm" onClick={handleSelectAll}>
                {selectedMatchIds.size === filteredMatches.length ? '取消全选' : '全选'}
              </button>
              <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                已选 {selectedMatchIds.size} 项
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-danger btn-sm" onClick={handleBatchDelete} disabled={selectedMatchIds.size === 0 || actionLoading}>
                批量删除
              </button>
              <button className="btn btn-secondary btn-sm" onClick={exitMultiSelectMode}>取消</button>
            </div>
          </div>
        </div>
      )}

      {selectedMatch ? (
        <div className="card">
          <div className="card-title">比赛详情</div>
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              比赛日期：{selectedMatch.matchDate || '未设置'}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              记录时间：{formatDate(selectedMatch.createdAt)}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {selectedMatch.type === 'singles' ? '单打' : '双打'} |
              {selectedMatch.mode === 'single' ? '单局赛' : selectedMatch.mode === 'best-of-3' ? '三局两胜' : '五局三胜'}
            </div>
          </div>

          <div style={{ textAlign: 'center', marginBottom: '16px' }}>
            <div style={{ fontSize: '18px', fontWeight: '600' }}>
              {getTeamName(selectedMatch.team1.players)} vs {getTeamName(selectedMatch.team2.players)}
            </div>
            <div style={{ fontSize: '26px', fontWeight: '700', margin: '8px 0', lineHeight: 1.25 }}>
              {getPlayedGameScores(selectedMatch)}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
              局分：{selectedMatch.team1.gamesWon} : {selectedMatch.team2.gamesWon}
            </div>
            <div style={{ color: 'var(--success-color)' }}>
              🏆 获胜: {getTeamName(selectedMatch.winner === 'team1' ? selectedMatch.team1.players : selectedMatch.team2.players)}
            </div>
          </div>

          <div className="card-title">各局比分</div>
          {selectedMatch.games.filter(g => g.winner).map((game, index) => (
            <div key={index} style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '8px', backgroundColor: 'var(--bg-color)', borderRadius: '4px', marginBottom: '8px'
            }}>
              <span>第{index + 1}局</span>
              <span style={{ fontWeight: '600' }}>{game.team1Score} - {game.team2Score}</span>
            </div>
          ))}

          {selectedMatch.ratingChanges && selectedMatch.ratingChanges.length > 0 && (
            <>
              <div className="card-title">积分变动</div>
              {selectedMatch.ratingChanges.map((rc, index) => (
                <div key={index} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px', backgroundColor: 'var(--bg-color)', borderRadius: '4px', marginBottom: '8px'
                }}>
                  <span>
                    {rc.playerName}
                    <span style={{
                      fontSize: '11px', marginLeft: '6px', padding: '1px 6px', borderRadius: '3px',
                      backgroundColor: rc.levelBefore === 0 ? '#e74c3c'
                        : rc.levelBefore === 1 ? '#e67e22'
                        : rc.levelBefore === 2 ? '#f1c40f'
                        : rc.levelBefore === 3 ? '#3498db'
                        : rc.levelBefore === 4 ? '#95a5a6'
                        : '#bdc3c7',
                      color: rc.levelBefore === 2 ? '#333' : '#fff',
                    }}>
                      {rc.levelBefore != null && rc.levelBefore >= 0 ? `L${rc.levelBefore}` : '未定级'}
                    </span>
                  </span>
                  <span style={{
                    fontWeight: '600',
                    color: rc.delta >= 0 ? 'var(--success-color)' : 'var(--danger-color)'
                  }}>
                    {rc.delta >= 0 ? '+' : ''}{rc.delta} ({rc.ratingBefore} → {rc.ratingAfter})
                  </span>
                </div>
              ))}
            </>
          )}

          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button className="btn btn-secondary btn-full" onClick={() => setSelectedMatch(null)}>返回</button>
            <button className="btn btn-danger btn-full" onClick={() => handleDelete(selectedMatch.id)} disabled={actionLoading}>
              {actionLoading ? '删除中...' : '删除'}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* 日期筛选 */}
          {availableDates.length > 1 && (
            <div style={{ marginBottom: '12px' }}>
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                style={{
                  width: '100%', padding: '10px 12px', fontSize: '14px',
                  border: '1px solid var(--border-color)', borderRadius: '8px',
                  backgroundColor: 'var(--card-bg)', color: 'var(--text-primary)',
                  outline: 'none',
                }}
              />
              {dateFilter && (
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  marginTop: '6px', fontSize: '12px', color: 'var(--text-secondary)'
                }}>
                  <span>筛选到 {filteredMatches.length} 条记录</span>
                  <button
                    onClick={() => setDateFilter('')}
                    style={{
                      background: 'none', border: 'none', color: 'var(--primary-color)',
                      cursor: 'pointer', fontSize: '12px', padding: '2px 6px'
                    }}
                  >
                    清除筛选
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Multi-select toggle button */}
          {!isMultiSelectMode && filteredMatches.length > 0 && (
            <div style={{ marginBottom: '12px' }}>
              <button className="btn btn-secondary btn-full" onClick={() => setIsMultiSelectMode(true)}>
                📋 进入多选模式
              </button>
            </div>
          )}

          {filteredMatches.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🔍</div>
              <div>该日期没有比赛记录</div>
              <button
                className="btn btn-secondary"
                onClick={() => setDateFilter('')}
                style={{ marginTop: '8px' }}
              >
                清除筛选
              </button>
            </div>
          ) : (
            filteredMatches.map((match) => (
              <div
                key={match.id}
                className="history-item"
                onClick={() => {
                  if (!isMultiSelectMode) {
                    setSelectedMatch(match);
                  } else {
                    toggleMatchSelection(match.id);
                  }
                }}
                style={{
                  cursor: 'pointer',
                  border: isMultiSelectMode && selectedMatchIds.has(match.id) ? '2px solid var(--primary-color)' : undefined,
                  backgroundColor: isMultiSelectMode && selectedMatchIds.has(match.id) ? 'var(--primary-light)' : undefined
                }}
              >
                <div className="history-header" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {isMultiSelectMode && (
                    <input
                      type="checkbox"
                      checked={selectedMatchIds.has(match.id)}
                      onChange={() => toggleMatchSelection(match.id)}
                      onClick={(e) => e.stopPropagation()}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                  )}
                  <span className="history-date">{matchNumberMap.get(match.id) || match.matchDate || formatDate(match.createdAt)}</span>
                  <span className="history-type">{match.type === 'singles' ? '单打' : '双打'}</span>
                </div>
                <div className="history-teams">
                  <div className="history-team">
                    <div className="history-team-name">
                      {getTeamName(match.team1.players)}
                      {getResultBadge(match, 'team1')}
                    </div>
                  </div>
                  <div className="history-vs">VS</div>
                  <div className="history-team">
                    <div className="history-team-name">
                      {getTeamName(match.team2.players)}
                      {getResultBadge(match, 'team2')}
                    </div>
                  </div>
                </div>
                <div className="history-game-score">
                  <span>比分：</span>
                  {getPlayedGames(match).map((game, index) => (
                    <React.Fragment key={`${match.id}-game-${index}`}>
                      {index > 0 && <span className="history-game-score-sep"> / </span>}
                      <span className="history-game-score-team1">{game.team1Score}</span>
                      <span className="history-game-score-colon">:</span>
                      <span className="history-game-score-team2">{game.team2Score}</span>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
};
