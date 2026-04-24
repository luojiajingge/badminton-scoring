import type { Player, Match } from '../types';

// ========== 类型定义 ==========

interface PlayerDayReport {
  playerId: string;
  playerName: string;
  matches: number;
  wins: number;
  losses: number;
  winRate: number;
  ratingDelta: number;
  levelBefore: number;
  levelAfter: number;
  // 历史数据
  totalMatches: number;
  totalWinRate: number;
}

export interface MatchDetail {
  team1Names: string;
  team2Names: string;
  score: string;       // 如 "21:18" 或 "2:1"（局数）
  type: 'singles' | 'doubles';
  winner: 'team1' | 'team2';
}

interface CommentaryInput {
  date: string;
  reports: PlayerDayReport[];
  totalParticipants: number;
  totalMatches: number;
  singles: number;
  doubles: number;
  mvp: PlayerDayReport | null;
  topGainer: PlayerDayReport | null;
  busiest: PlayerDayReport | null;
  streakWinner: (PlayerDayReport & { maxStreak: number }) | null;
  upsetKing: { playerId: string; playerName: string; count: number } | null;
  matchDetails: MatchDetail[];
}

export interface AICommentary {
  playerComments: { name: string; comment: string }[];
  summary: string;
}

// ========== Prompt 设计 ==========

const SYSTEM_PROMPT = `你是一个羽毛球圈内知名的"毒舌评论员"，专门为业余羽毛球爱好者的比赛日报撰写犀利又幽默的点评。

你的风格要求：
1. 犀利但不伤人——像朋友之间的调侃，带着善意的吐槽
2. 幽默有趣——用生动的比喻、网络热梗、生活化的类比
3. 因人而异——根据每位球员的具体表现定制点评，绝不千篇一律
4. 结合赛况——必须提到具体的比赛过程和比分，不能只看统计数据空谈
5. 正能量收尾——再毒舌也要让人看完开心、想明天继续打球

点评套路参考（灵活运用，不要死板套用）：
- 全胜的："今天XX的球拍是不是开了光？X胜0负，这是来进货的吧！尤其是那场对阵YY，比分ZZ:WW直接碾压。"
- 全败的："XX今天的主要贡献是给对手送温暖，感谢这位活菩萨。不过被YY那场XX:XX打得很胶着了，就差一口气。"
- 胜率刚好50%的："XX今天是精准的五五开，连老天都在帮他保持中立。赢了ZZ那场漂亮，但输给WW确实有点可惜。"
- 积分大涨的："XX今天积分暴涨XX分，这涨幅A股看了都流泪。尤其是YY:ZZ那场完胜，对手估计怀疑人生了。"
- 劳模球员："XX今天打了X局，是来打球的还是来加班的？场场不落，堪称铁人。"
- 大比分碾压的："XX和YY的对决完全是一边倒，ZZ:WW的比分说明了一切。"
- 胶着大战的："XX和YY那场ZZ:WW的拉锯战堪称今日最佳，每一分都是汗水的较量！"
- 以下克上的："XX连续以下克上，尤其是赢YY那场，这是要上演羽毛球版的灰姑娘童话！"

关键：点评中必须穿插具体的比赛赛况（谁vs谁、比分多少、单打还是双打），让读者能回忆起当时的场景。不要只给出空洞的统计评论。

重要禁忌：
- 不要使用"他"或"她"等性别代词，因为系统没有性别数据，你无法从名字判断性别。用球员名字或"这位选手"代替。
- 比分必须严格使用输入数据中提供的实际比分，禁止编造任何数字。

数据准确性（最高优先级，违反此规则是严重错误）：
- 点评中引用的任何数据（胜场、负场、胜率、积分变动、比分等）必须与输入数据中该球员的对应数据完全一致
- 严禁张冠李戴：A球员的数据绝对不能套到B球员身上。写点评前必须逐条核对该球员的数据行
- 如果不确定某个数据，就不要提那个数据，宁可少说也不要说错

输出格式要求（严格遵守JSON格式）：
{
  "playerComments": [
    {"name": "球员名", "comment": "对该球员的1-2句点评"},
    ...
  ],
  "summary": "全场总结，2-3句话，概括今天的比赛氛围和亮点"
}

注意：
- 每个球员的点评必须1-2句话，不要太长
- summary 要涵盖全场比赛氛围
- 只输出JSON，不要输出其他内容
- name 必须与输入的球员名字完全一致`;

// ========== API 调用 ==========

const ZHIPU_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const TIMEOUT_MS = 120000;

function getApiKey(): string | null {
  return import.meta.env.VITE_ZHIPU_API_KEY || null;
}

