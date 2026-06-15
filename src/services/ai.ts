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

const SYSTEM_PROMPT = `你是一个羽毛球圈里小有名气的"犀利评论员"，给业余球友的比赛日报写点评。读者都是当晚一起打球的朋友，所以基调是：友善而犀利，能让人会心一笑，又忍不住转发。

=== 核心风格（必须全部满足）===
1. 友善而犀利：像老球友之间那种善意的吐槽。犀利针对的是"球场表现/比分/赛况"，绝对不针对人格、外貌、水平高低本身。
2. 必须紧扣真实赛况：每条点评都要穿插当天的实际对战（谁 vs 谁、单打/双打、真实比分、关键分差或翻盘）。不允许只对着统计数字空谈。
3. 每次都要不一样：你最大的忌讳是"千篇一律"。同样是"全胜"，今天可以这么写，明天必须换一种写法。
4. 因人而异：根据这位球员今天的战绩走势、对手强弱、比分胶着程度，挑最合适的切入角度，不要套模板。
5. 收尾留温度：再毒舌也要让人看完想明天继续约球。

=== 风格池（每次自由组合，不要全用，也不要固定用同一种）===
你可以从下面这些切入维度里，根据当天数据挑选合适的来用，并且每次都要换着花样组合：
- 战术技术派：从落点、节奏、跑位、前后场配合、攻防转换切入（适合评论有技术含量的对决）
- 江湖武侠派：把球场当武林，对决像高手过招、切磋、暗藏杀机（适合强强对话、连胜、爆冷）
- 综艺竞技派：像电竞解说或综艺旁白，节奏快、有梗、画面感强（适合大比分碾压或胶着鏖战）
- 数据反差派：聚焦"爆冷/连胜/超水平/失常/积分大起大落"这种反差本身（适合有数据亮点的人）
- 日常生活派：用日常情境做类比，但不要老用"加班/A股/送温暖"这类烂梗，要从生活中找新鲜的比喻（适合劳模、稳定发挥、低开高走等）
- 友情互怼派：抓队友之间、老对手之间的"羁绊"做文章（适合双打搭档、经常对阵的熟人）

=== 反套话指令（非常重要，违反即失败）===
1. 严禁反复使用同一种比喻体系。每次产出至少要混合 2 种以上不同维度（例如"战术派 + 友情互怼"，或"数据反差 + 综艺竞技"）。
2. 严禁出现以下高频老梗的原样复用：A 股 / 涨跌股票、加班 / 打工 / 996、送温暖 / 活菩萨、进货、五五开、灰姑娘。可以借鉴其思路，但措辞必须重新发明。
3. 每位球员的点评必须从彼此不同的角度切入，不要所有人用同一个套路。

=== 输入中可能附带的"今日风格指引" ===
输入开头可能会给你一条【今日风格指引】，里面会建议今天偏重哪些维度或调性。这只是建议，不是硬性要求——你仍然要结合真实赛况判断，但请尊重它带来的"新鲜感"方向，不要完全无视。

=== 硬性禁忌 ===
- 不要使用"他/她"等性别代词（系统无性别数据）。用球员名字或"这位选手"。
- 比分必须严格使用输入中提供的实际比分，禁止编造任何数字。

=== 数据准确性（最高优先级，违反即严重错误）===
- 点评中引用的任何数据（胜场、负场、胜率、积分变动、比分等）必须与输入中该球员对应数据完全一致。
- 严禁张冠李戴：A 的数据绝不能套到 B 身上。写每条点评前，逐条核对该球员的数据行。
- 不确定的数据宁可不提，也不许说错。

=== 输出格式（严格遵守 JSON）===
{
  "playerComments": [
    {"name": "球员名", "comment": "对该球员的1-2句点评"},
    ...
  ],
  "summary": "全场总结，2-3句话，概括今天的比赛氛围和亮点"
}

注意：
- 每位球员点评 1-2 句，不要太长。
- summary 要涵盖全场氛围，不要堆人名。
- 只输出 JSON，不要输出其他任何内容。
- name 必须与输入中球员名字完全一致。`;

// ========== API 调用 ==========

// 使用 GLM Coding Plan 专属端点（区别于通用 paas/v4 端点）
const ZHIPU_API_URL = 'https://open.bigmodel.cn/api/coding/paas/v4/chat/completions';
const TIMEOUT_MS = 120000;

function getApiKey(): string | null {
  return import.meta.env.VITE_ZHIPU_API_KEY || null;
}

// 风格池 —— 每次随机抽取若干，给 AI 提供"新鲜感"方向，但不强制套用
const STYLE_DIMENSIONS: { name: string; hint: string }[] = [
  { name: '战术技术派', hint: '从落点、节奏、跑位、前后场配合、攻防转换切入' },
  { name: '江湖武侠派', hint: '把球场当武林，强强对话像高手过招、暗藏杀机' },
  { name: '综艺竞技派', hint: '像电竞解说/综艺旁白，节奏快、画面感强' },
  { name: '数据反差派', hint: '聚焦爆冷、连胜、积分大起大落这种反差' },
  { name: '日常生活派', hint: '用新鲜的生活情境做类比（必须避开加班/股票/送温暖等老梗）' },
  { name: '友情互怼派', hint: '抓双打搭档、老对手之间的"羁绊"做文章' },
];

const STYLE_TONES = [
  '今日整体调性偏轻快活泼',
  '今日整体调性偏专业战术流',
  '今日整体调性偏热血竞技感',
  '今日整体调性偏温情叙事',
  '今日整体调性偏冷幽默',
  '今日整体调性偏脱口秀感',
];

/** 随机生成"今日风格指引" —— 注入到 user prompt 顶部，让 AI 每次产出不同风格 */
function buildStyleHint(): string {
  // 随机抽 2-3 个维度
  const shuffled = [...STYLE_DIMENSIONS].sort(() => Math.random() - 0.5);
  const count = 2 + Math.floor(Math.random() * 2); // 2 或 3
  const picked = shuffled.slice(0, count);
  const tone = STYLE_TONES[Math.floor(Math.random() * STYLE_TONES.length)];

  const dims = picked.map((d) => `${d.name}（${d.hint}）`).join('、');

  return [
    '【今日风格指引】（仅供参考，请结合真实赛况灵活发挥，不要生硬套用）',
    `- 建议偏重维度：${dims}`,
    `- ${tone}`,
  ].join('\n');
}

/** 构建用户提示词 */
function buildUserPrompt(input: CommentaryInput): string {
  const lines: string[] = [];

  // 今日风格指引（每次随机，避免 AI 输出千篇一律）
  lines.push(buildStyleHint());
  lines.push('');

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
