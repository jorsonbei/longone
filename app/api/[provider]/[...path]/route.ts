// app/api/dragon/[...path]/route.ts
import type { NextRequest } from 'next/server';

export const runtime = 'edge';

const DRAGON_BASE =
  process.env.DRAGON_BASE ?? 'https://dragon-api2.vercel.app/api';
const DRAGON_KEY = process.env.DRAGON_KEY ?? '';

function strip(h: Headers) {
  const out = new Headers(h);
  // 移除不该透传的头
  ['connection', 'keep-alive', 'transfer-encoding', 'content-length', 'host'].forEach((k) =>
    out.delete(k),
  );
  return out;
}

async function proxy(req: NextRequest, subpath: string) {
  // 预检
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  const url = `${DRAGON_BASE}/${subpath}`;

  // 基于来端头构造上游头，并强制注入 Dragon Key
  const headers = strip(req.headers);
  if (DRAGON_KEY) {
    headers.set('authorization', `Bearer ${DRAGON_KEY}`);
    headers.set('x-api-key', DRAGON_KEY);
  }
  if (!headers.get('accept')) headers.set('accept', 'application/json');

  const res = await fetch(url, {
    method: req.method,
    headers,
    body: req.body, // Edge Runtime 下可直接透传 ReadableStream，兼容 SSE
    redirect: 'manual',
  });

  // 透传响应（含流式）
  const respHeaders = strip(res.headers);
  return new Response(res.body, { status: res.status, headers: respHeaders });
}

export async function GET(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxy(req, ctx.params.path.join('/'));
}
export async function POST(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxy(req, ctx.params.path.join('/'));
}
export async function PUT(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxy(req, ctx.params.path.join('/'));
}
export async function PATCH(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxy(req, ctx.params.path.join('/'));
}
export async function DELETE(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxy(req, ctx.params.path.join('/'));
}
export async function HEAD(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxy(req, ctx.params.path.join('/'));
}
