import { NextResponse } from "next/server";
import { isVoiceLogEnabled } from "@/lib/server/config";
import { appendVoiceLog, parseVoiceLogBody } from "@/lib/server/voiceLog";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isVoiceLogEnabled()) {
    return new NextResponse(null, { status: 404 });
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = parseVoiceLogBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  await appendVoiceLog(parsed.value.sessionId, parsed.value.entries);
  return new NextResponse(null, { status: 204 });
}
