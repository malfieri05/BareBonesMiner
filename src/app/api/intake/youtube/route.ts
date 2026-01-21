import { NextResponse } from "next/server";
import { cookies } from "next/headers";
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
  const response = new NextResponse(null, { status: 204 });
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get("vm_refresh_token")?.value ?? "";
  let userId: string | null = null;

  if (refreshToken) {
    const { data, error } = await supabaseServer.auth.refreshSession({
      refresh_token: refreshToken,
    });
    if (!error && data.session?.user?.id) {
      userId = data.session.user.id;
      if (data.session.refresh_token) {
        response.cookies.set("vm_refresh_token", data.session.refresh_token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 60 * 60 * 24 * 90,
        });
      }
    }
  }

  if (!userId) {
    const authHeader = request.headers.get("authorization") || "";
    const rawToken = authHeader.replace("Bearer ", "");
    if (!rawToken) {
      return response;
    }

    const tokenHash = hashToken(rawToken);
    const { data: tokenData } = await supabaseServer
      .from("user_api_tokens")
      .select("user_id, revoked_at")
      .eq("token_hash", tokenHash)
      .single();

    if (!tokenData || tokenData.revoked_at || !tokenData.user_id) {
      return response;
    }
    userId = tokenData.user_id;
  }

  const rawBody = await request.text();
  let body: unknown = null;
  try {
    body = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    body = null;
  }
  const urlValue =
    typeof body === "string"
      ? body
      : pickUrl((body as { url?: unknown } | null)?.url ?? body);
  if (!urlValue || typeof urlValue !== "string") {
    return response;
  }

  const url = urlValue;
  const videoId = extractVideoId(url);
  if (!videoId) {
    return response;
  }

  const source =
    typeof body === "object" && body && "source" in body && typeof body.source === "string"
      ? body.source
      : "ios_shortcut";
  const now = new Date().toISOString();

  const { data: existingClip } = await supabaseServer
    .from("mined_clips")
    .select("id")
    .eq("user_id", userId)
    .eq("video_id", videoId)
    .limit(1);

  if (existingClip && existingClip.length > 0) {
    return response;
  }

  const { data: intake, error: intakeError } = await supabaseServer
    .from("intake_requests")
    .insert({
      user_id: userId,
      url,
      video_id: videoId,
      source,
      status: "queued",
      created_at: now,
    })
    .select("id")
    .single();

  if (intakeError) {
    return response;
  }

  try {
    const result = await processIntakeRequest({
      userId,
      url,
      source,
      intakeId: intake.id as string,
    });

    return NextResponse.json({ success: true, clipId: result.clipId });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
        ? error
        : JSON.stringify(error);
    await supabaseServer
      .from("intake_requests")
      .update({ status: "error", error: message, processed_at: new Date().toISOString() })
      .eq("id", intake.id);
    return response;
  }
}

