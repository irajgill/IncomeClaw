import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'IncomeClaw',
  description: 'Five sovereign agents on 0G — built on SovereignClaw.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
