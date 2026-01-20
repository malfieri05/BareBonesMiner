"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type IntakeStatus = "idle" | "working" | "done" | "error";

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
        const transcriptRes = await fetch("/api/transcript", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: decodedUrl }),
        });

        if (!transcriptRes.ok) {
          const text = await transcriptRes.text();
          throw new Error(text || "Transcript request failed.");
        }

        const transcriptData = (await transcriptRes.json()) as {
          videoId?: string;
          transcript?: Array<{ text: string }> | string;
        };

        const transcriptText = Array.isArray(transcriptData.transcript)
          ? transcriptData.transcript.map((segment) => segment.text).join(" ")
          : transcriptData.transcript ?? "";

        if (!transcriptText) {
          throw new Error("Transcript not available.");
        }

        const analyzeRes = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript: transcriptText }),
        });

        if (!analyzeRes.ok) {
          const text = await analyzeRes.text();
          throw new Error(text || "Analysis request failed.");
        }

        const analysisData = (await analyzeRes.json()) as {
          analysis?: string;
          actionPlan?: string[];
          category?: string;
        };

        const { error } = await supabase.from("mined_clips").insert({
          user_id: user.id,
          video_id: transcriptData.videoId ?? "unknown",
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
        setMessage("Saved. Redirecting...");
        setTimeout(() => {
          router.replace("/app");
        }, 1200);
      } catch (error) {
        if (cancelled) return;
        const message =
          error instanceof Error ? error.message : "Something went wrong while saving the clip.";
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

