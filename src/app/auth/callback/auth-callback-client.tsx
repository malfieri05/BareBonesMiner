"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import styles from "../auth.module.css";

type Status = "working" | "error" | "done";

export default function AuthCallbackClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<Status>("working");
  const [message, setMessage] = useState("Confirming your account...");

  const errorMessage = useMemo(() => {
    const description = searchParams.get("error_description");
    const error = searchParams.get("error");
    return description || error || "";
  }, [searchParams]);

  useEffect(() => {
    const code = searchParams.get("code");
    if (errorMessage) {
      setStatus("error");
      setMessage(errorMessage);
      return;
    }

    if (!code) {
      setStatus("error");
      setMessage("Missing confirmation code. Please request a new email.");
      return;
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      setStatus("error");
      setMessage("Supabase is not configured.");
      return;
    }

    const supabase = createClient(url, anonKey, {
      auth: { persistSession: true, detectSessionInUrl: true },
    });

    const run = async () => {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        setStatus("error");
        setMessage(error.message);
        return;
      }
      setStatus("done");
      setMessage("Email confirmed. Redirecting...");
      setTimeout(() => {
        router.replace("/app");
      }, 1200);
    };

    run();
  }, [router, searchParams, errorMessage]);

  return (
    <div className={styles.page}>
      <main className={styles.card}>
        <Link className={styles.back} href="/">
          ← Back to home
        </Link>
        <h1>{status === "error" ? "Confirmation failed" : "Confirming"}</h1>
        <p className={styles.subhead}>{message}</p>
        {status === "error" ? (
          <Link className={styles.primary} href="/auth?mode=signin">
            Back to sign in
          </Link>
        ) : null}
      </main>
    </div>
  );
}

