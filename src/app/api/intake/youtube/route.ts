import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { extractVideoId, hashToken, processIntakeRequest } from "@/lib/intakeProcessor";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization") || "";
  const rawToken = authHeader.replace("Bearer ", "");
  if (!rawToken) {
    return NextResponse.json({ error: "Missing token." }, { status: 401 });
  }

  const tokenHash = hashToken(rawToken);
  const { data: tokenData } = await supabaseServer
    .from("user_api_tokens")
    .select("user_id, revoked_at")
    .eq("token_hash", tokenHash)
    .single();

  if (!tokenData || tokenData.revoked_at) {
    return NextResponse.json({ error: "Invalid token." }, { status: 401 });
  }

  const body = (await request.json()) as { url?: string; source?: string };
  if (!tokenData?.user_id) {
    return NextResponse.json({ error: "Invalid token." }, { status: 401 });
  }
  if (!body?.url) {
    return NextResponse.json({ error: "Missing url." }, { status: 400 });
  }

  const url = body.url;
  const videoId = extractVideoId(url);
  if (!videoId) {
    return NextResponse.json({ error: "Invalid YouTube URL." }, { status: 400 });
  }

  const source = body.source || "ios_shortcut";
  const now = new Date().toISOString();

  const { data: existingClip } = await supabaseServer
    .from("mined_clips")
    .select("id")
    .eq("user_id", tokenData.user_id)
    .eq("video_id", videoId)
    .limit(1);

  if (existingClip && existingClip.length > 0) {
    return NextResponse.json({ success: true, duplicate: true });
  }

  const { data: intake, error: intakeError } = await supabaseServer
    .from("intake_requests")
    .insert({
      user_id: tokenData.user_id,
      url,
      video_id: videoId,
      source,
      status: "queued",
      created_at: now,
    })
    .select("id")
    .single();

  if (intakeError) {
    return NextResponse.json({ error: intakeError.message }, { status: 500 });
  }

  setTimeout(() => {
    processIntakeRequest({
      userId: tokenData.user_id,
      url,
      source,
      intakeId: intake.id as string,
    }).catch(() => null);
  }, 0);

  return NextResponse.json({ success: true });
}

