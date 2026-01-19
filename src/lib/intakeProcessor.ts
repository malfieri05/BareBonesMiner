import crypto from "crypto";
import { supabaseServer } from "@/lib/supabaseServer";

const SEARCH_API_ENDPOINT = "https://www.searchapi.io/api/v1/search";
const VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;
const ALLOWED_CATEGORIES = [
  "Business",
  "Health",
  "Mindset",
  "Politics",
  "Religion",
  "Productivity",
  "Other",
];

function extractFromUrlString(raw: string): string | null {
  const normalized = raw.startsWith("http") ? raw : `https://${raw}`;

  try {
    const url = new URL(normalized);
    const hostname = url.hostname.replace(/^www\./, "");

    if (hostname === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return VIDEO_ID_REGEX.test(id) ? id : null;
    }

    if (hostname.endsWith("youtube.com") || hostname.endsWith("youtube-nocookie.com")) {
      const pathParts = url.pathname.split("/").filter(Boolean);
      if (pathParts[0] === "shorts" && pathParts[1]) {
        return VIDEO_ID_REGEX.test(pathParts[1]) ? pathParts[1] : null;
      }
      if (pathParts[0] === "watch") {
        const id = url.searchParams.get("v") || "";
        return VIDEO_ID_REGEX.test(id) ? id : null;
      }
      if (pathParts[0] === "embed" && pathParts[1]) {
        return VIDEO_ID_REGEX.test(pathParts[1]) ? pathParts[1] : null;
      }
      const vParam = url.searchParams.get("v");
      if (vParam && VIDEO_ID_REGEX.test(vParam)) return vParam;
    }
  } catch {
    return null;
  }

  return null;
}

export function extractVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (VIDEO_ID_REGEX.test(trimmed)) return trimmed;

  const direct = extractFromUrlString(trimmed);
  if (direct) return direct;

  const urlMatches = trimmed.match(/https?:\/\/\S+/g) ?? [];
  for (const candidate of urlMatches) {
    const cleaned = candidate.replace(/[)\].,!?]+$/g, "");
    const found = extractFromUrlString(cleaned);
    if (found) return found;
  }

  return null;
}

async function fetchTranscript(videoId: string) {
  const apiKey = process.env.SEARCHAPI_KEY;
  if (!apiKey) throw new Error("Missing SEARCHAPI_KEY.");

  const apiUrl = new URL(SEARCH_API_ENDPOINT);
  apiUrl.searchParams.set("engine", "youtube_transcripts");
  apiUrl.searchParams.set("api_key", apiKey);
  apiUrl.searchParams.set("video_id", videoId);

  const response = await fetch(apiUrl.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message);
  }

  const data = (await response.json()) as {
    transcripts?: Array<{ text: string }>;
    transcript?: Array<{ text: string }> | string;
  };

  if (Array.isArray(data.transcripts)) {
    return data.transcripts.map((segment) => segment.text).join(" ");
  }
  if (Array.isArray(data.transcript)) {
    return data.transcript.map((segment) => segment.text).join(" ");
  }
  if (typeof data.transcript === "string") return data.transcript;

  throw new Error("Transcript not available.");
}

async function analyzeTranscript(text: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY.");

  const prompt = `You are a concise assistant.
Return JSON with keys: analysis (exactly 3 sentences), actionPlan (array of exactly 3 steps), and category.
Choose category from this exact list only: ${ALLOWED_CATEGORIES.join(", ")}.
If unsure or mixed topic, set category to "Other".
Focus on turning the transcript into actionable guidance.
Transcript:
${text}`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages: [
        { role: "system", content: "You output strict JSON only." },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content ?? "";
  const parsed = JSON.parse(content) as {
    analysis?: string;
    actionPlan?: string[];
    category?: string;
  };

  const normalizedCategory =
    parsed.category &&
    ALLOWED_CATEGORIES.find(
      (value) => value.toLowerCase() === parsed.category?.toLowerCase()
    );

  return {
    analysis: parsed.analysis ?? "",
    actionPlan: Array.isArray(parsed.actionPlan) ? parsed.actionPlan.slice(0, 3) : [],
    category: normalizedCategory ?? "Other",
  };
}

async function resolveFolderId(userId: string, category: string) {
  const { data: folders } = await supabaseServer
    .from("folders")
    .select("id, name")
    .eq("user_id", userId);

  const match = (folders ?? []).find(
    (folder) => folder.name.toLowerCase() === category.toLowerCase()
  );
  if (match) return match.id as string;

  const { data, error } = await supabaseServer
    .from("folders")
    .insert({ user_id: userId, name: category, is_system: true })
    .select("id")
    .single();
  if (error) return null;
  return data.id as string;
}

export async function processIntakeRequest(params: {
  userId: string;
  url: string;
  source: string;
  intakeId?: string;
}) {
  const videoId = extractVideoId(params.url);
  if (!videoId) throw new Error("Invalid YouTube URL.");

  let transcriptText = "";
  let analysis: { analysis: string; actionPlan: string[]; category: string };
  let transcriptError: string | null = null;

  try {
    transcriptText = await fetchTranscript(videoId);
    analysis = await analyzeTranscript(transcriptText);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    transcriptError = message;
    transcriptText = "Transcript not available.";
    analysis = { analysis: "Transcript not available.", actionPlan: [], category: "Other" };
  }
  const folderId = await resolveFolderId(params.userId, analysis.category);

  const { data: clip, error: clipError } = await supabaseServer
    .from("mined_clips")
    .insert({
      user_id: params.userId,
      video_id: videoId,
      title: "Clip",
      transcript: transcriptText,
      analysis: analysis.analysis,
      action_plan: analysis.actionPlan,
      category: analysis.category,
      folder_id: folderId,
      source: params.source,
    })
    .select("id")
    .single();

  if (clipError) throw new Error(clipError.message);

  if (params.intakeId) {
    await supabaseServer
      .from("intake_requests")
      .update({
        status: "complete",
        error: transcriptError,
        processed_at: new Date().toISOString(),
        clip_id: clip.id,
      })
      .eq("id", params.intakeId);
  }

  return { videoId, clipId: clip.id as string };
}

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

