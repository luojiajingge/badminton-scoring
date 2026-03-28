import React, { useState } from 'react';
import type { Match } from '../types';
import { validateGameScore } from '../utils/scoreValidator';
import { getGamesNeeded, getModeLabel, getScoreModeLabel } from '../utils/helpers';

interface ScoreBoardProps {
  match: Match;
  onScore: (team: 'team1' | 'team2') => void;
  onSetGameScore: (gameIndex: number, team1Score: number, team2Score: number) => void;
  onUndo: () => void;
}

export const ScoreBoard: React.FC<ScoreBoardProps> = ({ match, onScore, onSetGameScore, onUndo }) => {
  const currentGame = match.games[match.currentGame - 1] || { team1Score: 0, team2Score: 0 };
  const gamesNeeded = getGamesNeeded(match.mode);

  // 直接输入比分的状态
  const [inputTeam1, setInputTeam1] = useState('');
  const [inputTeam2, setInputTeam2] = useState('');
  const [inputGameIndex, setInputGameIndex] = useState(0);
  const [scoreError, setScoreError] = useState(''); // 0 = 当前局

  const getTeamName = (players: { name: string }[]) => players.map((p) => p.name).join(' & ');

  const handleDirectSubmit = () => {
    const s1 = parseInt(inputTeam1, 10);
    const s2 = parseInt(inputTeam2, 10);
    if (isNaN(s1) || isNaN(s2)) { setScoreError('请输入有效比分'); return; }
    const validation = validateGameScore(s1, s2);
    if (!validation.valid) { setScoreError(validation.error || '比分不合法'); return; }
    setScoreError('');
    onSetGameScore(inputGameIndex, s1, s2);
    setInputTeam1('');
    setInputTeam2('');
  };

  const handleQuickInput = (value: string) => {
    const parts = value.split(/[:：]/);
    if (parts.length === 2) {
      const s1 = parseInt(parts[0], 10);
      const s2 = parseInt(parts[1], 10);
      if (!isNaN(s1) && !isNaN(s2)) {
        const validation = validateGameScore(s1, s2);
        if (validation.valid) {
          setScoreError('');
          onSetGameScore(inputGameIndex, s1, s2);
          setInputTeam1('');
          setInputTeam2('');
        } else {
          setScoreError(validation.error || '比分不合法');
        }
      }
    }
  };

  return (
    <div className="fade-in">
      {/* 模式标签 */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '12px' }}>
        <span style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '12px', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
          {getModeLabel(match.mode)}
        </span>
        <span style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '12px', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
          {getScoreModeLabel(match.scoreMode)}
        </span>
      </div>

      {/* 局分显示 */}
      <div className="game-scores">
        {match.games.map((game, index) => (
          <div key={index}
            className={`game-score ${index === match.currentGame - 1 ? 'active' : ''} ${game.winner ? 'winner' : ''}`}>
            <div className="game-score-label">第{index + 1}局</div>
            <div className="game-score-value">
              {game.team1Score} - {game.team2Score}
            </div>
          </div>
        ))}
      </div>

      {/* 总比分 */}
      <div className="card">
        <div style={{ textAlign: 'center', marginBottom: '16px' }}>
          <span className="score-games">
            总比分: {match.team1.gamesWon} - {match.team2.gamesWon} (先到{gamesNeeded}局获胜)
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div className="score-display">
            <div className="score-team-name">{getTeamName(match.team1.players)}</div>
            <div className="score-number">{currentGame.team1Score}</div>
            <div className="score-games">胜 {match.team1.gamesWon} 局</div>
          </div>
          <div className="score-display">
            <div className="score-team-name">{getTeamName(match.team2.players)}</div>
            <div className="score-number">{currentGame.team2Score}</div>
            <div className="score-games">胜 {match.team2.gamesWon} 局</div>
          </div>
        </div>
      </div>

      {match.status === 'ongoing' && (
        <>
          {/* 逐球计分模式 */}
          {match.scoreMode === 'point-by-point' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <button className="big-btn big-btn-team1" onClick={() => onScore('team1')}>+1 分</button>
              <button className="big-btn big-btn-team2" onClick={() => onScore('team2')}>+1 分</button>
            </div>
          )}

          {/* 直接输入比分模式 */}
          {match.scoreMode === 'direct-input' && (
            <div className="card" style={{ marginBottom: '16px' }}>
              <div className="card-title">输入第{inputGameIndex + 1}局比分</div>

              {/* 局选择（非单局赛时显示） */}
              {match.mode !== 'single' && match.games.length > 1 && (
                <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
                  {match.games.map((_, i) => (
                    <button key={i}
                      className={`btn ${inputGameIndex === i ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ flex: 'none', padding: '4px 12px', fontSize: '13px' }}
                      onClick={() => { setInputGameIndex(i); setInputTeam1(''); setInputTeam2(''); }}>
                      第{i + 1}局{match.games[i].winner ? ' ✓' : ''}
                    </button>
                  ))}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '8px', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    {getTeamName(match.team1.players)}
                  </div>
                  <input type="number" className="input" style={{ textAlign: 'center', fontSize: '24px', padding: '8px' }}
                    placeholder="0" min="0" value={inputTeam1}
                    onChange={(e) => setInputTeam1(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleDirectSubmit();
                      if (e.key === ':') {
                        e.preventDefault();
                        const nextInput = (e.target as HTMLInputElement).parentElement?.nextElementSibling?.querySelector('input');
                        nextInput?.focus();
                      }
                    }} />
                </div>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--text-secondary)' }}>:</div>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    {getTeamName(match.team2.players)}
                  </div>
                  <input type="number" className="input" style={{ textAlign: 'center', fontSize: '24px', padding: '8px' }}
                    placeholder="0" min="0" value={inputTeam2}
                    onChange={(e) => setInputTeam2(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleDirectSubmit();
                    }} />
                </div>
              </div>

              {scoreError && (
                <div style={{ fontSize: '12px', color: 'var(--danger-color, #f5222d)', marginTop: '8px', textAlign: 'center' }}>
                  ⚠️ {scoreError}
                </div>
              )}
              <button className="btn btn-primary btn-full" style={{ marginTop: '12px' }}
                onClick={handleDirectSubmit}
                disabled={inputTeam1 === '' || inputTeam2 === ''}>
                确认本局比分
              </button>

              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '6px', textAlign: 'center' }}>
                输入每方得分后确认，系统自动判定本局胜负
              </div>
            </div>
          )}

          {/* 撤销（仅逐球模式） */}
          {match.scoreMode === 'point-by-point' && match.scoreHistory.length > 0 && (
            <button className="btn btn-secondary btn-full" onClick={onUndo}>↩ 撤销上一次计分</button>
          )}
        </>
      )}

      {/* 比赛结束 */}
      {match.status === 'completed' && (
        <>
          <div className="card winner-animation" style={{ textAlign: 'center', backgroundColor: 'var(--success-color)', color: 'white' }}>
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>🎉 比赛结束 🎉</div>
            <div style={{ fontSize: '18px' }}>
              获胜者: {getTeamName(match.winner === 'team1' ? match.team1.players : match.team2.players)}
            </div>
          </div>
          {match.ratingChanges && match.ratingChanges.length > 0 && (
            <div className="card" style={{ marginTop: '12px' }}>
              <div className="card-title">积分变动</div>
              {match.ratingChanges.map((rc, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '14px' }}>{rc.playerName}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{rc.ratingBefore}</span>
                    <span style={{ color: rc.delta >= 0 ? 'var(--success-color, #52c41a)' : 'var(--danger-color, #f5222d)', fontWeight: '600' }}>
                      {rc.delta >= 0 ? '+' : ''}{rc.delta}
                    </span>
                    <span style={{ fontWeight: '600' }}>{rc.ratingAfter}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};