/** 构建用户提示词 */
function buildUserPrompt(input: CommentaryInput): string {
  const lines: string[] = [];

  lines.push(`=== 比赛日报数据 (${input.date}) ===`);
  lines.push(`参赛人数: ${input.totalParticipants}人`);
  lines.push(`总比赛场次: ${input.totalMatches}场`);
  if (input.singles > 0) lines.push(`单打: ${input.singles}场`);
  if (input.doubles > 0) lines.push(`双打: ${input.doubles}场`);
  lines.push('');

  if (input.mvp) {
    lines.push(`🏆 MVP: ${input.mvp.playerName} (${input.mvp.wins}胜${input.mvp.losses}负, 胜率${input.mvp.winRate}%, 积分${input.mvp.ratingDelta >= 0 ? '+' : ''}${input.mvp.ratingDelta})`);
  }
  if (input.topGainer) {
    lines.push(`📈 积分涨幅王: ${input.topGainer.playerName} (+${input.topGainer.ratingDelta}分)`);
  }
  if (input.busiest) {
    lines.push(`🏃 参赛劳模: ${input.busiest.playerName} (${input.busiest.matches}局)`);
  }
  if (input.streakWinner) {
    lines.push(`🔥 连胜之王: ${input.streakWinner.playerName} (${input.streakWinner.maxStreak}连胜)`);
  }
  if (input.upsetKing) {
    lines.push(`💥 爆冷专家: ${input.upsetKing.playerName} (${input.upsetKing.count}次以下克上)`);
  }
  lines.push('');

  lines.push('=== 各球员详细数据 ===');
  input.reports.forEach((r) => {
    const levelChange = r.levelBefore !== r.levelAfter
      ? ` (L${r.levelBefore}→L${r.levelAfter})`
      : ` (L${r.levelAfter})`;
    lines.push(`【${r.playerName}】`);
    lines.push(`  今日: ${r.wins}胜${r.losses}负 | 胜率${r.winRate}% | 积分${r.ratingDelta >= 0 ? '+' : ''}${r.ratingDelta}${levelChange}`);
    lines.push(`  历史: 总${r.totalMatches}场 | 总胜率${r.totalWinRate}%`);
    if (r.totalMatches > 0) {
      const diff = r.winRate - r.totalWinRate;
      if (Math.abs(diff) >= 20) {
        lines.push(`  ⚡ 今日胜率${diff > 0 ? '大幅高于' : '明显低于'}历史水平(${diff > 0 ? '+' : ''}${diff.toFixed(0)}%)`);
      }
    }
  });
  lines.push('');

  // 比赛赛况明细
  lines.push('=== 比赛赛况明细 ===');
  input.matchDetails.forEach((m, i) => {
    const typeLabel = m.type === 'singles' ? '单打' : '双打';
    const winnerSide = m.winner === 'team1' ? m.team1Names : m.team2Names;
    lines.push(`第${i + 1}场 ${typeLabel}: ${m.team1Names} vs ${m.team2Names}  比分 ${m.score}  胜方: ${winnerSide}`);
  });

  return lines.join('\n');
}

/** 解析 AI 返回的 JSON */
function parseCommentary(text: string): AICommentary {
  // 尝试提取 JSON 部分（AI 可能在 JSON 前后添加额外文本）
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('AI 返回内容无法解析为 JSON');
  }

  const parsed = JSON.parse(jsonMatch[0]);

  if (!parsed.playerComments || !Array.isArray(parsed.playerComments) || !parsed.summary) {
    throw new Error('AI 返回的 JSON 格式不正确');
  }

  return {
    playerComments: parsed.playerComments.map((c: { name: string; comment: string }) => ({
      name: c.name,
      comment: c.comment,
    })),
    summary: parsed.summary,
  };
}

/** 生成 AI 犀利点评 */
export async function generateAICommentary(input: CommentaryInput): Promise<AICommentary> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('未配置智谱 API Key，请在 .env 文件中设置 VITE_ZHIPU_API_KEY');
  }

  const userPrompt = buildUserPrompt(input);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(ZHIPU_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'glm-4.7',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.9,
        max_tokens: 8192,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`API 请求失败 (${response.status}): ${errText}`);
    }

    const data = await response.json();

    if (!data.choices?.[0]?.message?.content) {
      // 打印完整响应用于调试
      console.error('智谱 API 完整响应:', JSON.stringify(data, null, 2));
      const errMsg = data.error?.message || data.message || JSON.stringify(data);
      throw new Error(`API 返回内容为空: ${errMsg}`);
    }

    return parseCommentary(data.choices[0].message.content);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('AI 点评生成超时，请稍后重试');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** 检查是否配置了 API Key */
export function isAIConfigured(): boolean {
  return !!getApiKey();
}

// ========== 缓存管理 ==========

const CACHE_PREFIX = 'ai_commentary_';

export function getCachedCommentary(date: string): AICommentary | null {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${date}`);
    if (!raw) return null;
    return JSON.parse(raw) as AICommentary;
  } catch {
    return null;
  }
}

export function setCachedCommentary(date: string, commentary: AICommentary): void {
  try {
    localStorage.setItem(`${CACHE_PREFIX}${date}`, JSON.stringify(commentary));
  } catch {
    // localStorage 满了或不可用，忽略
  }
}

export function clearCachedCommentary(date: string): void {
  localStorage.removeItem(`${CACHE_PREFIX}${date}`);
}

// ========== 数据准备 ==========

/** 计算球员历史总数据 */
export function calculateHistoricalStats(
  playerId: string,
  allMatches: Match[],
): { totalMatches: number; totalWinRate: number } {
  let total = 0;
  let wins = 0;
  allMatches.forEach((m) => {
    if (m.status !== 'completed') return;
    const isInMatch =
      m.team1.players.some((p) => p.id === playerId) ||
      m.team2.players.some((p) => p.id === playerId);
    if (!isInMatch) return;
    total++;
    const isTeam1 = m.team1.players.some((p) => p.id === playerId);
    const won =
      (m.winner === 'team1' && isTeam1) || (m.winner === 'team2' && !isTeam1);
    if (won) wins++;
  });
  return {
    totalMatches: total,
    totalWinRate: total > 0 ? Math.round((wins / total) * 100) : 0,
  };
}
