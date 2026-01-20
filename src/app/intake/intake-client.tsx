"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type IntakeStatus = "idle" | "working" | "done" | "error";

const VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

const extractVideoId = (input: string): string | null => {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (VIDEO_ID_REGEX.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
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
};

export default function IntakeClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<IntakeStatus>("idle");
  const [message, setMessage] = useState<string>("Preparing intake...");

  const rawUrl = searchParams.get("url") ?? "";
  const source = searchParams.get("source") ?? "ios_shortcut";

  const decodedUrl = useMemo(() => {
    if (!rawUrl) return "";
    try {
      return decodeURIComponent(rawUrl);
    } catch {
      return rawUrl;
    }
  }, [rawUrl]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!supabase) {
        setStatus("error");
        setMessage("Supabase is not configured.");
        return;
      }

      if (!decodedUrl) {
        setStatus("error");
        setMessage("Missing URL in intake request.");
        return;
      }

      setStatus("working");
      setMessage("Saving clip to your library...");

      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user) {
        const redirectTarget = `/intake?url=${encodeURIComponent(decodedUrl)}&source=${encodeURIComponent(
          source
        )}`;
        window.location.href = `/auth?mode=signin&redirect=${encodeURIComponent(redirectTarget)}`;
        return;
      }

      try {
        let transcriptText = "";
        let videoId = extractVideoId(decodedUrl) ?? "unknown";
        let analysisData: { analysis?: string; actionPlan?: string[]; category?: string } = {};

        try {
          const transcriptRes = await fetch("/api/transcript", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: decodedUrl }),
          });

          if (transcriptRes.ok) {
            const transcriptData = (await transcriptRes.json()) as {
              videoId?: string;
              transcript?: Array<{ text: string }> | string;
            };

            videoId = transcriptData.videoId ?? videoId;
            transcriptText = Array.isArray(transcriptData.transcript)
              ? transcriptData.transcript.map((segment) => segment.text).join(" ")
              : transcriptData.transcript ?? "";
          }
        } catch {
          // fall back below
        }

        if (transcriptText) {
          const analyzeRes = await fetch("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ transcript: transcriptText }),
          });

          if (analyzeRes.ok) {
            analysisData = (await analyzeRes.json()) as {
              analysis?: string;
              actionPlan?: string[];
              category?: string;
            };
          }
        } else {
          transcriptText = "Transcript not available.";
          analysisData = { analysis: "Transcript not available.", actionPlan: [], category: "Other" };
        }

        const { error } = await supabase.from("mined_clips").insert({
          user_id: user.id,
          video_id: videoId,
          title: "Clip",
          transcript: transcriptText,
          analysis: analysisData.analysis ?? "",
          action_plan: analysisData.actionPlan ?? [],
          category: analysisData.category ?? "Other",
          source,
        });

        if (error) throw new Error(error.message);

        if (cancelled) return;
        setStatus("done");
        setMessage("Saved ✅");
        setTimeout(() => {
          window.close();
        }, 600);
        setTimeout(() => {
          router.replace("/app");
        }, 1200);
      } catch (error) {
        if (cancelled) return;
        const message = "Issue saving clip. Please try again in the app.";
        setStatus("error");
        setMessage(message);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [decodedUrl, router, source]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        background: "#0b0b15",
        color: "#f3f3ff",
        textAlign: "center",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div>
        <h1 style={{ marginBottom: "0.75rem" }}>
          {status === "done" ? "Saved ✅" : status === "error" ? "Issue saving clip" : "Saving..."}
        </h1>
        <p style={{ opacity: 0.8 }}>{message}</p>
      </div>
    </div>
  );
}

