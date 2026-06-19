import { type Metadata } from "next";

import { TRPCReactProvider } from "~/trpc/react";
import { sans, serif } from "~/theme";
import { ThemeRegistry } from "./theme-registry";

export const metadata: Metadata = {
  title: "Liminal",
  description: "A virtual tabletop for your campaign.",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body>
        <ThemeRegistry>
          <TRPCReactProvider>{children}</TRPCReactProvider>
        </ThemeRegistry>
      </body>
    </html>
  );
}
