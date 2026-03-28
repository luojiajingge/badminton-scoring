import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.argv[2] || 'https://rqmcawmvxawsdvqddqgo.supabase.co';
const SUPABASE_KEY = process.argv[3] || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxbWNhd212eGF3c2R2cWRkcWdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MzM3NTYsImV4cCI6MjA5MDEwOTc1Nn0.e1PIJDucXobPTQbVeS2zXmM67IkuNTwoMZaDJThYKhA';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const INITIAL_RATING = 2000;

const K_TABLE = {
  0: { weakWin: 50, strongWin: 50 },
  1: { weakWin: 65, strongWin: 35 },
  2: { weakWin: 75, strongWin: 25 },
  3: { weakWin: 85, strongWin: 15 },
  4: { weakWin: 90, strongWin: 10 },
};

function calculateLevels(players) {
  const levels = new Map();
  const rated = players.filter(p => p.rating !== undefined && p.rating !== INITIAL_RATING);
  if (rated.length < 5) {
    rated.forEach(p => levels.set(p.id, 2));
    return levels;
  }
  const sorted = [...rated].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  const total = sorted.length;
  sorted.forEach((player, index) => {
    const pct = index / total;
    if (pct < 0.2) levels.set(player.id, 0);
    else if (pct < 0.4) levels.set(player.id, 1);
    else if (pct < 0.6) levels.set(player.id, 2);
    else if (pct < 0.8) levels.set(player.id, 3);
    else levels.set(player.id, 4);
  });
  return levels;
}

function calcRatingChanges(match, levels) {
  if (match.status !== 'completed' || !match.winner) return [];
  const allP = [...match.team1.players, ...match.team2.players];
  const isW = (p) => match.winner === 'team1' ? match.team1.players.some(t => t.id === p.id) : match.team2.players.some(t => t.id === p.id);
  let kValue;
  if (match.type === 'singles') {
    const p1 = match.team1.players[0], p2 = match.team2.players[0];
    const l1 = levels.get(p1.id), l2 = levels.get(p2.id);
    if (l1 == null || l2 == null || l1 < 0 || l2 < 0) { kValue = 50; }
    else {
      const diff = l1 - l2;
      const e = K_TABLE[Math.abs(diff)] || K_TABLE[4];
      kValue = diff >= 0 ? (match.winner === 'team1' ? e.weakWin : e.strongWin) : (match.winner === 'team1' ? e.strongWin : e.weakWin);
    }
  } else {
    const avg = (team) => { const ls = team.players.map(p => levels.get(p.id)).filter(l => l != null && l >= 0); return ls.length ? ls.reduce((s,l) => s+l, 0) / ls.length : NaN; };
    const a1 = avg(match.team1), a2 = avg(match.team2);
    if (isNaN(a1) || isNaN(a2)) { kValue = 50; }
    else {
      const diff = a1 - a2;
      const e = K_TABLE[Math.abs(diff)] || K_TABLE[4];
      kValue = diff >= 0 ? (match.winner === 'team1' ? e.weakWin : e.strongWin) : (match.winner === 'team1' ? e.strongWin : e.weakWin);
    }
  }
  return allP.map(p => {
    const before = p.rating ?? INITIAL_RATING;
    const won = isW(p);
    return { playerId: p.id, playerName: p.name, delta: won ? kValue : -kValue, ratingBefore: before, ratingAfter: Math.max(0, before + (won ? kValue : -kValue)) };
  });
}

async function main() {
  console.log('=== 历史积分重算工具 ===\n');
  console.log('正在获取数据...');
  const { data: dbP, error: pE } = await supabase.from('players').select('*').order('created_at', { ascending: true });
  if (pE) throw pE;
  const { data: dbM, error: mE } = await supabase.from('matches').select('*').order('created_at', { ascending: true });
  if (mE) throw mE;
  const completed = dbM.filter(m => m.status === 'completed');
  console.log(`球员: ${dbP.length} 人, 已完成比赛: ${completed.length} 场\n`);

  if (!completed.length) { console.log('没有比赛需要处理。'); return; }

  // 重置所有球员积分
  console.log('重置所有球员积分为 2000...');
  await supabase.from('players').update({ rating: INITIAL_RATING }).neq('id', '00000000-0000-0000-0000-000000000000');

  // 本地维护状态
  const pm = new Map();
  for (const p of dbP) pm.set(p.id, { ...p, rating: INITIAL_RATING });

  let fixed = 0, ok = 0;

  for (let i = 0; i < completed.length; i++) {
    const m = completed[i];
    const md = m.match_date || new Date(m.created_at).toISOString().split('T')[0];

    for (const p of [...m.team1.players, ...m.team2.players]) {
      if (!pm.has(p.id)) pm.set(p.id, { ...p, rating: INITIAL_RATING });
    }

    const levels = calculateLevels(Array.from(pm.values()));
    const nc = calcRatingChanges(m, levels);
    const oc = m.rating_changes || [];
    const changed = JSON.stringify(nc) !== JSON.stringify(oc);

    if (changed) {
      fixed++;
      const t1 = m.team1.players.map(p => p.name).join(' & ');
      const t2 = m.team2.players.map(p => p.name).join(' & ');
      const w = m.winner === 'team1' ? t1 : t2;
      console.log(`[${i+1}/${completed.length}] ${md} ${t1} vs ${t2} → ${w}`);
      for (const rc of nc) {
        const old = oc.find(o => o.playerId === rc.playerId);
        if (old && String(rc.delta) !== String(old.delta)) {
          console.log(`  ⚡ ${rc.playerName}: Δ ${old.delta}→${rc.delta} (${rc.ratingBefore}→${rc.ratingAfter})`);
        } else if (!old) {
          console.log(`  ⚡ ${rc.playerName}: Δ ${rc.delta} (${rc.ratingBefore}→${rc.ratingAfter})`);
        }
      }
    } else { ok++; }

    // 应用到本地
    for (const rc of nc) { const p = pm.get(rc.playerId); if (p) p.rating = rc.ratingAfter; }

    // 写入数据库
    await supabase.from('matches').update({ rating_changes: nc }).eq('id', m.id);
    for (const rc of nc) {
      await supabase.from('players').update({ rating: rc.ratingAfter }).eq('id', rc.playerId);
    }
  }

  // 清除清算快照
  console.log('\n清除所有清算快照...');
  await supabase.from('day_snapshots').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  // 最终排名
  console.log('\n=== 最终积分排名 ===');
  const sorted = Array.from(pm.values()).sort((a,b) => (b.rating??0) - (a.rating??0));
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    const r = p.rating ?? INITIAL_RATING;
    const d = r - INITIAL_RATING;
    console.log(`  ${(i+1+'').padStart(2)}. ${p.name.padEnd(6)} ${(''+r).padStart(5)} ${d>0?'+'+d:d<0?''+d:''}`);
  }

  console.log(`\n✅ 完成！修正 ${fixed} 场，无变化 ${ok} 场。清算快照已清除，请重新清算。`);
}

main().catch(e => { console.error('❌ 失败:', e); process.exit(1); });
