// app/api/[provider]/[...path]/route.ts
// 强制把 A 站的 OpenAI 兼容接口代理到 Dragon API（含 GET/POST/流式 + CORS）
export const runtime = 'edge';

const DRAGON_BASE =
  process.env.DRAGON_API_BASE || 'https://dragon-api2.vercel.app/api';
const DRAGON_KEY = process.env.DRAGON_API_KEY || '';

function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-headers':
      'authorization, x-api-key, content-type, accept',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  };
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

function normalizePath(segments: string[] = []) {
  const sub = segments.join('/');           // e.g. "v1/chat/completions"
  return sub.replace(/^v1\//, '');          // -> "chat/completions"
}

async function proxy(req: Request, ctx: { params: { provider: string; path: string[] } }) {
  const p = normalizePath(ctx.params?.path);
  let target = `${DRAGON_BASE}/${p}`;

  // 常用端点统一映射到 Dragon v1
  if (p.startsWith('chat/completions')) target = `${DRAGON_BASE}/v1/chat/completions`;
  else if (p.startsWith('models'))      target = `${DRAGON_BASE}/v1/models`;

  const isGet = req.method === 'GET' || req.method === 'HEAD';
  const body = isGet ? undefined : await req.arrayBuffer();

  // 组装请求头：强制携带 Dragon Key（覆盖前端传来的 Authorization）
  const h = new Headers(req.headers);
  if (DRAGON_KEY) {
    h.set('authorization', `Bearer ${DRAGON_KEY}`);
    h.set('x-api-key', DRAGON_KEY);
  }
  if (!h.get('content-type')) h.set('content-type', 'application/json');

  const resp = await fetch(target, { method: req.method, headers: h, body });
  const pass = new Headers(resp.headers);
  Object.entries(corsHeaders()).forEach(([k, v]) => pass.set(k, v as string));
  if (!pass.get('content-type')) pass.set('content-type', 'application/json');

  return new Response(resp.body, { status: resp.status, headers: pass });
}

export const GET = proxy;
export const POST = proxy;
