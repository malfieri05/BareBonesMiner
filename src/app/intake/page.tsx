import { Suspense } from "react";
import IntakeClient from "./intake-client";

export default function IntakePage() {
  return (
    <Suspense>
      <IntakeClient />
    </Suspense>
  );
}

