import localFont from 'next/font/local';

// Keep the existing family/styles while avoiding a network request at build time.
export const jakartaSans = localFont({
  src: [
    { path: './assets/jakarta-normal.woff2', weight: '200 800', style: 'normal' },
    { path: './assets/jakarta-italic.woff2', weight: '200 800', style: 'italic' },
  ],
  display: 'swap',
});
