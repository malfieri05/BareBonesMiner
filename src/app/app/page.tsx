"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import styles from "./app.module.css";
import { OneTapMiningSetup } from "@/app/settings/one-tap-mining/one-tap-mining-client";

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
  category?: string;
};

type MinedClip = {
  id: string;
  videoId: string;
  title: string;
  transcriptText: string;
  analysis: string;
  actionPlan: string[];
  category: string;
  folderId: string | null;
  createdAt: string;
};

type Folder = {
  id: string;
  name: string;
  isSystem: boolean;
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
  const [folders, setFolders] = useState<Folder[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [savingFolder, setSavingFolder] = useState(false);
  const [showFolderMenu, setShowFolderMenu] = useState(false);
  const [cardMenuClipId, setCardMenuClipId] = useState<string | null>(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportFrequency, setReportFrequency] = useState<"daily" | "weekly">("daily");
  const [reportTime, setReportTime] = useState("08:00");
  const [reportDay, setReportDay] = useState("Monday");
  const [reportSaving, setReportSaving] = useState(false);
  const [reportStatus, setReportStatus] = useState<string | null>(null);
  const [reportSending, setReportSending] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const transcriptText = useMemo(() => {
    if (!response) return "";
    if (typeof response.transcript === "string") return response.transcript;
    return response.transcript.map((segment) => segment.text).join(" ");
  }, [response]);

  const folderCounts = useMemo(() => {
    const counts = new Map<string, number>();
    minedClips.forEach((clip) => {
      if (!clip.folderId) return;
      counts.set(clip.folderId, (counts.get(clip.folderId) ?? 0) + 1);
    });
    return counts;
  }, [minedClips]);

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
      if (!data.session.user.user_metadata?.onboarded) {
        setShowOnboarding(true);
      }
      setUserEmail(data.session.user.email ?? null);
      setUserId(data.session.user.id);
      setCheckingSession(false);
      await ensureDefaultFolders(data.session.user.id);
      await fetchFolders(data.session.user.id);
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
        const category = payload.category?.trim() || "Other";
        const folderId = await resolveFolderId(category);
        const savedClip = await saveClip({
          id: newClipId,
          videoId: response.videoId,
          title: `Clip #${minedClips.length + 1}`,
          transcriptText,
          analysis: payload.analysis,
          actionPlan: payload.actionPlan,
          category,
          folderId,
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

  useEffect(() => {
    if (!showProfileMenu) return;
    const handleClick = () => setShowProfileMenu(false);
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, [showProfileMenu]);

  const closeReportModal = () => setShowReportModal(false);

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

  const handleCompleteOnboarding = async () => {
    if (!supabase) return;
    setReportStatus(null);
    try {
      const { error } = await supabase.auth.updateUser({
        data: { onboarded: true },
      });
      if (error) throw error;
      setShowOnboarding(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save onboarding state.";
      setReportStatus(message);
    }
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
      .select(
        "id, video_id, title, transcript, analysis, action_plan, created_at, category, folder_id"
      )
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
        category: (clip.category as string) ?? "Other",
        folderId: (clip.folder_id as string) ?? null,
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
        category: clip.category,
        folder_id: clip.folderId,
      })
      .select(
        "id, video_id, title, transcript, analysis, action_plan, created_at, category, folder_id"
      )
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
      category: (data.category as string) ?? "Other",
      folderId: (data.folder_id as string) ?? null,
      createdAt: data.created_at as string,
    };
  };

  const fetchFolders = async (uid: string) => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("folders")
      .select("id, name, is_system")
      .eq("user_id", uid)
      .order("name");
    if (error) {
      setClipsError(error.message);
      return;
    }
    const seen = new Map<string, Folder>();
    (data ?? []).forEach((folder) => {
      const name = (folder.name as string).trim();
      const key = name.toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, {
          id: folder.id as string,
          name,
          isSystem: Boolean(folder.is_system),
        });
      }
    });
    const sorted = Array.from(seen.values()).sort((a, b) => {
      const aIsOther = a.name.toLowerCase() === "other";
      const bIsOther = b.name.toLowerCase() === "other";
      if (aIsOther && !bIsOther) return 1;
      if (!aIsOther && bIsOther) return -1;
      return a.name.localeCompare(b.name);
    });
    setFolders(sorted);
  };

  const ensureDefaultFolders = async (uid: string) => {
    if (!supabase) return;
    const { data } = await supabase.from("folders").select("id").eq("user_id", uid).limit(1);
    if (data && data.length > 0) return;
    const defaults = [
      "Business",
      "Health",
      "Mindset",
      "Politics",
      "Religion",
      "Productivity",
      "Other",
    ];
    await supabase.from("folders").insert(
      defaults.map((name) => ({
        user_id: uid,
        name,
        is_system: true,
      }))
    );
  };

  const resolveFolderId = async (category: string) => {
    if (!supabase || !userId) return null;
    const match = folders.find(
      (folder) => folder.name.toLowerCase() === category.toLowerCase()
    );
    if (match) return match.id;
    const { data, error } = await supabase
      .from("folders")
      .insert({ user_id: userId, name: category, is_system: true })
      .select("id")
      .single();
    if (error) return null;
    const created = { id: data.id as string, name: category, isSystem: true };
    setFolders((prev) => [...prev, created]);
    return created.id;
  };

  const handleCreateFolder = async () => {
    if (!supabase || !userId || !newFolderName.trim()) return;
    setSavingFolder(true);
    const { data, error } = await supabase
      .from("folders")
      .insert({ user_id: userId, name: newFolderName.trim(), is_system: false })
      .select("id, name, is_system")
      .single();
    setSavingFolder(false);
    if (error) {
      setClipsError(error.message);
      return;
    }
    const created = {
      id: data.id as string,
      name: data.name as string,
      isSystem: Boolean(data.is_system),
    };
    setFolders((prev) => [...prev, created]);
    setNewFolderName("");
  };

  const handleMoveClip = async (
    clipId: string,
    folderId: string | null,
    folderName?: string
  ) => {
    if (!supabase) return;
    const { error } = await supabase
      .from("mined_clips")
      .update({ folder_id: folderId, category: folderName ?? "Other" })
      .eq("id", clipId);
    if (error) {
      setClipsError(error.message);
      return;
    }
    setMinedClips((prev) =>
      prev.map((clip) =>
        clip.id === clipId
          ? { ...clip, folderId, category: folderName ?? clip.category }
          : clip
      )
    );
    setSelectedClip((current) =>
      current && current.id === clipId
        ? { ...current, folderId, category: folderName ?? current.category }
        : current
    );
    setShowFolderMenu(false);
    setCardMenuClipId(null);
  };

  const handleSaveReportPreferences = async () => {
    if (!supabase || !userId) return;
    setReportSaving(true);
    setReportStatus(null);
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const { error } = await supabase.from("report_preferences").upsert({
      user_id: userId,
      frequency: reportFrequency,
      time_of_day: reportTime,
      day_of_week: reportFrequency === "weekly" ? reportDay : null,
      timezone,
      updated_at: new Date().toISOString(),
    });
    setReportSaving(false);
    if (error) {
      setReportStatus(error.message);
      return;
    }
    setReportStatus("Preferences saved.");
  };

  const handleSendReportNow = async () => {
    if (!supabase) return;
    setReportSending(true);
    setReportStatus(null);
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setReportStatus("You must be signed in to send a report.");
      setReportSending(false);
      return;
    }
    try {
      const response = await fetch("/api/report/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to send report.");
      }
      setReportStatus("Report sent. Check your inbox.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to send report.";
      setReportStatus(message);
    } finally {
      setReportSending(false);
    }
  };

  const closeModal = () => {
    setSelectedClip(null);
    setShowFolderMenu(false);
  };

  useEffect(() => {
    if (!selectedClip) {
      setShowProfileMenu(false);
    }
  }, [selectedClip]);

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
        {showOnboarding ? (
          <div className={styles.onboardingOverlay}>
            <div className={styles.onboardingModal}>
              <OneTapMiningSetup
                showBackLink={false}
                showDoneButton={false}
                showFinishButton
                showResetButton={false}
                onComplete={handleCompleteOnboarding}
              />
            </div>
          </div>
        ) : null}
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>Value Miner</h1>
            <p className={styles.welcome}>
              {userEmail ? `Welcome, ${userEmail}` : "Welcome"}
            </p>
            <p className={styles.subhead}>Turn your doom scroll into actionable insights.</p>
          </div>
          <div className={styles.userInfo}>
            {userEmail ? <span>{userEmail}</span> : null}
            <button
              className={styles.profileButton}
              type="button"
              aria-label="User menu"
              onClick={(event) => {
                event.stopPropagation();
                setShowProfileMenu((current) => !current);
              }}
            >
              👤
            </button>
            <button
              className={styles.bellButton}
              type="button"
              aria-label="Notification settings"
              onClick={() => setShowReportModal(true)}
            >
              <span className={styles.bellIcon} aria-hidden="true">
                <svg viewBox="0 0 24 24" role="img">
                  <path
                    d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 1 0-14 0v5l-2 2v1h18v-1l-2-2Z"
                    fill="currentColor"
                  />
                </svg>
              </span>
            </button>
            {showProfileMenu ? (
              <div
                className={styles.profileMenu}
                onClick={(event) => event.stopPropagation()}
              >
                <Link className={styles.menuItem} href="/settings/one-tap-mining">
                  One-Tap Mining
                </Link>
                <button
                  className={styles.signOut}
                  type="button"
                  onClick={handleSignOut}
                >
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </header>

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.label} htmlFor="url">
            Input YouTube short URL
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
            <button
              className={styles.primaryButton}
              type="submit"
              disabled={loading || analysisLoading}
            >
              {loading || analysisLoading ? (
                <span className={styles.loadingWrap}>
                  <span className={styles.spinner} aria-hidden="true" />
                  Mining...
                </span>
              ) : (
                "Mine"
              )}
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
          <div className={styles.folderControls}>
            <div className={styles.folderList}>
              <button
                type="button"
                className={`${styles.folderChip} ${
                  activeFolderId === null ? styles.folderChipActive : ""
                } ${styles.allChip}`}
                onClick={() => setActiveFolderId(null)}
              >
                All ({minedClips.length})
              </button>
              {folders.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  className={`${styles.folderChip} ${
                    activeFolderId === folder.id ? styles.folderChipActive : ""
                  } ${folder.name.toLowerCase() === "other" ? styles.otherChip : ""}`}
                  onClick={() => setActiveFolderId(folder.id)}
                >
                  {folder.name} ({folderCounts.get(folder.id) ?? 0})
                </button>
              ))}
            </div>
            <div className={styles.createFolder}>
              <input
                type="text"
                placeholder="New folder name"
                value={newFolderName}
                onChange={(event) => setNewFolderName(event.target.value)}
              />
              <button type="button" onClick={handleCreateFolder} disabled={savingFolder}>
                {savingFolder ? "Adding..." : "Add Category"}
              </button>
            </div>
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
              {minedClips
                .filter((clip) => (activeFolderId ? clip.folderId === activeFolderId : true))
                .map((clip, index) => (
                <article
                  key={clip.id}
                  className={`${styles.clipCard} ${
                    highlightClipId === clip.id ? styles.clipHighlight : ""
                  }`}
                >
                  <div className={styles.cardTop}>
                    <div className={styles.tag}>Clip #{minedClips.length - index}</div>
                    <button
                      type="button"
                      className={styles.cardMenuButton}
                      aria-label="Move to folder"
                      onClick={(event) => {
                        event.stopPropagation();
                        setCardMenuClipId((current) =>
                          current === clip.id ? null : clip.id
                        );
                      }}
                    >
                      <span
                        className={`${styles.menuIcon} ${
                          cardMenuClipId === clip.id ? styles.menuIconActive : ""
                        }`}
                      >
                        {cardMenuClipId === clip.id ? "×" : "⋯"}
                      </span>
                    </button>
                    {cardMenuClipId === clip.id ? (
                      <div
                        className={styles.cardMenu}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <p className={styles.menuLabel}>Assign Category:</p>
                        <select
                          className={styles.folderSelect}
                          value={clip.folderId ?? ""}
                          onChange={(event) =>
                            handleMoveClip(
                              clip.id,
                              event.target.value ? event.target.value : null,
                              folders.find((folder) => folder.id === event.target.value)
                                ?.name ?? "Other"
                            )
                          }
                        >
                          <option value="">Uncategorized</option>
                          {folders.map((folder) => (
                            <option key={folder.id} value={folder.id}>
                              {folder.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}
                  </div>
                  <button
                    className={styles.cardButton}
                    type="button"
                    onClick={() => setSelectedClip(clip)}
                  >
                    <p className={styles.clipTitle}>{clip.category}</p>
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
              onClick={(event) => {
                event.stopPropagation();
                if (showFolderMenu) {
                  setShowFolderMenu(false);
                }
              }}
              role="dialog"
              aria-modal="true"
            >
              <div className={styles.modalHeader}>
                <div>
                  <p className={styles.modalTitle}>{selectedClip.title}</p>
                  <p className={styles.modalMeta}>
                    Video Link:{" "}
                    <a
                      className={styles.videoLink}
                      href={`https://www.youtube.com/watch?v=${selectedClip.videoId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open
                    </a>{" "}
                    · {formatDate(selectedClip.createdAt)}
                  </p>
                </div>
                <div className={styles.modalActions}>
                  <button
                    className={styles.menuButton}
                    type="button"
                    aria-label="Assign category"
                    onClick={(event) => {
                      event.stopPropagation();
                      setShowFolderMenu((current) => !current);
                    }}
                  >
                    <span
                      className={`${styles.menuIcon} ${
                        showFolderMenu ? styles.menuIconActive : ""
                      }`}
                    >
                      {showFolderMenu ? "×" : "⋯"}
                    </span>
                  </button>
                  {showFolderMenu ? (
                    <div className={styles.menu} onClick={(event) => event.stopPropagation()}>
                      <p className={styles.menuLabel}>Move to folder</p>
                      <select
                        className={styles.folderSelect}
                        value={selectedClip.folderId ?? ""}
                        onChange={(event) =>
                          handleMoveClip(
                            selectedClip.id,
                            event.target.value ? event.target.value : null,
                            folders.find((folder) => folder.id === event.target.value)
                              ?.name ?? "Other"
                          )
                        }
                      >
                        <option value="">Uncategorized</option>
                        {folders.map((folder) => (
                          <option key={folder.id} value={folder.id}>
                            {folder.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  <button className={styles.modalClose} onClick={closeModal} type="button">
                    Close
                  </button>
                </div>
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
        {showReportModal ? (
          <div className={styles.modalOverlay} onClick={closeReportModal} role="presentation">
            <div
              className={styles.modal}
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
            >
              <div className={styles.modalHeader}>
                <div>
                  <p className={styles.modalTitle}>Your automated scroll report</p>
                  <p className={styles.modalMeta}>
                    Receive new automated email report of your mined info per set time
                    period:
                  </p>
                </div>
                <button className={styles.modalClose} onClick={closeReportModal} type="button">
                  Close
                </button>
              </div>
              <div className={styles.modalSection}>
                <div className={styles.reportOptions}>
                  <label className={styles.radioOption}>
                    <input
                      type="radio"
                      name="reportFrequency"
                      value="daily"
                      checked={reportFrequency === "daily"}
                      onChange={() => setReportFrequency("daily")}
                    />
                    Daily
                  </label>
                  <label className={styles.radioOption}>
                    <input
                      type="radio"
                      name="reportFrequency"
                      value="weekly"
                      checked={reportFrequency === "weekly"}
                      onChange={() => setReportFrequency("weekly")}
                    />
                    Weekly
                  </label>
                </div>
              </div>
              {reportFrequency === "weekly" ? (
                <div className={styles.modalSection}>
                  <label className={styles.detailLabel}>Day of week</label>
                  <select
                    className={styles.folderSelect}
                    value={reportDay}
                    onChange={(event) => setReportDay(event.target.value)}
                  >
                    {[
                      "Monday",
                      "Tuesday",
                      "Wednesday",
                      "Thursday",
                      "Friday",
                      "Saturday",
                      "Sunday",
                    ].map((day) => (
                      <option key={day} value={day}>
                        {day}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div className={styles.modalSection}>
                <label className={styles.detailLabel}>Time</label>
                <input
                  className={styles.timeInput}
                  type="time"
                  value={reportTime}
                  onChange={(event) => setReportTime(event.target.value)}
                />
              </div>
              <div className={styles.modalFooter}>
                <button
                  className={styles.secondaryButton}
                  type="button"
                  onClick={handleSendReportNow}
                  disabled={reportSending}
                >
                  {reportSending ? "Sending..." : "Send current report now"}
                </button>
                <button
                  className={styles.primaryButton}
                  type="button"
                  onClick={handleSaveReportPreferences}
                  disabled={reportSaving}
                >
                  {reportSaving ? "Saving..." : "Save preferences"}
                </button>
              </div>
              {reportStatus ? <p className={styles.reportStatus}>{reportStatus}</p> : null}
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}

