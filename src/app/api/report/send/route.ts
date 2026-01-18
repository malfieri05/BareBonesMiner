import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.REPORT_FROM_EMAIL;

type Preferences = {
  frequency: "daily" | "weekly";
};

function formatPeriodStart(frequency: "daily" | "weekly", now: Date) {
  const hours = frequency === "weekly" ? 24 * 7 : 24;
  return new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
}

function getBelief(category: string) {
  const map: Record<string, string> = {
    Business: "Leverage and execution matter more than ideas.",
    Health: "Small daily choices compound into long-term health.",
    Mindset: "Identity drives behavior more than willpower.",
    Politics: "Understanding systems reduces reactive decisions.",
    Religion: "Meaning is built through practice and reflection.",
    Productivity: "Consistency beats intensity when pressure rises.",
    Other: "Clarity comes from doing, not just consuming.",
  };
  return map[category] ?? "Clarity comes from doing, not just consuming.";
}

function getHook(topCategory: string, topCount: number, total: number) {
  if (total === 0) return "Based on your last 24 hours of scrolling, you mined no clips.";
  if (topCount >= Math.max(2, total * 0.5)) {
    return `Your scroll heavily rewarded ${topCategory.toLowerCase()} and practical execution.`;
  }
  return "Your scroll rewarded urgency and improvement more than entertainment.";
}

function buildEmailHtml(email: string, clips: any[], periodLabel: string) {
  const total = clips.length;
  const categoryCounts = clips.reduce<Record<string, number>>((acc, clip) => {
    const category = clip.category || "Other";
    acc[category] = (acc[category] ?? 0) + 1;
    return acc;
  }, {});

  const themes = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const topCategory = themes[0]?.[0] ?? "Other";
  const topCount = themes[0]?.[1] ?? 0;
  const hook = getHook(topCategory, topCount, total);

  const themeList = themes
    .map(([category, count]) => `<li><strong>${category}</strong> (${count} clips)</li>`)
    .join("");

  const deepDives = themes
    .map(([category]) => {
      const themeClips = clips.filter((clip) => (clip.category || "Other") === category);
      const sample = themeClips[0];
      const message = sample?.analysis || "Across multiple clips, the core message repeated.";
      const belief = getBelief(category);
      const steps = (sample?.action_plan || [
        "Pick one habit tied to this theme.",
        "Attach it to a daily routine you already do.",
        "Track it for 7 days without optimizing.",
      ])
        .slice(0, 3)
        .map((step: string) => `<li>${step}</li>`)
        .join("");

      return `
        <div style="margin-top:16px;padding:14px;border:1px solid #e5e7eb;border-radius:12px;">
          <h4 style="margin:0 0 6px;">${category} deep dive</h4>
          <p style="margin:0 0 8px;color:#4b5563;"><strong>What these clips were really saying:</strong> ${message}</p>
          <p style="margin:0 0 8px;color:#4b5563;"><strong>Underlying belief:</strong> ${belief}</p>
          <p style="margin:0 0 6px;"><strong>3-step implementation</strong></p>
          <ol style="margin:0;padding-left:18px;color:#374151;font-size:13px;">${steps}</ol>
        </div>
      `;
    })
    .join("");

  const standout = clips[0];
  const standoutBlock = standout
    ? `
      <div style="margin-top:16px;padding:14px;border:1px solid #e5e7eb;border-radius:12px;">
        <h4 style="margin:0 0 6px;">One clip that mattered most</h4>
        <p style="margin:0 0 8px;"><strong>${standout.title || "Mined Clip"}</strong></p>
        <p style="margin:0 0 8px;color:#4b5563;">${standout.analysis || ""}</p>
        <p style="margin:0;color:#4b5563;"><strong>Micro-action:</strong> ${
          (standout.action_plan || [])[0] || "Pick one step from this clip and do it today."
        }</p>
      </div>
    `
    : `<p style="color:#6b7280;">No clips mined this period.</p>`;

  return `
    <div style="font-family:Arial, sans-serif; max-width:680px; margin:0 auto; padding:24px;">
      <h2 style="margin-bottom:4px;">Your Scroll Report</h2>
      <p style="color:#6b7280;margin-top:0;">${periodLabel} summary for ${email}</p>

      <div style="margin-top:16px;padding:14px;border:1px solid #e5e7eb;border-radius:12px;">
        <p style="margin:0;color:#111827;"><strong>What your scroll was training you to become</strong></p>
        <p style="margin:6px 0 0;color:#4b5563;">${hook}</p>
      </div>

      <div style="margin-top:20px;">
        <h3 style="margin:0 0 8px;">Top themes detected</h3>
        <ul style="color:#374151;margin:0;padding-left:18px;">
          ${themeList || "<li>No clips this period.</li>"}
        </ul>
      </div>

      <div style="margin-top:20px;">
        <h3 style="margin:0 0 8px;">Theme deep dives</h3>
        ${deepDives || "<p style=\"color:#6b7280;\">No clips mined this period.</p>"}
      </div>

      <div style="margin-top:20px;">
        ${standoutBlock}
      </div>
    </div>
  `;
}

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY || !FROM_EMAIL) {
    throw new Error("Missing RESEND_API_KEY or REPORT_FROM_EMAIL.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to,
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text);
  }
}

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ error: "Missing auth token." }, { status: 401 });
  }

  const { data: userData, error: userError } = await supabaseServer.auth.getUser(token);
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const userId = userData.user.id;
  const email = userData.user.email;
  if (!email) {
    return NextResponse.json({ error: "Missing user email." }, { status: 400 });
  }

  const { data: prefData } = await supabaseServer
    .from("report_preferences")
    .select("frequency")
    .eq("user_id", userId)
    .single();

  const preferences = (prefData as Preferences) ?? { frequency: "daily" };
  const now = new Date();
  const fromDate = formatPeriodStart(preferences.frequency, now);

  const { data: clips } = await supabaseServer
    .from("mined_clips")
    .select("title, analysis, action_plan, category, created_at")
    .eq("user_id", userId)
    .gte("created_at", fromDate)
    .order("created_at", { ascending: false });

  const periodLabel = preferences.frequency === "weekly" ? "Weekly" : "Daily";
  const html = buildEmailHtml(email, clips ?? [], periodLabel);
  await sendEmail(email, `${periodLabel} Value Miner Scroll Report`, html);

  return NextResponse.json({ sent: true });
}

