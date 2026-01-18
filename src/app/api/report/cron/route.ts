import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.REPORT_FROM_EMAIL;

type Preference = {
  user_id: string;
  frequency: "daily" | "weekly";
  time_of_day: string;
  day_of_week: string | null;
  timezone: string;
  last_sent_at: string | null;
  users: { email: string | null } | null;
};

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function getLocalParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "long",
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: get("weekday"),
  };
}

function isDue(pref: Preference, now: Date) {
  const local = getLocalParts(now, pref.timezone);
  const [hourStr, minStr] = pref.time_of_day.split(":");
  const targetHour = Number(hourStr);
  const targetMinute = Number(minStr);

  if (local.hour < targetHour || (local.hour === targetHour && local.minute < targetMinute)) {
    return false;
  }

  if (pref.frequency === "weekly") {
    if (pref.day_of_week && pref.day_of_week !== local.weekday) return false;
  }

  if (!pref.last_sent_at) return true;

  const last = new Date(pref.last_sent_at);
  const lastLocal = getLocalParts(last, pref.timezone);

  if (pref.frequency === "daily") {
    return (
      local.year !== lastLocal.year ||
      local.month !== lastLocal.month ||
      local.day !== lastLocal.day
    );
  }

  return local.weekday !== lastLocal.weekday;
}

function formatPeriodStart(pref: Preference, now: Date) {
  const offsetHours = pref.frequency === "weekly" ? 24 * 7 : 24;
  return new Date(now.getTime() - offsetHours * 60 * 60 * 1000).toISOString();
}

function buildEmailHtml(email: string, clips: any[], periodLabel: string) {
  const categoryCounts = clips.reduce<Record<string, number>>((acc, clip) => {
    const category = clip.category || "Other";
    acc[category] = (acc[category] ?? 0) + 1;
    return acc;
  }, {});

  const categorySummary = Object.entries(categoryCounts)
    .map(([category, count]) => `<li>${category}: ${count}</li>`)
    .join("");

  const clipBlocks = clips
    .slice(0, 8)
    .map(
      (clip) => `
        <div style="margin-bottom:16px;padding:12px;border:1px solid #eee;border-radius:10px;">
          <strong>${clip.title || "Mined Clip"}</strong>
          <div style="color:#6b7280;font-size:12px;margin:4px 0;">${clip.category || "Other"}</div>
          <div style="margin:6px 0;">${clip.analysis}</div>
          <ol style="margin:0;padding-left:18px;color:#374151;font-size:13px;">
            ${(clip.action_plan || []).slice(0, 3).map((step: string) => `<li>${step}</li>`).join("")}
          </ol>
        </div>
      `
    )
    .join("");

  return `
    <div style="font-family:Arial, sans-serif; max-width:640px; margin:0 auto; padding:24px;">
      <h2 style="margin-bottom:4px;">Your Scroll Report</h2>
      <p style="color:#6b7280;margin-top:0;">${periodLabel} summary for ${email}</p>
      <h3 style="margin-top:24px;">Category breakdown</h3>
      <ul style="color:#374151;">${categorySummary || "<li>No clips this period.</li>"}</ul>
      <h3 style="margin-top:24px;">Top insights</h3>
      ${clipBlocks || "<p>No clips mined in this period.</p>"}
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

export async function POST() {
  const now = new Date();
  const { data: prefs, error } = await supabaseServer
    .from("report_preferences")
    .select("user_id, frequency, time_of_day, day_of_week, timezone, last_sent_at, users(email)")
    .returns<Preference[]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const due = (prefs ?? []).filter((pref) => pref.users?.email && isDue(pref, now));

  for (const pref of due) {
    const fromDate = formatPeriodStart(pref, now);
    const { data: clips } = await supabaseServer
      .from("mined_clips")
      .select("title, analysis, action_plan, category, created_at")
      .eq("user_id", pref.user_id)
      .gte("created_at", fromDate)
      .order("created_at", { ascending: false });

    const periodLabel = pref.frequency === "weekly" ? "Weekly" : "Daily";
    const html = buildEmailHtml(pref.users?.email ?? "", clips ?? [], periodLabel);
    await sendEmail(
      pref.users?.email ?? "",
      `${periodLabel} Value Miner Scroll Report`,
      html
    );

    await supabaseServer
      .from("report_preferences")
      .update({ last_sent_at: now.toISOString() })
      .eq("user_id", pref.user_id);
  }

  return NextResponse.json({ sent: due.length });
}

