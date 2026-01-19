import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { extractVideoId, hashToken, processIntakeRequest } from "@/lib/intakeProcessor";

function pickUrl(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return pickUrl(value[0]);
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return pickUrl(record.url ?? record.URL ?? record.href ?? record.link);
  }
  return null;
}

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

  const rawBody = await request.text();
  let body: unknown = null;
  try {
    body = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    body = null;
  }
  if (!tokenData?.user_id) {
    return NextResponse.json({ error: "Invalid token." }, { status: 401 });
  }
  const urlValue =
    typeof body === "string"
      ? body
      : pickUrl((body as { url?: unknown } | null)?.url ?? body);
  if (!urlValue || typeof urlValue !== "string") {
    return NextResponse.json({ error: "Missing url." }, { status: 400 });
  }

  const url = urlValue;
  const videoId = extractVideoId(url);
  if (!videoId) {
    return NextResponse.json({ error: "Invalid YouTube URL." }, { status: 400 });
  }

  const source =
    typeof body === "object" && body && "source" in body && typeof body.source === "string"
      ? body.source
      : "ios_shortcut";
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

  const intakeId = intake?.id as string | undefined;
  if (intakeError) {
    console.warn("Intake request insert failed:", intakeError.message);
  }

  try {
    const result = await processIntakeRequest({
      userId: tokenData.user_id,
      url,
      source,
      intakeId,
    });

    return NextResponse.json({ success: true, clipId: result.clipId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Processing failed.";
    if (intakeId) {
      await supabaseServer
        .from("intake_requests")
        .update({ status: "error", error: message, processed_at: new Date().toISOString() })
        .eq("id", intakeId);
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

