import { Suspense } from "react";

import { AuthShell } from "~/app/_components/auth-shell";
import { SignInForm } from "./signin-form";

export default function SignInPage() {
  return (
    <AuthShell>
      <Suspense>
        <SignInForm />
      </Suspense>
    </AuthShell>
  );
}
