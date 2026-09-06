'use client';

import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import { useLanguage } from '../../contexts/LanguageContext';
import { features } from '../data';

export default function FeatureDetailClient({ slug }: { slug: string }) {
  const { lang } = useLanguage();
  const index = features.findIndex((f) => f.key === slug);

  if (index === -1) {
    notFound();
  }

  const feature = features[index];
  const prev = features[(index - 1 + features.length) % features.length];
  const next = features[(index + 1) % features.length];

  return (
    <div>
      <Header />

      <section className="st-width pt-28 pb-6">
        <Link href="/features" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#6366F1', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M19 12H5M11 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          {lang === 'en' ? 'All Features' : 'සියලු විශේෂාංග'}
        </Link>
      </section>

      <section className="st-width py-6">
        <div className={`flex flex-col ${feature.reverse ? 'md:flex-row-reverse' : 'md:flex-row'} gap-10 items-stretch justify-between`}>
          <div className="md:w-1/2">
            <div className="ws-img-gradient-rounded overflow-hidden flex justify-center items-center" style={{ background: 'none' }}>
              <Image src={feature.img} alt={feature.titleEn} className="sf-img" width={500} height={400} />
            </div>
          </div>
          <div className="md:w-1/2 flex justify-center items-center">
            <div className="flex flex-col gap-6">
              <div>
                <p className="bentfit-info-label text-left">
                  {lang === 'en' ? `Feature ${index + 1} of ${features.length}` : `විශේෂාංගය ${index + 1} / ${features.length}`}
                </p>
                <h1 className="h2 text-left mt-2">
                  {lang === 'en' ? feature.titleEn : feature.titleSi}
                </h1>
              </div>
              <p className="ws-list-item-subtext">
                {lang === 'en' ? feature.descEn : feature.descSi}
              </p>
              <ul className="list-disc list-inside space-y-2 ws-list-item-subtext">
                {(lang === 'en' ? feature.subEn : feature.subSi).map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
              <Link href="/contact" className="st-btn-outlined-red-trailing-icon self-start">
                {lang === 'en' ? 'Get Started' : 'ආරම්භ කරන්න'}
                <svg xmlns="http://www.w3.org/2000/svg" width="40" height="24" viewBox="0 0 40 24" fill="none">
                  <path d="M2 12H38M38 12L29.5 3.5M38 12L29.5 20.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Prev / Next */}
      <section className="st-width py-10">
        <div className="flex items-stretch gap-4">
          <Link href={`/features/${prev.key}`} style={{
            flex: 1, display: 'flex', alignItems: 'center', gap: 10,
            padding: '14px 16px', borderRadius: 14, border: '1px solid rgba(229,231,235,0.7)',
            textDecoration: 'none', transition: 'border-color 0.15s, box-shadow 0.15s',
          }}>
            <span style={{ fontSize: 18 }}>←</span>
            <span>
              <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {lang === 'en' ? 'Previous' : 'පෙරදී'}
              </span>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: '#0F1E45' }}>
                {lang === 'en' ? prev.titleEn : prev.titleSi}
              </span>
            </span>
          </Link>
          <Link href={`/features/${next.key}`} style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, textAlign: 'right',
            padding: '14px 16px', borderRadius: 14, border: '1px solid rgba(229,231,235,0.7)',
            textDecoration: 'none', transition: 'border-color 0.15s, box-shadow 0.15s',
          }}>
            <span>
              <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {lang === 'en' ? 'Next' : 'ඊළඟ'}
              </span>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: '#0F1E45' }}>
                {lang === 'en' ? next.titleEn : next.titleSi}
              </span>
            </span>
            <span style={{ fontSize: 18 }}>→</span>
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
