import React, { useState } from 'react';
import { useStore } from '../store';
import { validateGameScore } from '../utils/scoreValidator';
import { splitTeamNames } from '../utils/nameSplitter';
import { calculateRatingChanges, applyRatingChanges, calculateLevels } from '../utils/rating';
import { nameToPinyinKey, pinyinMatch } from '../utils/pinyin';
import type { Player, Match } from '../types';

// 获取今天的日期字符串
const getTodayDate = () => new Date().toISOString().split('T')[0];

interface VoiceInputProps {
  onMatchCreated: () => void;
}

function parseInputText(text: string): {
  team1Names: string[];
  team2Names: string[];
  scores: [number, number][];
  error?: string;
} | null {
  let cleaned = text.replace(/\s+/g, '').replace(/，/g, '、').replace(/,/g, '、');
  const scoreExtract = cleaned.match(/(\d{1,2})[：:比](\d{1,2})\s*$/);
  if (!scoreExtract) return null;
  const s1 = parseInt(scoreExtract[1]);
  const s2 = parseInt(scoreExtract[2]);
  const sv = validateGameScore(s1, s2);
  if (!sv.valid) return { team1Names: [], team2Names: [], scores: [[0, 0]], error: sv.error };
  let playerPart = cleaned.slice(0, scoreExtract.index!);
  playerPart = playerPart.replace(/比分\s*$/, '');
  const sepPattern = /[对]|vs|VS|对战|PK|pk/;
  const parts = playerPart.split(sepPattern).filter(s => s.trim());
  if (parts.length < 2) return null;
  const team1Names = parts[0].split(/[、]/).map(s => s.trim()).filter(Boolean);
  const team2Names = parts[1].split(/[、]/).map(s => s.trim()).filter(Boolean);
  if (team1Names.length === 0 || team2Names.length === 0) return null;
  return { team1Names, team2Names, scores: [[s1, s2]] };
}
function findPlayerCandidates(inputName: string, players: Player[]) {
  const q = inputName.toLowerCase().replace(/\s+/g, '');
  const exact = players.find(p => p.name === inputName);
  if (exact) return { exact, candidates: [] };
  const candidates = players.filter(p => pinyinMatch(q, p.name)).slice(0, 3);
  return { exact: null, candidates };
}

interface PendingPlayer {
  teamIndex: 1 | 2;
  nameIndex: number;
  inputName: string;
  candidates?: Player[];
}

