"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import styles from "./app.module.css";

type TranscriptSegment = {
  text: string;
  start?: number;
  duration?: number;
};

type TranscriptResponse = {
  videoId: string;
  transcript: TranscriptSegment[] | string;
  language?: string;
  transcriptType?: string;
  source: string;
};

type AnalysisResponse = {
  analysis: string;
  actionPlan: string[];
};

type MinedClip = {
  id: string;
  videoId: string;
  title: string;
  transcriptText: string;
  analysis: string;
  actionPlan: string[];
  createdAt: string;
};

const exampleUrl = "https://www.youtube.com/shorts/aqz-KE-bpKQ";

export default function AppPage() {
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<TranscriptResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [minedClips, setMinedClips] = useState<MinedClip[]>([]);
  const [clipsLoading, setClipsLoading] = useState(false);
  const [clipsError, setClipsError] = useState<string | null>(null);
  const [selectedClip, setSelectedClip] = useState<MinedClip | null>(null);
  const [highlightClipId, setHighlightClipId] = useState<string | null>(null);

  const transcriptText = useMemo(() => {
    if (!response) return "";
    if (typeof response.transcript === "string") return response.transcript;
    return response.transcript.map((segment) => segment.text).join(" ");
  }, [response]);

  useEffect(() => {
    const loadSession = async () => {
      if (!supabase) {
        setClipsError("Supabase is not configured. Check your environment variables.");
        setCheckingSession(false);
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace("/auth?mode=signin");
        return;
      }
      setUserEmail(data.session.user.email ?? null);
      setUserId(data.session.user.id);
      setCheckingSession(false);
      await fetchClips(data.session.user.id);
    };

    loadSession();
  }, [router]);

  useEffect(() => {
    if (!response || !transcriptText || analysisLoading) return;
    if (analysis) return;

    const runAnalysis = async () => {
      setAnalysisError(null);
      setAnalysisLoading(true);
      try {
        const apiResponse = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: transcriptText }),
        });
        const payload = await apiResponse.json();
        if (!apiResponse.ok) {
          throw new Error(payload?.error || "Unable to analyze transcript.");
        }
        const newClipId = crypto.randomUUID();
        setAnalysis(payload);
        const savedClip = await saveClip({
          id: newClipId,
          videoId: response.videoId,
          title: `Clip #${minedClips.length + 1}`,
          transcriptText,
          analysis: payload.analysis,
          actionPlan: payload.actionPlan,
          createdAt: new Date().toISOString(),
        });
        if (savedClip) {
          setMinedClips((prev) => [savedClip, ...prev]);
        }
        setUrl("");
        setHighlightClipId(newClipId);
        window.setTimeout(() => {
          setHighlightClipId((current) => (current === newClipId ? null : current));
        }, 1800);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error.";
        setAnalysisError(message);
      } finally {
        setAnalysisLoading(false);
      }
    };

    runAnalysis();
  }, [analysis, analysisLoading, response, transcriptText]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setResponse(null);
    setAnalysis(null);
    setAnalysisError(null);

    if (!url.trim()) {
      setError("Paste a YouTube Shorts or video URL to continue.");
      return;
    }

    setLoading(true);
    try {
      const apiResponse = await fetch("/api/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      const payload = await apiResponse.json();
      if (!apiResponse.ok) {
        throw new Error(payload?.error || "Unable to fetch transcript.");
      }

      setResponse(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    router.replace("/");
  };

  const formatDate = (value: string) =>
    new Date(value).toLocaleDateString("en-US", {
      month: "numeric",
      day: "numeric",
      year: "numeric",
    });

  const fetchClips = async (uid: string) => {
    if (!supabase) {
      setClipsError("Supabase is not configured. Check your environment variables.");
      return;
    }
    setClipsLoading(true);
    setClipsError(null);
    const { data, error } = await supabase
      .from("mined_clips")
      .select("id, video_id, title, transcript, analysis, action_plan, created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false });

    if (error) {
      setClipsError(error.message);
      setClipsLoading(false);
      return;
    }

    const mapped =
      data?.map((clip) => ({
        id: clip.id as string,
        videoId: clip.video_id as string,
        title: clip.title as string,
        transcriptText: clip.transcript as string,
        analysis: clip.analysis as string,
        actionPlan: (clip.action_plan as string[]) ?? [],
        createdAt: clip.created_at as string,
      })) ?? [];

    setMinedClips(mapped);
    setClipsLoading(false);
  };

  const saveClip = async (clip: MinedClip) => {
    if (!supabase || !userId) return null;
    const { data, error } = await supabase
      .from("mined_clips")
      .insert({
        user_id: userId,
        video_id: clip.videoId,
        title: clip.title,
        transcript: clip.transcriptText,
        analysis: clip.analysis,
        action_plan: clip.actionPlan,
      })
      .select("id, video_id, title, transcript, analysis, action_plan, created_at")
      .single();

    if (error) {
      setAnalysisError(`Save failed: ${error.message}`);
      return null;
    }

    return {
      id: data.id as string,
      videoId: data.video_id as string,
      title: data.title as string,
      transcriptText: data.transcript as string,
      analysis: data.analysis as string,
      actionPlan: (data.action_plan as string[]) ?? [],
      createdAt: data.created_at as string,
    };
  };

  const closeModal = () => setSelectedClip(null);

  if (checkingSession) {
    return (
      <div className={styles.page}>
        <p className={styles.loading}>Loading your workspace...</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Value Miner</p>
            <h1>Your transcript workspace</h1>
            <p className={styles.subhead}>
              Paste a Shorts URL to generate a transcript, summary, and action plan.
            </p>
          </div>
          <div className={styles.userInfo}>
            {userEmail ? <span>{userEmail}</span> : null}
            <button className={styles.signOut} type="button" onClick={handleSignOut}>
              Sign out
            </button>
          </div>
        </header>

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.label} htmlFor="url">
            YouTube URL
          </label>
          <div className={styles.inputRow}>
            <input
              id="url"
              name="url"
              type="url"
              placeholder={exampleUrl}
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              autoComplete="off"
              className={styles.input}
            />
            <button className={styles.primaryButton} type="submit" disabled={loading}>
              {loading ? "Mining..." : "Mine"}
            </button>
          </div>
          {error ? <p className={styles.error}>{error}</p> : null}
        </form>

        {analysisError ? <p className={styles.error}>{analysisError}</p> : null}

        <section className={styles.inventory}>
          <div className={styles.inventoryHeader}>
            <h2>Your mined clips</h2>
            <p>Newest clips appear first.</p>
          </div>
          {clipsLoading ? (
            <div className={styles.emptyState}>Loading your saved clips...</div>
          ) : clipsError ? (
            <div className={styles.emptyState}>{clipsError}</div>
          ) : minedClips.length === 0 ? (
            <div className={styles.emptyState}>
              Paste a Shorts URL to start building your clip inventory.
            </div>
          ) : (
            <div className={styles.grid}>
              {minedClips.map((clip, index) => (
                <article
                  key={clip.id}
                  className={`${styles.clipCard} ${
                    highlightClipId === clip.id ? styles.clipHighlight : ""
                  }`}
                >
                  <div className={styles.cardTop}>
                    <div className={styles.tag}>Clip #{minedClips.length - index}</div>
                    <span className={styles.status}>Complete</span>
                  </div>
                  <button
                    className={styles.cardButton}
                    type="button"
                    onClick={() => setSelectedClip(clip)}
                  >
                    <p className={styles.clipTitle}>{clip.title}</p>
                    <h3>{clip.analysis}</h3>
                    <p className={styles.actionTitle}>Step 1</p>
                    <p className={styles.actionText}>{clip.actionPlan[0]}</p>
                  </button>
                  <div className={styles.cardFooter}>
                    <span>{formatDate(clip.createdAt)}</span>
                    <span className={styles.viewLink}>View</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
        {selectedClip ? (
          <div className={styles.modalOverlay} onClick={closeModal} role="presentation">
            <div
              className={styles.modal}
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
            >
              <div className={styles.modalHeader}>
                <div>
                  <p className={styles.modalTitle}>{selectedClip.title}</p>
                  <p className={styles.modalMeta}>
                    Video ID: {selectedClip.videoId} · {formatDate(selectedClip.createdAt)}
                  </p>
                </div>
                <button className={styles.modalClose} onClick={closeModal} type="button">
                  Close
                </button>
              </div>
              <div className={styles.modalSection}>
                <p className={styles.detailLabel}>Analysis</p>
                <p className={styles.detailText}>{selectedClip.analysis}</p>
              </div>
              <div className={styles.modalSection}>
                <p className={styles.detailLabel}>3-step action plan</p>
                <ol className={styles.detailList}>
                  {selectedClip.actionPlan.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </div>
              <div className={styles.modalSection}>
                <p className={styles.detailLabel}>Full transcript</p>
                <p className={styles.detailText}>{selectedClip.transcriptText}</p>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}

