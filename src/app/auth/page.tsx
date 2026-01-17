import { Suspense } from "react";
import AuthClient from "./auth-client";

type PageProps = {
  searchParams?: { mode?: string };
};

export default function AuthPage({ searchParams }: PageProps) {
  const mode = searchParams?.mode === "signup" ? "signup" : "signin";
  return (
    <Suspense fallback={null}>
      <AuthClient mode={mode} />
    </Suspense>
  );
}

