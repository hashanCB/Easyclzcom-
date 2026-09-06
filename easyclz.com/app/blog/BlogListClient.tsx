'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useLanguage } from '../contexts/LanguageContext';
import { posts } from './data';

export default function BlogListClient() {
  const { lang } = useLanguage();

  return (
    <section className="blog-width py-10">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {posts.map((post) => (
          <Link
            key={post.key}
            href={`/blog/${post.key}`}
            className="group"
            style={{
              display: 'flex', flexDirection: 'column', gap: 14,
              borderRadius: 16, border: '1px solid rgba(229,231,235,0.7)',
              textDecoration: 'none', background: '#fff', overflow: 'hidden',
              transition: 'box-shadow 0.2s, border-color 0.2s, transform 0.2s',
            }}
          >
            <div style={{ width: '100%', aspectRatio: '16 / 9', position: 'relative', background: '#F3F4F6' }}>
              <Image src={post.img} alt={lang === 'en' ? post.titleEn : post.titleSi} fill style={{ objectFit: 'cover' }} />
            </div>
            <div style={{ padding: '0 1.25rem 1.25rem' }}>
              <p style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 600, marginBottom: 8 }}>
                {post.date}
              </p>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: '#0F1E45', lineHeight: 1.4 }}>
                {lang === 'en' ? post.titleEn : post.titleSi}
              </h3>
              <p style={{ fontSize: 13.5, color: '#6B7280', lineHeight: 1.6, marginTop: 8 }}>
                {(lang === 'en' ? post.excerptEn : post.excerptSi)}
              </p>
              <div style={{
                marginTop: 16, display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 13, fontWeight: 700, color: '#6366F1',
              }}>
                {lang === 'en' ? 'Read more' : 'තවත් කියවන්න'}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