export const VoiceInput: React.FC<VoiceInputProps> = ({ onMatchCreated }) => {
  const [inputText, setInputText] = useState('');
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [processing, setProcessing] = useState(false);
  const [matchDate, setMatchDate] = useState<string>(getTodayDate());
  const [pendingConfirm, setPendingConfirm] = useState<{
    team1Names: string[];
    team2Names: string[];
    scores: [number, number][];
    team1: Player[];
    team2: Player[];
    unmatched: PendingPlayer[];
  } | null>(null);

  const players = useStore((state) => state.players);
  const addPlayer = useStore((state) => state.addPlayer);

  const finalizeMatch = async (
    scores: [number, number][],
    team1: Player[], team2: Player[],
  ) => {
    try {
      const totalPlayers = team1.length + team2.length;
      const matchType = totalPlayers === 4 ? 'doubles' as const : totalPlayers === 2 ? 'singles' as const : null;

      if (!matchType) {
        setResult({ ok: false, text: `选手数量不对（共${totalPlayers}人），需要2人或4人` });
        setProcessing(false);
        return;
      }

      const [s1, s2] = scores[0];
      const winner: 'team1' | 'team2' = s1 > s2 ? 'team1' : 'team2';
      const match: Match = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 9),
        type: matchType,
        mode: 'single' as const,
        scoreMode: 'direct-input' as const,
        team1: { players: team1, score: 0, gamesWon: winner === 'team1' ? 1 : 0 },
        team2: { players: team2, score: 0, gamesWon: winner === 'team2' ? 1 : 0 },
        currentGame: 1,
        games: [{ team1Score: s1, team2Score: s2, winner }],
        status: 'completed' as const,
        winner,
        createdAt: Date.now(),
        completedAt: Date.now(),
        scoreHistory: [],
        matchDate,
      };

      // 计算积分
      const allPlayers = [...team1, ...team2];
      const currentPlayers = useStore.getState().players;
      const levels = calculateLevels([...currentPlayers, ...allPlayers]);
      const ratingChanges = calculateRatingChanges(match, allPlayers, levels);
      const finalMatch = { ...match, ratingChanges };

      // 更新球员积分
      const updatedPlayers = applyRatingChanges(currentPlayers, ratingChanges);
      useStore.setState({ players: updatedPlayers });

      // 保存
      const { db } = await import('../services/supabase');
      for (const rc of ratingChanges) {
        await db.updatePlayerRating(rc.playerId, rc.ratingAfter);
      }
      await db.addMatch(finalMatch);

      useStore.setState((state) => ({
        matches: [finalMatch, ...state.matches],
        currentMatch: null,
      }));

      const t1Names = team1.map((p) => p.name).join('、');
      const t2Names = team2.map((p) => p.name).join('、');
      let ratingText = '';
      if (ratingChanges.length > 0) {
        ratingText = '\n\n📊 积分变动：\n' + ratingChanges.map(rc =>
          `${rc.playerName}: ${rc.ratingBefore} → ${rc.ratingAfter} (${rc.delta >= 0 ? '+' : ''}${rc.delta})`
        ).join('\n');
      }
      setResult({ ok: true, text: `✅ 已记录：${matchType === 'doubles' ? '双打' : '单打'}\n${t1Names} vs ${t2Names}\n比分 ${s1}:${s2}${ratingText}` });
      setInputText('');    } catch (err) {
      console.error('finalizeMatch error:', err);
      setResult({ ok: false, text: '❌ 提交失败：' + (err instanceof Error ? err.message : String(err)) });
    } finally {
      setPendingConfirm(null);
      setProcessing(false);
    }
  };

  const handleSubmit = async () => {
    if (!inputText.trim() || processing) return;
    
    // 检查未清算日期
    const unsettled = useStore.getState().getUnsettledDates();
    const today = new Date().toISOString().slice(0, 10);
    const selectedDate = matchDate || today;
    const earlierUnsettled = unsettled.filter(d => d < selectedDate);
    if (earlierUnsettled.length > 0) {
      setResult({ ok: false, text: `⚠️ ${earlierUnsettled[0]} 等日期有比赛未清算，请先清算后再录入新比赛。` });
      return;
    }
    
    setProcessing(true);
    setResult(null);

    try {
      const parsed = parseInputText(inputText);
      if (!parsed) {
        setResult({ ok: false, text: `无法解析："${inputText}"\n\n请输入格式如：\n李静、马腾 对 王鹏、万蕊清 比分21:13` });
        setProcessing(false);
        return;
      }
      if (parsed.error) {
        setResult({ ok: false, text: '❌ 比分不合法：' + parsed.error });
        setProcessing(false);
        return;
      }

      // 智能拆分连写名字
      const split1 = splitTeamNames(parsed.team1Names, players);
      const split2 = splitTeamNames(parsed.team2Names, players);

      // 匹配选手
      const team1: Player[] = [];
      const team2: Player[] = [];
      const unmatched: PendingPlayer[] = [];

      for (let i = 0; i < split1.length; i++) {
        const name = split1[i];
        const { exact, candidates } = findPlayerCandidates(name, players);
        if (exact) { team1.push(exact); }
        else if (candidates.length === 1) { team1.push(candidates[0]); }
        else { unmatched.push({ teamIndex: 1, nameIndex: i, inputName: name, candidates }); }
      }

      for (let i = 0; i < split2.length; i++) {
        const name = split2[i];
        const { exact, candidates } = findPlayerCandidates(name, players);
        if (exact) { team2.push(exact); }
        else if (candidates.length === 1) { team2.push(candidates[0]); }
        else { unmatched.push({ teamIndex: 2, nameIndex: i, inputName: name, candidates }); }
      }

      if (unmatched.length === 0) {
        await finalizeMatch(parsed.scores, team1, team2);
      } else {
        setPendingConfirm({
          team1Names: parsed.team1Names,
          team2Names: parsed.team2Names,
          scores: parsed.scores,
          team1, team2, unmatched,
        });
        setProcessing(false);
      }
    } catch (err) {
      console.error('handleSubmit error:', err);
      setResult({ ok: false, text: '❌ 提交失败：' + (err instanceof Error ? err.message : String(err)) });
      setProcessing(false);
    }
  };

  const handleSelectCandidate = async (idx: number, playerId: string) => {
    if (!pendingConfirm) return;
    const player = players.find(p => p.id === playerId)!;
    const newUnmatched = [...pendingConfirm.unmatched];
    const item = newUnmatched[idx];
    if (item.teamIndex === 1) pendingConfirm.team1.push(player);
    else pendingConfirm.team2.push(player);
    newUnmatched.splice(idx, 1);

    if (newUnmatched.length === 0) {
      setPendingConfirm(null);
      setProcessing(true);
      await finalizeMatch(pendingConfirm.scores, pendingConfirm.team1, pendingConfirm.team2);
    } else {
      setPendingConfirm({ ...pendingConfirm, unmatched: newUnmatched, team1: [...pendingConfirm.team1], team2: [...pendingConfirm.team2] });
    }
  };

  const handleConfirmAdd = async (idx: number) => {
    if (!pendingConfirm) return;
    const item = pendingConfirm.unmatched[idx];
    const newUnmatched = [...pendingConfirm.unmatched];
    newUnmatched.splice(idx, 1);

    const newPlayer = await addPlayer(item.inputName);
    if (item.teamIndex === 1) pendingConfirm.team1.push(newPlayer);
    else pendingConfirm.team2.push(newPlayer);

    if (newUnmatched.length === 0) {
      setPendingConfirm(null);
      setProcessing(true);
      await finalizeMatch(pendingConfirm.scores, pendingConfirm.team1, pendingConfirm.team2);
    } else {
      setPendingConfirm({ ...pendingConfirm, unmatched: newUnmatched, team1: [...pendingConfirm.team1], team2: [...pendingConfirm.team2] });
    }
  };

  return (
    <div className="card">
      <div className="card-title">📝 快速录入比赛结果</div>
      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
        输入格式：李静马腾 对 王鹏万蕊清 比分21:19
      </p>

      {/* 日期选择器 */}
      <div style={{ marginBottom: '10px' }}>
        <input
          type="date"
          className="input"
          value={matchDate}
          onChange={(e) => setMatchDate(e.target.value)}
          max={getTodayDate()}
          style={{ width: '100%', fontSize: '14px' }}
        />
      </div>

      {!pendingConfirm ? (
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            className="input"
            placeholder="例：张三李四 对 王五赵六 比分21:13"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            disabled={processing}
            style={{ flex: 1, fontSize: '14px' }}
          />
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={!inputText.trim() || processing}
            style={{ padding: '8px 16px', whiteSpace: 'nowrap' }}
          >
            {processing ? '...' : '提交'}
          </button>
        </div>
      ) : (
        <div style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', padding: '12px' }}>
          <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '10px' }}>
            以下球员需要确认：
          </div>
          {pendingConfirm.unmatched.map((item, idx) => (
            <div key={idx} style={{ marginBottom: '12px', padding: '10px', backgroundColor: 'var(--card-bg)', borderRadius: '8px' }}>
              <div style={{ fontSize: '14px', marginBottom: '6px' }}>
                「{item.inputName}」
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>（队伍{item.teamIndex}）</span>
              </div>
              {item.candidates && item.candidates.length > 0 && (
                <div style={{ marginBottom: '8px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>是否是以下球员？</div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {item.candidates.map(c => (
                      <button key={c.id} className="btn btn-secondary" onClick={() => handleSelectCandidate(idx, c.id)}
                        style={{ padding: '4px 12px', fontSize: '14px' }}>{c.name}</button>
                    ))}
                  </div>
                </div>
              )}
              <button className="btn btn-primary" onClick={() => handleConfirmAdd(idx)}
                style={{ padding: '4px 12px', fontSize: '13px' }}>+ 新增「{item.inputName}」</button>
            </div>
          ))}
          <button className="btn btn-secondary btn-full" onClick={() => { setPendingConfirm(null); setResult(null); }}
            style={{ fontSize: '13px' }}>取消</button>
        </div>
      )}

      {result && (
        <div style={{
          marginTop: '10px', padding: '12px', borderRadius: '8px', fontSize: '14px',
          backgroundColor: result.ok ? 'rgba(82,196,26,0.1)' : 'rgba(245,34,45,0.1)',
          whiteSpace: 'pre-line',
        }}>
          <span>{result.text}</span>
        </div>
      )}
    </div>
  );
};
