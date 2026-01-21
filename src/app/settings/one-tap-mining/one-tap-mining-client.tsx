"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import styles from "./one-tap-mining.module.css";

type OneTapMiningSetupProps = {
  showBackLink?: boolean;
  showDoneButton?: boolean;
  showFinishButton?: boolean;
  showResetButton?: boolean;
  onDone?: () => void;
  onComplete?: () => void;
};

export function OneTapMiningSetup({
  showBackLink = true,
  showDoneButton = true,
  showFinishButton = false,
  showResetButton = true,
  onDone,
  onComplete,
}: OneTapMiningSetupProps) {
  const router = useRouter();
  const [shortcutToken, setShortcutToken] = useState<string | null>(null);
  const [tokenStatus, setTokenStatus] = useState<string | null>(null);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [resetPulse, setResetPulse] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [copyDone, setCopyDone] = useState(false);
  const [downloadDone, setDownloadDone] = useState(false);
  const shortcutInstallUrl = process.env.NEXT_PUBLIC_SHORTCUT_URL ?? "";
  const shortcutName = process.env.NEXT_PUBLIC_SHORTCUT_NAME ?? "Value Miner";

  const handleGenerateShortcutToken = async () => {
    if (!supabase) return;
    setTokenLoading(true);
    setTokenStatus(null);
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setTokenStatus("You must be signed in to generate a token.");
      setTokenLoading(false);
      return;
    }
    try {
      const response = await fetch("/api/tokens", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to generate token.");
      }
      setShortcutToken(payload.token);
      setTokenStatus("Token generated. Inject it into your iOS Shortcut next.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to generate token.";
      setTokenStatus(message);
    } finally {
      setTokenLoading(false);
    }
  };

  const handleCopyToken = async () => {
    if (!shortcutToken) return;
    await navigator.clipboard.writeText(shortcutToken);
    setCopyMessage("Token copied to clipboard.");
    window.setTimeout(() => setCopyMessage(null), 1800);
    setCopyDone(true);
  };

  const handleResetToken = async () => {
    if (!supabase) return;
    setTokenLoading(true);
    setTokenStatus(null);
    try {
      const { data } = await supabase.auth.getSession();
      const authToken = data.session?.access_token;
      if (!authToken) {
        setTokenStatus("You must be signed in to reset the token.");
        return;
      }
      const response = await fetch("/api/tokens", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to reset token.");
      }
      setShortcutToken(null);
      setTokenStatus("Token reset. Generate a new one-time token when you're ready.");
      setResetPulse(true);
      window.setTimeout(() => setResetPulse(false), 600);
      setResetDone(true);
      setCopyDone(false);
      setDownloadDone(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to reset token.";
      setTokenStatus(message);
    } finally {
      setTokenLoading(false);
    }
  };

  const handleInjectToken = () => {
    if (!shortcutToken) return;
    const shortcutUrl = `shortcuts://run-shortcut?name=${encodeURIComponent(
      shortcutName
    )}&input=${encodeURIComponent(shortcutToken)}`;
    setTokenStatus("Sending token to Shortcuts...");
    window.location.href = shortcutUrl;
  };

  const step1Done = Boolean(shortcutToken);
  const step2Done = copyDone;
  const step3Ready = step2Done;
  const step4Ready = downloadDone;
  const canFinish = step1Done && step2Done && downloadDone;

  const isTokenWarning =
    !shortcutToken &&
    Boolean(tokenStatus) &&
    (tokenStatus ?? "").toLowerCase().includes("token already generated");
  const warningText =
    tokenStatus ?? "Token already generated. Please click 'Reset Token' at the bottom of page.";
  const tokenDisplay = shortcutToken
    ? shortcutToken
    : isTokenWarning
      ? `*${warningText}*`
      : tokenStatus ?? "Token will appear here after generation.";

  return (
    <div className={styles.card}>
      {showBackLink ? (
        <Link className={styles.back} href="/app">
          ← Back to workspace
        </Link>
      ) : null}
      <h1>One-Tap Mining (iOS)</h1>
      <p className={styles.subhead}>
        Set up the iOS Share Sheet shortcut so you can send YouTube Shorts to Value Miner without
        leaving your scroll.
      </p>

      <div className={styles.actionStack}>
        <div className={styles.tokenSection}>
          <button
            className={`${styles.secondary} ${styles.generateButton} ${
              !step1Done ? styles.stepActive : styles.stepMuted
            }`}
            type="button"
            onClick={handleGenerateShortcutToken}
            disabled={tokenLoading || Boolean(shortcutToken)}
          >
            {tokenLoading ? "Generating..." : "1) Generate One-Time Token"}
          </button>
          {!step1Done ? <span className={styles.stepArrow} aria-hidden="true">←</span> : null}
          <div className={styles.tokenBox}>
            <span className={styles.tokenLabel}>Your token</span>
            <span className={`${styles.tokenValue} ${isTokenWarning ? styles.tokenWarning : ""}`}>
              {tokenDisplay}
            </span>
          </div>
          <button
            className={`${styles.primary} ${styles.copyButton} ${
              step1Done && !step2Done ? styles.stepActive : styles.stepMuted
            }`}
            type="button"
            onClick={handleCopyToken}
            disabled={!shortcutToken}
          >
            2) Copy Token
          </button>
          {step1Done && !step2Done ? (
            <span className={styles.stepArrow} aria-hidden="true">←</span>
          ) : null}
          {copyMessage ? <span className={styles.copyMessage}>{copyMessage}</span> : null}
          {shortcutInstallUrl ? (
            <a
              className={`${styles.primary} ${styles.downloadButton} ${
                step2Done && !downloadDone ? styles.stepActive : styles.stepMuted
              }`}
              href={shortcutInstallUrl}
              target="_blank"
              rel="noreferrer"
              aria-disabled={!step2Done}
              onClick={(event) => {
                if (!step2Done) {
                  event.preventDefault();
                  return;
                }
                event.preventDefault();
                const popup = window.open(shortcutInstallUrl, "_blank", "noopener,noreferrer");
                if (!popup) {
                  setTokenStatus("Allow pop-ups to keep this page open while downloading.");
                  return;
                }
                setDownloadDone(true);
              }}
            >
              3) Download ValueMiner iOS Shortcut
            </a>
          ) : null}
          {step2Done && !downloadDone ? (
            <span className={styles.stepArrow} aria-hidden="true">←</span>
          ) : null}
        </div>
      </div>

      {shortcutToken ? (
        <p className={styles.tokenNote}>
          Paste this into Authorization → Bearer (*TOKEN*) inside the Shortcut.
        </p>
      ) : null}
      {tokenStatus && shortcutToken ? <p className={styles.status}>{tokenStatus}</p> : null}

      <div className={styles.mediaWrap}>
        <span className={styles.mediaCaption}>
          Simply replace (*TOKEN*) with your generated token. Leave one between "Bearer" and your
          token text with no parentheses.
        </span>
        <img
          className={styles.mediaImage}
          src="/tokeninstruction.png"
          alt="Shortcut header showing where to paste the token in Authorization → Bearer."
        />
      </div>

      {showDoneButton ? (
        <div className={styles.footerActions}>
          <button
            className={styles.secondary}
            type="button"
            onClick={() => (onDone ? onDone() : router.push("/app"))}
          >
            Done
          </button>
        </div>
      ) : null}

      {showResetButton ? (
        <button
          className={`${styles.resetButton} ${resetPulse ? styles.resetButtonActive : ""} ${
            resetDone ? styles.resetButtonDone : ""
          }`}
          type="button"
          onClick={handleResetToken}
          aria-label={resetDone ? "Token reset" : "Reset token"}
        >
          {resetDone ? "✓" : "Reset token"}
        </button>
      ) : null}

      {showFinishButton ? (
        <div className={styles.finishActions}>
          <button
            className={`${styles.primary} ${
              step4Ready ? styles.stepActive : styles.stepMuted
            }`}
            type="button"
            onClick={onComplete}
            disabled={!canFinish || tokenLoading}
          >
            Done
          </button>
          {step4Ready ? <span className={styles.stepArrow} aria-hidden="true">←</span> : null}
        </div>
      ) : null}
    </div>
  );
}

export default function OneTapMiningClient() {
  return (
    <div className={styles.page}>
      <OneTapMiningSetup showBackLink showDoneButton />
    </div>
  );
}

