import { ReactNode } from 'react';
import './review.css';
export const dynamic = 'force-dynamic';
export default function ReviewLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="referrer" content="no-referrer" />
      </head>
      <body>{children}</body>
    </html>
  );
}
