import type { Metadata } from 'next';
import Script from 'next/script';
import { LanguageProvider } from './contexts/LanguageContext';

export const metadata: Metadata = {
  title: 'Easyclz – Manage Your Classes. Focus on Teaching.',
  description:
    'Easyclz is a class management system for Sri Lankan tutors and schools. Manage students, attendance, monthly fees, exams and SMS notifications, all in one place. Based in Kurunegala, serving all Sri Lanka.',
  keywords: [
    'class management Sri Lanka',
    'tuition management system',
    'Kurunegala tuition software',
    'student management system',
    'school management Sri Lanka',
    'attendance tracking',
    'exam monitoring',
    'teacher mobile app',
    'SMS notifications text.lk',
  ],
  icons: {
    icon: '/icon.png',
    apple: '/icon.png',
  },
  openGraph: {
    title: 'Easyclz, Smart Class Management for Sri Lanka',
    description:
      'Manage students, payments, attendance, and exams from one dashboard. Works offline too.',
    siteName: 'Easyclz',
    locale: 'en_LK',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="stylesheet" href="/css/output.css" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css?family=Open+Sans:300,400,600,700&display=swap"
          rel="stylesheet"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@splidejs/splide@2.4.12/dist/css/splide.min.css"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.css"
        />
      </head>
      <body className="relative pt-[0.1px]">
        <Script
          src="https://cdn.jsdelivr.net/npm/@splidejs/splide@2.4.12/dist/js/splide.min.js"
          strategy="afterInteractive"
        />
        <Script
          src="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js"
          strategy="afterInteractive"
        />
        <LanguageProvider>
          {children}
        </LanguageProvider>

        {/* Cookie banner */}
        <div
          id="cookieBanner"
          className="fixed bottom-0 left-0 bg-white z-50 shadow-card w-full"
        >
          <div className="flex items-center gap-x-10 justify-center p-3 mr-16">
            <p>
              We use cookies to make your experience better.{' '}
              <a href="/cookie-notice" rel="nofollow" className="underline">
                By using Easyclz.com, you accept our cookie notice terms.
              </a>
            </p>
            <div>
              <button
                className="st-btn hover:bg-navy100 active:bg-navy80 bg-darkNavy whitespace-nowrap"
                onClick={undefined}
                id="cookieOkBtn"
              >
                OK
              </button>
            </div>
          </div>
        </div>

        <Script src="/scripts/easyclz-dom.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
