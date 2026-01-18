"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import styles from "./auth.module.css";

type Mode = "signin" | "signup";

type AuthClientProps = {
  mode: Mode;
};

export default function AuthClient({ mode }: AuthClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeMode = (searchParams.get("mode") as Mode) || mode;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const title = useMemo(
    () => (activeMode === "signup" ? "Create your account" : "Welcome back"),
    [activeMode]
  );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus(null);
    setLoading(true);

    try {
      if (!supabase) {
        setStatus("Supabase is not configured. Check your environment variables.");
        return;
      }
      if (!email || !password) {
        setStatus("Please enter an email and password.");
        return;
      }

      if (activeMode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setStatus("Check your email to confirm your account.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setStatus("Signed in successfully. Redirecting...");
        router.push("/app");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong.";
      setStatus(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <main className={styles.card}>
        <Link className={styles.back} href="/">
          ← Back to home
        </Link>
        <h1>{title}</h1>
        <p className={styles.subhead}>
          {mode === "signup"
            ? "Start saving transcripts and action plans in one place."
            : "Sign in to access your saved transcripts and insights."}
        </p>

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.label} htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            className={styles.input}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
          />
          <label className={styles.label} htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            className={styles.input}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
          />

          <button className={styles.primary} type="submit" disabled={loading}>
            {loading ? "Working..." : activeMode === "signup" ? "Create account" : "Sign in"}
          </button>
          {status ? <p className={styles.status}>{status}</p> : null}
        </form>

        <div className={styles.switch}>
          {activeMode === "signup" ? (
            <>
              Already have an account? <Link href="/auth?mode=signin">Sign in</Link>
            </>
          ) : (
            <>
              New here? <Link href="/auth?mode=signup">Create an account</Link>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

