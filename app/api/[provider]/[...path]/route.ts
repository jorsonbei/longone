// app/api/openai/v1/[...path]/route.ts
export const runtime = 'edge';

// ---- 这里用 A 站「项目环境变量」配置 Dragon 的地址与 Key ----
const DRAGON_BASE = process.env.DRAGON_API_BASE!; // 例：https://dragon-api2.vercel.app/api
const DRAGON_KEY  = process.env.DRAGON_API_KEY!;  // 例：DRGN-V4-XXXX...

// 允许的模型，用户在 UI 里选哪个就转哪个；默认为 grok-2
const ALLOWED = new Set([
  'grok-2',
  'gpt-4o-mini',
  'gemini-1.5-flash',
  'gpt-4.1-mini',
  'gpt-4o-mini-2024-07-18',
]);

const normalizeModel = (m?: string) => (m && ALLOWED.has(m) ? m : 'grok-2');

// 去掉调试块 / 代码围栏，仅保留正文（尽量“温和”，不影响正常 Markdown）
function cleanContent(s: string) {
  if (!s) return s;
  // 1) 去掉 head/tail 处的 ```json ... ```
  s = s.replace(/```json[\s\S]*?```/gi, '').trim();
  // 2) 去掉以 choices/usage/dragon 等关键字开头的“原始对象片段”
  s = s.replace(/^\s*\{?\s*"id"\s*:\s*"dragon_[^"]+"[\s\S]*$/im, '').trim();
  return s;
}

export async function POST(req: Request, ctx: { params: { path: string[] } }) {
  const leaf = (ctx.params?.path || []).join('/');
  if (leaf !== 'chat/completions') {
    return new Response('Not Found', { status: 404 });
  }

  const bodyIn = await req.json().catch(() => ({} as any));
  const wantStream = bodyIn?.stream !== false; // 默认流式
  const model = normalizeModel(bodyIn?.model);

  // 给 Dragon 的请求体：把 model 固定/纠错，同时让它尽量不输出调试信息
  const bodyUp = {
    ...bodyIn,
    model,
    stream: wantStream,
    // ——如果 Dragon 支持这些“降噪”字段会生效；不支持也不影响——
    dragon_opts: { debug: false, style: 'plain' },
  };

  const up = await fetch(`${DRAGON_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DRAGON_KEY}`,
      'Accept': wantStream ? 'text/event-stream' : 'application/json',
    },
    body: JSON.stringify(bodyUp),
  });

  // --- 流式：直接桥接 SSE（同时把 delta.content 做一次清洗） ---
  const ctype = up.headers.get('content-type') || '';
  if (wantStream && ctype.includes('text/event-stream')) {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const src = up.body!;
    const readable = new ReadableStream({
      start(controller) {
        const reader = src.getReader();
        let buffer = '';

        const pump = async () => {
          const { value, done } = await reader.read();
          if (done) {
            controller.close();
            return;
          }
          buffer += decoder.decode(value, { stream: true });

          // SSE 以 \n\n 分帧
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';

          for (const chunk of parts) {
            if (chunk.startsWith('data:')) {
              const raw = chunk.replace(/^data:\s*/,'').trim();
              if (raw === '[DONE]') {
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                continue;
              }
              try {
                const j = JSON.parse(raw);
                // 仅清洗 delta.content，不动其他字段
                const d = j?.choices?.[0]?.delta;
                if (d?.content) {
                  d.content = cleanContent(String(d.content));
                }
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(j)}\n\n`));
              } catch {
                // 不是 JSON，就原样透传
                controller.enqueue(encoder.encode(chunk + '\n\n'));
              }
            } else {
              controller.enqueue(encoder.encode(chunk + '\n\n'));
            }
          }
          pump();
        };

        pump();
      }
    });

    return new Response(readable, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    });
  }

  // --- 非流式：拿到 JSON，清洗 message.content 后再回给前端 ---
  const text = await up.text();
  try {
    const j = JSON.parse(text);
    const msg = j?.choices?.[0]?.message;
    if (msg?.content) {
      msg.content = cleanContent(String(msg.content));
    }
    return new Response(JSON.stringify(j), {
      status: up.status,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  } catch {
    // 上游不是 JSON，就原样返回
    return new Response(text, {
      status: up.status,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
}
