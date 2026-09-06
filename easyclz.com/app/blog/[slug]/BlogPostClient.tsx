'use client';

import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import { useLanguage } from '../../contexts/LanguageContext';
import { posts } from '../data';

export default function BlogPostClient({ slug }: { slug: string }) {
  const { lang } = useLanguage();
  const post = posts.find((p) => p.key === slug);

  if (!post) {
    notFound();
  }

  const title = lang === 'en' ? post.titleEn : post.titleSi;
  const body = lang === 'en' ? post.bodyEn : post.bodySi;

  return (
    <div>
      <Header />

      <section className="blog-width pt-28 pb-6">
        <Link href="/blog" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#6366F1', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M19 12H5M11 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          {lang === 'en' ? 'All Posts' : 'සියලු ලිපි'}
        </Link>
      </section>

      <section className="blog-width pb-6">
        <p style={{ fontSize: 13, color: '#9CA3AF', fontWeight: 600 }}>
          {post.author} · {post.date}
        </p>
        <h1 className="h1 mt-2">{title}</h1>
      </section>

      <section className="blog-width pb-10">
        <div className="ws-img-gradient-rounded overflow-hidden" style={{ background: 'none', width: '100%', position: 'relative', aspectRatio: '16 / 7' }}>
          <Image src={post.img} alt={title} fill style={{ objectFit: 'cover' }} className="sf-img" />
        </div>
      </section>

      <section className="blog-width pb-20">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, width: '100%' }}>
          {body.map((paragraph, i) => (
            <p key={i} style={{ maxWidth: 'none', width: '100%', textAlign: 'left', fontSize: 16, fontWeight: 400, lineHeight: 1.8, color: 'var(--neutral-gray-500)' }}>
              {paragraph}
            </p>
          ))}
        </div>

        <Link href="/contact" className="st-btn-outlined-red-trailing-icon" style={{ marginTop: 32 }}>
          {lang === 'en' ? 'Get Started' : 'ආරම්භ කරන්න'}
          <svg xmlns="http://www.w3.org/2000/svg" width="40" height="24" viewBox="0 0 40 24" fill="none">
            <path d="M2 12H38M38 12L29.5 3.5M38 12L29.5 20.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      </section>

      <Footer />
    </div>
  );
}
