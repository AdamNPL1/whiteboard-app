import { NextRequest, NextResponse } from "next/server";
import { acknowledgeIncomingBoardCall } from "@/lib/call-store";
import { getSupabaseUserFromRequest } from "@/lib/supabase-auth";

export const runtime = "nodejs";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function POST(request: NextRequest, context: { params: Promise<{ callId: string }> }) {
  const user = await getSupabaseUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { callId } = await context.params;
  if (!uuidPattern.test(callId)) return NextResponse.json({ error: "Call not found." }, { status: 404 });
  try {
    const call = await acknowledgeIncomingBoardCall(callId, user.id);
    return NextResponse.json({ acknowledged: true, call, serverNow: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Call not found." }, { status: 404 });
  }
}
