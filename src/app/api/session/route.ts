import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

const cookieName = "vm_refresh_token";
const cookieMaxAge = 60 * 60 * 24 * 90;
const isProd = process.env.NODE_ENV === "production";

export async function POST(request: Request) {
  let refreshToken = "";
  try {
    const body = (await request.json()) as { refreshToken?: string };
    refreshToken = body?.refreshToken?.trim() ?? "";
  } catch {
    refreshToken = "";
  }

  if (!refreshToken) {
    return NextResponse.json({ error: "Missing refresh token." }, { status: 400 });
  }

  const { data, error } = await supabaseServer.auth.refreshSession({
    refresh_token: refreshToken,
  });

  if (error || !data.session?.refresh_token) {
    return NextResponse.json({ error: "Invalid refresh token." }, { status: 401 });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(cookieName, data.session.refresh_token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: cookieMaxAge,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(cookieName, "", {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}

