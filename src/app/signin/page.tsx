import { Suspense } from "react";
import Box from "@mui/material/Box";

import { SignInForm } from "./signin-form";

export default function SignInPage() {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        px: 3,
      }}
    >
      <Suspense>
        <SignInForm />
      </Suspense>
    </Box>
  );
}
