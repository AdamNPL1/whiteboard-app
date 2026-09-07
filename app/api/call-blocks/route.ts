import { NextRequest, NextResponse } from "next/server";
import { blockCallParticipant, getBlockedCallers, unblockCallParticipant } from "@/lib/call-spam-store";
import { getSupabaseUserFromRequest } from "@/lib/supabase-auth";

export const runtime = "nodejs";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const user = await getSupabaseUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  return NextResponse.json({ blockedCallers: await getBlockedCallers(user.id) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const user = await getSupabaseUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const body = await request.json().catch(() => null) as { userId?: string } | null;
  if (!body?.userId || !uuidPattern.test(body.userId) || body.userId === user.id) return NextResponse.json({ error: "Invalid participant." }, { status: 400 });
  await blockCallParticipant(user.id, body.userId);
  return NextResponse.json({ blocked: true });
}

export async function DELETE(request: NextRequest) {
  const user = await getSupabaseUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const body = await request.json().catch(() => null) as { userId?: string } | null;
  if (!body?.userId || !uuidPattern.test(body.userId)) return NextResponse.json({ error: "Invalid participant." }, { status: 400 });
  await unblockCallParticipant(user.id, body.userId);
  return NextResponse.json({ blocked: false });
}
