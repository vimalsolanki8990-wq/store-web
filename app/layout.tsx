import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "જય વછરાજ જનરલ સ્ટોર - શુદ્ધ અને તાજું કરિયાણું, ઝાંઝમેર",
  description: "ઝાંઝમેર ગામના દરેક પરિવાર માટે તાજું અને ઉત્તમ કરિયાણું",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="gu" className="dark h-full">
      <head>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"
          integrity="sha512-DTOQO9RWCH3ppGqcWaEA1BIZOC6xxalwEsw9c2QQeAIftl+Vegovlnee1c9QX4TctnWMn13TZye+giMm8e2LwA=="
          crossOrigin="anonymous"
          referrerPolicy="no-referrer"
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Noto+Sans+Gujarati:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-slate-50 dark:bg-[#070b14] text-slate-800 dark:text-slate-100 min-h-full flex flex-col antialiased">
        {children}
      </body>
    </html>
  );
}