import { NextResponse } from "next/server";
import { mintRealtimeSecret, sessionIdFromRequest } from "@/lib/server/realtimeSession";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const sessionId = sessionIdFromRequest(body, request.headers.get("x-voice-session"));
  const result = await mintRealtimeSecret(sessionId);
  return NextResponse.json(result.body, { status: result.status });
}
