"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function HomeRedirectClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const code = searchParams.get("code");
    const type = searchParams.get("type");
    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");

    if (code || type === "signup" || error) {
      const query = new URLSearchParams({ mode: "signin" });
      if (error) {
        query.set("error", error);
      }
      if (errorDescription) {
        query.set("error_description", errorDescription);
      } else if (!error) {
        query.set("confirmed", "1");
      }
      router.replace(`/auth?${query.toString()}`);
    }
  }, [router, searchParams]);

  return null;
}

