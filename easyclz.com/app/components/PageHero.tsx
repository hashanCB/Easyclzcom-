'use client';

import { useLanguage } from '../contexts/LanguageContext';

export default function PageHero({
  titleEn,
  titleSi,
  subEn,
  subSi,
  width = 'st-width',
}: {
  titleEn: string;
  titleSi: string;
  subEn?: string;
  subSi?: string;
  width?: string;
}) {
  const { lang } = useLanguage();
  const sub = lang === 'en' ? subEn : subSi;

  return (
    <section className="bg-trial-gradient pt-28 sm:pt-32 pb-10">
      <div className={width}>
        <h1 className="h1 text-left">{lang === 'en' ? titleEn : titleSi}</h1>
        {sub && (
          <p style={{ fontSize: 15, color: '#6B7280', marginTop: 12, lineHeight: 1.6, maxWidth: 580 }}>
            {sub}
          </p>
        )}
      </div>
    </section>
  );
}
