import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Luma Studio",
  description: "Estudio creativo personal conectado a la API de Magnific.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
