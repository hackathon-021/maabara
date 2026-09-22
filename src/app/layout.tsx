import type { Metadata, Viewport } from 'next';
import { Heebo } from 'next/font/google';
import './globals.css';

const heebo = Heebo({
  variable: '--font-heebo',
  subsets: ['hebrew', 'latin'],
  weight: ['400', '500', '700'],
});

export const metadata: Metadata = {
  title: 'המעברה',
  description: 'מערכת ניהול פינוי, הובלה וקליטת ציוד',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#5F42FF',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="he" dir="rtl" className={heebo.variable}>
      <body className="min-h-dvh bg-page text-ink antialiased">{children}</body>
    </html>
  );
}
