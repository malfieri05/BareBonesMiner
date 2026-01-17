import { NextResponse } from "next/server";

const VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;
const SEARCH_API_ENDPOINT = "https://www.searchapi.io/api/v1/search";

type TranscriptSegment = {
  text: string;
  start?: number;
  duration?: number;
};

type SearchApiResponse = {
  transcripts?: TranscriptSegment[];
  transcript?: TranscriptSegment[] | string;
  language?: string;
  transcript_type?: string;
  transcriptType?: string;
};

function extractVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (VIDEO_ID_REGEX.test(trimmed)) return trimmed;

  const normalized = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;

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

function normalizeTranscript(data: SearchApiResponse) {
  if (Array.isArray(data.transcripts)) return data.transcripts;
  if (Array.isArray(data.transcript)) return data.transcript;
  if (typeof data.transcript === "string") return data.transcript;
  return null;
}

export async function POST(request: Request) {
  const apiKey = process.env.SEARCHAPI_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing SEARCHAPI_KEY server configuration." },
      { status: 500 }
    );
  }

  let body: { url?: string; lang?: string } | null = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const url = body?.url?.trim();
  if (!url) {
    return NextResponse.json({ error: "Missing YouTube URL." }, { status: 400 });
  }

  const videoId = extractVideoId(url);
  if (!videoId) {
    return NextResponse.json(
      { error: "Unable to parse a valid YouTube video ID." },
      { status: 400 }
    );
  }

  const apiUrl = new URL(SEARCH_API_ENDPOINT);
  apiUrl.searchParams.set("engine", "youtube_transcripts");
  apiUrl.searchParams.set("api_key", apiKey);
  apiUrl.searchParams.set("video_id", videoId);
  if (body?.lang) {
    apiUrl.searchParams.set("lang", body.lang);
  }

  let data: SearchApiResponse;
  try {
    const response = await fetch(apiUrl.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      const message = await response.text();
      return NextResponse.json(
        { error: "SearchAPI request failed.", details: message },
        { status: response.status }
      );
    }

    data = (await response.json()) as SearchApiResponse;
  } catch (error) {
    return NextResponse.json(
      { error: "SearchAPI request failed.", details: String(error) },
      { status: 502 }
    );
  }

  const transcript = normalizeTranscript(data);
  if (!transcript) {
    return NextResponse.json(
      { error: "Transcript not available for this video." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    videoId,
    transcript,
    language: data.language,
    transcriptType: data.transcriptType ?? data.transcript_type,
    source: "searchapi",
  });
}

