'use client';

import Link from 'next/link';
import { useLanguage } from '../contexts/LanguageContext';

export default function Footer() {
  const { t, lang } = useLanguage();

  return (
    <>
      {/* CTA Trial Section */}
      <section style={{
        background: 'linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 50%, #F0F4FF 100%)',
        padding: '4rem 1rem', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle at 80% 30%, rgba(99,102,241,0.06) 0%, transparent 60%)', pointerEvents: 'none' }} />
        <div className="st-width" style={{ position: 'relative', zIndex: 1, textAlign: 'center', maxWidth: 560, margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(1.4rem,2.5vw,2rem)', fontWeight: 800, color: '#0F1E45', lineHeight: 1.25 }}>
            {lang === 'en' ? 'Ready to manage your classes smarter?' : 'ඔබේ පන්ති දැන්ම කළමනාකරණය කරන්න'}
          </h2>
          <p style={{ fontSize: 15, color: '#6B7280', marginTop: 12, lineHeight: 1.6 }}>
            {lang === 'en'
              ? 'Join hundreds of tutors and schools across Sri Lanka using Easyclz every day. Start your 14-day free trial, no credit card needed.'
              : 'ශ්‍රී ලංකාව පුරා ගුරුවරුන් සහ පාසල් Easyclz භාවිතා කරයි. දින 14 නොමිලේ ආරම්භ කරන්න.'}
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 28, flexWrap: 'wrap' }}>
            <a href="https://xoox.easyclz.com" target="_blank" rel="noopener noreferrer" className="cta-btn-primary">
              {lang === 'en' ? 'Start Free Trial' : 'නොමිලේ ආරම්භ කරන්න'}
            </a>
            <a href="https://wa.me/94776465456" target="_blank" rel="noopener noreferrer" className="cta-btn-secondary">
              {lang === 'en' ? 'Chat on WhatsApp' : 'WhatsApp හරහා අමතන්න'}
            </a>
          </div>
        </div>
      </section>

      <footer style={{
        background: 'linear-gradient(180deg, #0F1E45 0%, #0A1628 100%)',
        padding: '4rem 0 2rem',
      }}>
        <div className="st-width">
          <div style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr 1fr 1fr',
            gap: '2rem',
            paddingBottom: '2.5rem',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
          className="footer-grid"
          >
            {/* Brand column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Link href="/" style={{ fontSize: 26, fontWeight: 700, color: '#fff', textDecoration: 'none' }}>
                Easyclz
              </Link>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, maxWidth: 240 }}>
                {lang === 'en' ? 'Manage Your Classes. Focus on Teaching.' : 'ඔබේ පන්ති කළමනාකරණය. ඉගැන්වීමට අවධානය.'}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                <a href="tel:+94776465456" style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', textDecoration: 'none', transition: 'color 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                  onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.6)'}
                >+94 77 646 5456</a>
                <a href="mailto:hello@easyclz.com" style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', textDecoration: 'none', transition: 'color 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                  onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.6)'}
                >hello@easyclz.com</a>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>Kurunegala, Sri Lanka</span>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                {[
                  { href: 'https://wa.me/94776465456', label: 'WhatsApp', path: 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z' },
                  { href: 'https://facebook.com', label: 'Facebook', path: 'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z' },
                  { href: 'https://instagram.com', label: 'Instagram', path: 'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z' },
                ].map((s) => (
                  <a key={s.label} target="_blank" rel="noopener noreferrer" href={s.href} aria-label={s.label}
                    style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.5)', transition: 'all 0.15s', textDecoration: 'none' }}
                    className="social-icon"
                  >
                    <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d={s.path} /></svg>
                  </a>
                ))}
              </div>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>
                {lang === 'en' ? 'Made for Sri Lanka 🇱🇰' : 'ශ්‍රී ලංකාව සඳහා සෑදූ 🇱🇰'}
              </p>
            </div>

            {/* Company */}
            <div>
              <h4 style={{ fontSize: 13, fontWeight: 700, color: '#fff', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 16 }}>
                {lang === 'en' ? 'Company' : 'සමාගම'}
              </h4>
              <ul style={{ display: 'flex', flexDirection: 'column', gap: 10, listStyle: 'none', padding: 0, margin: 0 }}>
                {[
                  { href: '/pricing', label: lang === 'en' ? 'Pricing' : 'මිල ගණන්' },
                  { href: '/blog', label: 'Blog' },
                  { href: '/guides', label: lang === 'en' ? 'How To Guides' : 'මාර්ගෝපදේශ' },
                  { href: '/contact', label: lang === 'en' ? 'Contact us' : 'අප අමතන්න' },
                  { href: '/pricing#faq', label: 'FAQ' },
                ].map((link) => (
                  <li key={link.href}><Link href={link.href} className="footer-link">{link.label}</Link></li>
                ))}
              </ul>
            </div>

            {/* Features */}
            <div>
              <h4 style={{ fontSize: 13, fontWeight: 700, color: '#fff', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 16 }}>
                {lang === 'en' ? 'Features' : 'විශේෂාංග'}
              </h4>
              <ul style={{ display: 'flex', flexDirection: 'column', gap: 10, listStyle: 'none', padding: 0, margin: 0 }}>
                {[
                  { href: '/features/student', label: lang === 'en' ? 'Student Management' : 'ශිෂ්‍ය කළමනාකරණය' },
                  { href: '/features/payment', label: lang === 'en' ? 'Payment Management' : 'ගෙවීම් කළමනාකරණය' },
                  { href: '/features/exam', label: lang === 'en' ? 'Exam Monitoring' : 'විභාග අධීක්ෂණය' },
                  { href: '/features/attendance', label: lang === 'en' ? 'Attendance' : 'පැමිණීම' },
                  { href: '/features/teacher-app', label: lang === 'en' ? 'Teacher Mobile App' : 'ගුරු ජංගම යෙදවුම' },
                  { href: '/features/assistant-app', label: lang === 'en' ? 'Assistant App' : 'සහයක යෙදුම' },
                  { href: '/features/notes', label: lang === 'en' ? 'Notes & Files' : 'සටහන් සහ ගොනු' },
                  { href: '/features/chat', label: lang === 'en' ? 'Class Chat' : 'Class කතාබස' },
                  { href: '/features/portal', label: lang === 'en' ? 'Student Portal' : 'ශිෂ්‍ය ද්වාරය' },
                ].map((link) => (
                  <li key={link.href}><Link href={link.href} className="footer-link">{link.label}</Link></li>
                ))}
              </ul>
            </div>

            {/* Service */}
            <div>
              <h4 style={{ fontSize: 13, fontWeight: 700, color: '#fff', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 16 }}>
                {lang === 'en' ? 'Service' : 'සේවාව'}
              </h4>
              <ul style={{ display: 'flex', flexDirection: 'column', gap: 10, listStyle: 'none', padding: 0, margin: 0 }}>
                {[
                  { href: '/privacy', label: lang === 'en' ? 'Privacy Policy' : 'රහස්‍යතා ප්‍රතිපත්තිය' },
                  { href: '/terms', label: lang === 'en' ? 'Terms & Conditions' : 'නියම සහ කොන්දේසි' },
                ].map((link) => (
                  <li key={link.href}><Link href={link.href} className="footer-link">{link.label}</Link></li>
                ))}
              </ul>
            </div>
          </div>

          {/* Bottom bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '1.25rem', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>
              © 2026 Easyclz. All rights reserved.
            </span>
          </div>
        </div>
      </footer>

      <style>{`
        .cta-btn-primary {
          display: inline-flex; align-items: center; gap: 8px;
          background: linear-gradient(135deg, #6366F1, #8B5CF6);
          color: #fff; font-weight: 700; font-size: 14px;
          padding: 12px 28px; border-radius: 12px; text-decoration: none;
          transition: transform 0.18s, box-shadow 0.18s;
          box-shadow: 0 4px 14px rgba(99,102,241,0.3);
        }
        .cta-btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(99,102,241,0.35);
        }
        .cta-btn-secondary {
          display: inline-flex; align-items: center; gap: 8px;
          background: transparent; color: #6366F1; font-weight: 600; font-size: 14px;
          padding: 12px 28px; border-radius: 12px; text-decoration: none;
          border: 1.5px solid #6366F1;
          transition: all 0.18s;
        }
        .cta-btn-secondary:hover {
          background: rgba(99,102,241,0.06);
          transform: translateY(-2px);
        }
        .footer-link {
          font-size: 13.5px; color: rgba(255,255,255,0.5); text-decoration: none;
          transition: color 0.15s;
        }
        .footer-link:hover { color: #fff; }
        .social-icon:hover {
          background: rgba(99,102,241,0.15) !important;
          color: #818CF8 !important;
          transform: translateY(-1px);
        }
        @media (max-width: 768px) {
          .footer-grid { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 480px) {
          .footer-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </>
  );
}
