import { NextRequest, NextResponse } from "next/server";
import { getSupabaseUserFromRequest } from "@/lib/supabase-auth";
import { createSupabaseServerAuthClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ boardId: string }> }
) {
  const user = await getSupabaseUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { boardId } = await context.params;
  const supabase = createSupabaseServerAuthClient({ getAll: () => request.cookies.getAll() });
  const { data, error } = await supabase
    .from("board_personal_notes")
    .select("title, content, updated_at")
    .eq("board_id", boardId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Could not load private notes." }, { status: 500 });
  return NextResponse.json({
    note: data
      ? { title: data.title, content: data.content, updatedAt: data.updated_at }
      : { title: "My private notes", content: "", updatedAt: null },
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ boardId: string }> }
) {
  const user = await getSupabaseUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { boardId } = await context.params;
  const body = (await request.json().catch(() => null)) as { title?: unknown; content?: unknown } | null;
  if (typeof body?.title !== "string" || typeof body?.content !== "string" || body.title.length > 120 || body.content.length > 100000) {
    return NextResponse.json({ error: "Invalid private note." }, { status: 400 });
  }
  const supabase = createSupabaseServerAuthClient({ getAll: () => request.cookies.getAll() });
  const { data, error } = await supabase
    .from("board_personal_notes")
    .upsert({ board_id: boardId, user_id: user.id, title: body.title.trim() || "My private notes", content: body.content, updated_at: new Date().toISOString() }, { onConflict: "board_id,user_id" })
    .select("title, content, updated_at")
    .single();
  if (error) return NextResponse.json({ error: "Could not save private notes." }, { status: 500 });
  return NextResponse.json({ note: { title: data.title, content: data.content, updatedAt: data.updated_at } });
}
