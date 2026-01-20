"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import styles from "./one-tap-mining.module.css";

export default function OneTapMiningClient() {
  const router = useRouter();
  const [shortcutToken, setShortcutToken] = useState<string | null>(null);
  const [tokenStatus, setTokenStatus] = useState<string | null>(null);
  const [tokenLoading, setTokenLoading] = useState(false);
  const shortcutInstallUrl = process.env.NEXT_PUBLIC_SHORTCUT_URL ?? "";

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
      setTokenStatus("Token generated. Copy it now and add it to your iOS Shortcut.");
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
    setTokenStatus("Token copied to clipboard.");
  };

  const steps = useMemo(
    () => [
      "Download the Value Miner iOS Shortcut.",
      "Generate your one-time token and paste it into the Shortcut.",
      "Share a YouTube Short → Value Miner → Saved ✅",
    ],
    []
  );

  return (
    <div className={styles.page}>
      <main className={styles.card}>
        <Link className={styles.back} href="/app">
          ← Back to workspace
        </Link>
        <h1>One-Tap Mining (iOS)</h1>
        <p className={styles.subhead}>
          Set up the iOS Share Sheet shortcut so you can send YouTube Shorts to Value Miner
          without leaving your scroll.
        </p>

        <div className={styles.actions}>
          <button
            className={styles.secondary}
            type="button"
            onClick={handleGenerateShortcutToken}
            disabled={tokenLoading}
          >
            {tokenLoading ? "Generating..." : "Generate one-time token"}
          </button>
          {shortcutToken ? (
            <button className={styles.primary} type="button" onClick={handleCopyToken}>
              Copy token
            </button>
          ) : null}
          {shortcutInstallUrl ? (
            <a className={styles.primary} href={shortcutInstallUrl} target="_blank" rel="noreferrer">
              Download Shortcut
            </a>
          ) : null}
        </div>

        {shortcutToken ? (
          <p className={styles.token}>
            Token: <span>{shortcutToken}</span>
          </p>
        ) : null}
        {tokenStatus ? <p className={styles.status}>{tokenStatus}</p> : null}

        <div className={styles.instructions}>
          <ol className={styles.steps}>
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>

        <div className={styles.footerActions}>
          <button className={styles.secondary} type="button" onClick={() => router.push("/app")}>
            Done
          </button>
        </div>
      </main>
    </div>
  );
}

