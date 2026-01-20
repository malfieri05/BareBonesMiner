import { Suspense } from "react";
import OneTapMiningClient from "./one-tap-mining-client";

export default function OneTapMiningPage() {
  return (
    <Suspense>
      <OneTapMiningClient />
    </Suspense>
  );
}

