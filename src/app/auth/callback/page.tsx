import { Suspense } from "react";
import AuthCallbackClient from "./auth-callback-client";

export default function AuthCallbackPage() {
  return (
    <Suspense>
      <AuthCallbackClient />
    </Suspense>
  );
}

