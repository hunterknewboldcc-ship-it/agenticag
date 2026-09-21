import { NextResponse } from "next/server";
import { getXaiApiKey } from "@/lib/server/config";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    hasXaiKey: Boolean(getXaiApiKey()),
  });
}
