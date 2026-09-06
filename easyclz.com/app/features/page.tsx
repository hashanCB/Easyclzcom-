'use client';

import Image from 'next/image';
import Link from 'next/link';
import Header from '../components/Header';
import Footer from '../components/Footer';
import PageHero from '../components/PageHero';
import { useLanguage } from '../contexts/LanguageContext';
import { features } from './data';

export default function FeaturesPage() {
  const { lang } = useLanguage();

  return (
    <div>
      <Header />

      <PageHero
        titleEn="Everything you need to run your classes"
        titleSi="ඔබේ පන්ති පවත්වාගෙන යාමට අවශ්‍ය සියල්ල"
        subEn="Ten tools in one system. Click any feature below to see it in detail."
        subSi="එක් පද්ධතියක් තුළ tools දහයක්. විස්තර බැලීමට පහත විශේෂාංගයක් ක්ලික් කරන්න."
      />

      {/* Feature grid */}
      <section className="st-width py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f, i) => (
            <Link
              key={f.key}
              href={`/features/${f.key}`}
              className="group"
              style={{
                display: 'flex', flexDirection: 'column', gap: 12,
                padding: '1.5rem', borderRadius: 16,
                border: '1px solid rgba(229,231,235,0.7)',
                textDecoration: 'none', background: '#fff',
                transition: 'box-shadow 0.2s, border-color 0.2s, transform 0.2s',
              }}
            >
              <div style={{
                width: 44, height: 44, borderRadius: 12, fontSize: 20,
                background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {f.icon}
              </div>
              <div>
                <p className="bentfit-info-label" style={{ marginBottom: 4 }}>
                  {lang === 'en' ? `Feature ${i + 1}` : `විශේෂාංගය ${i + 1}`}
                </p>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: '#0F1E45' }}>
                  {lang === 'en' ? f.titleEn : f.titleSi}
                </h3>
              </div>
              <p style={{ fontSize: 13.5, color: '#6B7280', lineHeight: 1.6 }}>
                {(lang === 'en' ? f.descEn : f.descSi).slice(0, 110)}…
              </p>
              <div style={{
                marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 13, fontWeight: 700, color: '#6366F1',
              }}>
                {lang === 'en' ? 'View details' : 'විස්තර බලන්න'}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <Footer />
    </div>
  );
}
