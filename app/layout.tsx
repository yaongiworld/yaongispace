import type { Metadata, Viewport } from "next";
import { fontVariables } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "야옹이월드",
  description: "토위와 양초의 공간",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Light only, by decision — no dark mode anywhere.
  colorScheme: "light",
  themeColor: "#fff4e9",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className={fontVariables}>
      <body>{children}</body>
    </html>
  );
}
