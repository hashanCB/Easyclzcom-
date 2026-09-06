'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  GraduationCap,
  Users,
  CalendarCheck,
  ClipboardList,
  Smartphone,
  UserCog,
  CreditCard,
  BarChart3,
  FileText,
  MessageCircle,
  Newspaper,
  BookOpen,
  Sparkles,
  ArrowRight,
  Menu,
  X,
  Home,
  ChevronDown,
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

const featureGroups = [
  {
    group: 'Manage',
    groupSi: 'කළමනාකරණය',
    accent: '#4F46E5',
    items: [
      { label: 'Student Management', labelSi: 'ශිෂ්‍ය කළමනාකරණය', desc: 'Full profiles, QR IDs, history', descSi: 'ගිනුම්, QR ID, ඉතිහාසය', href: '/features/student', icon: Users },
      { label: 'Attendance', labelSi: 'පැමිණීම', desc: 'QR scan, offline, absent SMS', descSi: 'QR scan, offline, SMS', href: '/features/attendance', icon: CalendarCheck },
      { label: 'Exam Monitoring', labelSi: 'විභාග අධීක්ෂණය', desc: 'Create exams, marks, reports', descSi: 'විභාග, ලකුණු, වාර්තා', href: '/features/exam', icon: ClipboardList },
      { label: 'Teacher Mobile App', labelSi: 'ගුරු ජංගම යෙදවුම', desc: 'iOS & Android, works offline', descSi: 'iOS හා Android, offline', href: '/features/teacher-app', icon: Smartphone },
      { label: 'Assistant App', labelSi: 'සහයක යෙදුම', desc: 'Limited access for helpers', descSi: 'සීමිත ප්‍රවේශය', href: '/features/assistant-app', icon: UserCog },
    ],
  },
  {
    group: 'Connect',
    groupSi: 'සම්බන්ධතා',
    accent: '#059669',
    items: [
      { label: 'Payment Management', labelSi: 'ගෙවීම් කළමනාකරණය', desc: 'Fees, tracking, invoices', descSi: 'ගාස්තු, නිරීක්ෂණය', href: '/features/payment', icon: CreditCard },
      { label: 'Reports & SMS', labelSi: 'වාර්තා සහ SMS', desc: 'Reports & auto SMS', descSi: 'වාර්තා සහ ස්වයංක්‍රීය SMS', href: '/features/reports', icon: BarChart3 },
      { label: 'Notes & Files', labelSi: 'සටහන් සහ ගොනු', desc: 'Upload PDFs, instant access', descSi: 'PDF upload, ක්ෂණික ප්‍රවේශය', href: '/features/notes', icon: FileText },
      { label: 'Class Chat', labelSi: 'Class කතාබස', desc: 'Announcements & replies', descSi: 'දැන්වීම් සහ පිළිතුරු', href: '/features/chat', icon: MessageCircle },
      { label: 'Student Portal', labelSi: 'ශිෂ්‍ය ද්වාරය', desc: 'OTP signup, class code join', descSi: 'OTP ලියාපදිංචිය', href: '/features/portal', icon: GraduationCap },
    ],
  },
];

const resourceLinks = [
  { href: '/blog', labelEn: 'Blog', labelSi: 'බ්ලොග්', descEn: 'Tips & updates from the team', descSi: 'ඉඟි සහ යාවත්කාලීන', icon: Newspaper },
  { href: '/guides', labelEn: 'How To Guides', labelSi: 'මාර්ගෝපදේශ', descEn: 'Step-by-step setup guides', descSi: 'පියවරෙන් පියවර මාර්ගෝපදේශ', icon: BookOpen },
];

export default function Header() {
  const { lang } = useLanguage();
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || (href !== '/' && pathname.startsWith(href));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const resourcesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen && !resourcesOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
      if (resourcesRef.current && !resourcesRef.current.contains(e.target as Node)) setResourcesOpen(false);
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setMenuOpen(false); setResourcesOpen(false); }
    };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [menuOpen, resourcesOpen]);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  return (
    <header style={{
      position: 'fixed', width: '100%', zIndex: 1000, top: 0, left: 0,
      transition: 'background 0.3s ease, box-shadow 0.3s ease, border-color 0.3s ease',
      background: scrolled
        ? 'rgba(255,255,255,0.88)'
        : 'rgba(255,255,255,0.50)',
      backdropFilter: 'blur(16px) saturate(1.8)',
      WebkitBackdropFilter: 'blur(16px) saturate(1.8)',
      borderBottom: scrolled ? '1px solid rgba(229,231,235,0.6)' : '1px solid transparent',
      boxShadow: scrolled
        ? '0 1px 3px rgba(15,30,69,0.04), 0 1px 2px rgba(15,30,69,0.03)'
        : 'none',
    }}>
      {/* Desktop */}
      <div className="st-width" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 68 }}>

        {/* ── Logo ── */}
        <Link href="/" aria-label="Easyclz home" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', flexShrink: 0, padding: '2px 0' }}>
          <div style={{
            width: 36, height: 36, borderRadius: 12,
            background: 'linear-gradient(135deg, #2563EB, #4F46E5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 16, fontWeight: 800,
            boxShadow: '0 2px 8px rgba(37,99,235,0.2)',
            transition: 'transform 0.2s ease',
          }}
            className="logo-icon"
          >E</div>
          <span style={{
            fontSize: 21, fontWeight: 800,
            background: 'linear-gradient(135deg, #0F1E45, #1E3A5F)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            letterSpacing: '-0.03em',
          }}>Easyclz</span>
        </Link>

        {/* ── Desktop nav ── */}
        <nav className="hidden lg:flex" style={{ alignItems: 'center', gap: 1 }}>

          {/* Features with mega-menu */}
          <div
            ref={menuRef}
            className="header-nav-item"
            onMouseEnter={() => { setMenuOpen(true); setResourcesOpen(false); }}
            onMouseLeave={() => setMenuOpen(false)}
            style={{ position: 'relative' }}
          >
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              className={`nav-btn${isActive('/features') ? ' nav-btn-active' : ''}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '8px 14px', borderRadius: 10,
                fontSize: 14, fontWeight: 600,
                color: isActive('/features') ? '#2563EB' : '#374151',
                background: 'transparent',
                border: 'none', cursor: 'pointer',
                letterSpacing: '-0.01em',
                transition: 'all 0.18s ease',
                position: 'relative',
              }}
            >
              {lang === 'en' ? 'Features' : 'විශේෂාංග'}
              <ChevronDown size={15} strokeWidth={2.5} className="nav-chevron" style={{
                transition: 'transform 0.25s ease',
                transform: menuOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              }} />
            </button>

            {/* Mega-menu */}
            <div
              className="mega-menu"
              onClick={() => setMenuOpen(false)}
              style={{
                position: 'absolute', top: 'calc(100% + 10px)', left: '50%', transform: 'translateX(-50%)',
                width: 780, background: '#fff', borderRadius: 20,
                border: '1px solid rgba(229,231,235,0.4)',
                boxShadow: '0 24px 80px rgba(15,30,69,0.12), 0 8px 24px rgba(0,0,0,0.04)',
                opacity: menuOpen ? 1 : 0, visibility: menuOpen ? 'visible' : 'hidden',
                transition: 'opacity 0.25s ease, visibility 0.25s ease, transform 0.25s ease',
                transformOrigin: 'top center',
                overflow: 'hidden',
              }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 260px', gap: 0 }}>
                {/* Col 1 */}
                <div style={{ padding: '1.5rem 1.25rem 1.5rem 1.5rem', borderRight: '1px solid #F3F4F6' }}>
                  <div style={{
                    fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                    color: featureGroups[0].accent, marginBottom: 14,
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: featureGroups[0].accent }} />
                    {lang === 'en' ? featureGroups[0].group : featureGroups[0].groupSi}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {featureGroups[0].items.map((f) => (
                      <Link key={f.href} href={f.href} className="megamenu-link">
                        <span className="megamenu-icon" style={{ backgroundColor: `${featureGroups[0].accent}10` }}>
                          <f.icon size={15} strokeWidth={2} style={{ color: featureGroups[0].accent }} />
                        </span>
                        <span>
                          <span className="megamenu-label">{lang === 'en' ? f.label : f.labelSi}</span>
                          <span className="megamenu-desc">{lang === 'en' ? f.desc : f.descSi}</span>
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
                {/* Col 2 */}
                <div style={{ padding: '1.5rem 1.25rem 1.5rem 1.5rem', borderRight: '1px solid #F3F4F6' }}>
                  <div style={{
                    fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                    color: featureGroups[1].accent, marginBottom: 14,
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: featureGroups[1].accent }} />
                    {lang === 'en' ? featureGroups[1].group : featureGroups[1].groupSi}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {featureGroups[1].items.map((f) => (
                      <Link key={f.href} href={f.href} className="megamenu-link">
                        <span className="megamenu-icon" style={{ backgroundColor: `${featureGroups[1].accent}10` }}>
                          <f.icon size={15} strokeWidth={2} style={{ color: featureGroups[1].accent }} />
                        </span>
                        <span>
                          <span className="megamenu-label">{lang === 'en' ? f.label : f.labelSi}</span>
                          <span className="megamenu-desc">{lang === 'en' ? f.desc : f.descSi}</span>
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
                {/* Col 3: CTA */}
                <div style={{
                  background: 'linear-gradient(135deg, #0F1E45 0%, #1E3A5F 100%)',
                  padding: '1.75rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 14,
                }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 14,
                    background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.15))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Sparkles size={22} strokeWidth={1.5} style={{ color: '#A5B4FC' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 17, fontWeight: 700, color: '#fff', lineHeight: 1.3, marginBottom: 4 }}>
                      {lang === 'en' ? 'Everything you need' : 'ඔබට අවශ්‍ය සියල්ල'}
                    </div>
                    <div style={{ fontSize: 12.5, color: '#94A3B8', lineHeight: 1.6 }}>
                      {lang === 'en' ? '14-day free trial. No credit card. Set up in minutes.' : 'දින 14 නොමිලේ. Credit card අවශ්‍ය නැත.'}
                    </div>
                  </div>
                  <a href="https://xoox.easyclz.com" target="_blank" rel="noopener noreferrer" className="megamenu-cta" style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    padding: '11px 0', borderRadius: 12,
                    background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
                    color: '#fff', fontWeight: 700, fontSize: 13.5, textDecoration: 'none',
                    marginTop: 4, transition: 'all 0.2s ease',
                  }}>
                    {lang === 'en' ? 'Start Free Trial' : 'නොමිලේ ආරම්භ කරන්න'}
                    <ArrowRight size={14} strokeWidth={2.5} className="megamenu-cta-arrow" style={{ transition: 'transform 0.2s ease' }} />
                  </a>
                  <Link href="/features" className="megamenu-footer-link">
                    {lang === 'en' ? 'View all features' : 'සියලු විශේෂාංග'}
                    <ArrowRight size={12} strokeWidth={2} />
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Pricing */}
          <Link href="/pricing" className={`nav-btn${isActive('/pricing') ? ' nav-btn-active' : ''}`} aria-current={isActive('/pricing') ? 'page' : undefined} style={{
            padding: '8px 14px', borderRadius: 10, fontSize: 14, fontWeight: 600,
            color: isActive('/pricing') ? '#2563EB' : '#374151', textDecoration: 'none', letterSpacing: '-0.01em',
            background: 'transparent',
            transition: 'all 0.18s ease',
            position: 'relative',
          }}>
            {lang === 'en' ? 'Pricing' : 'මිල ගණන්'}
          </Link>

          {/* Resources dropdown */}
          <div
            ref={resourcesRef}
            className="header-nav-item"
            onMouseEnter={() => { setResourcesOpen(true); setMenuOpen(false); }}
            onMouseLeave={() => setResourcesOpen(false)}
            style={{ position: 'relative' }}
          >
            <button
              onClick={() => setResourcesOpen((v) => !v)}
              aria-expanded={resourcesOpen}
              className="nav-btn"
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '8px 14px', borderRadius: 10,
                fontSize: 14, fontWeight: 600,
                color: (isActive('/blog') || isActive('/guides')) ? '#2563EB' : '#374151',
                background: 'transparent',
                border: 'none', cursor: 'pointer',
                letterSpacing: '-0.01em',
                transition: 'all 0.18s ease',
              }}
            >
              {lang === 'en' ? 'Resources' : 'සම්පත්'}
              <ChevronDown size={15} strokeWidth={2.5} className="nav-chevron" style={{
                transition: 'transform 0.25s ease',
                transform: resourcesOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              }} />
            </button>

            <div
              className="resources-menu"
              onClick={() => setResourcesOpen(false)}
              style={{
                position: 'absolute', top: 'calc(100% + 10px)', right: 0,
                width: 340, background: '#fff', borderRadius: 18,
                border: '1px solid rgba(229,231,235,0.4)',
                boxShadow: '0 24px 80px rgba(15,30,69,0.12), 0 8px 24px rgba(0,0,0,0.04)',
                opacity: resourcesOpen ? 1 : 0, visibility: resourcesOpen ? 'visible' : 'hidden',
                transition: 'opacity 0.25s ease, visibility 0.25s ease, transform 0.25s ease',
                transformOrigin: 'top right',
                padding: '0.75rem',
              }}
            >
              {resourceLinks.map((r) => (
                <Link key={r.href} href={r.href} className="megamenu-link">
                  <span className="megamenu-icon" style={{ backgroundColor: '#EEF2FF' }}>
                    <r.icon size={16} strokeWidth={2} style={{ color: '#4F46E5' }} />
                  </span>
                  <span>
                    <span className="megamenu-label">{lang === 'en' ? r.labelEn : r.labelSi}</span>
                    <span className="megamenu-desc">{lang === 'en' ? r.descEn : r.descSi}</span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </nav>

        {/* ── Right: CTA ── */}
        <div className="hidden lg:flex" style={{ alignItems: 'center' }}>
          <a href="https://student.easyclz.com/" target="_blank" rel="noopener noreferrer" className="header-primary-cta" style={{
            padding: '9px 18px', borderRadius: 12,
            background: 'linear-gradient(135deg, #0F1E45, #1E3A5F)',
            color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none',
            transition: 'all 0.2s ease',
            display: 'inline-flex', alignItems: 'center', gap: 7,
            boxShadow: '0 2px 8px rgba(15,30,69,0.2)',
          }}>
            <GraduationCap size={16} strokeWidth={2} />
            {lang === 'en' ? 'Student Portal' : 'ශිෂ්‍ය ද්වාරය'}
          </a>
        </div>

        {/* ── Mobile hamburger ── */}
        <button
          onClick={() => setMobileOpen(true)}
          className="mobile-hamburger"
          aria-label="Open menu"
          style={{
            alignItems: 'center', justifyContent: 'center',
            width: 42, height: 42, border: 'none', background: 'transparent',
            cursor: 'pointer', color: '#0F1E45', padding: 0,
            borderRadius: 10,
            transition: 'background 0.15s',
          }}
        >
          <Menu size={22} strokeWidth={2} />
        </button>
      </div>

      {/* ── Mobile drawer ── */}
      <>
        {/* Backdrop */}
        <div
          onClick={() => setMobileOpen(false)}
          className="mobile-backdrop"
          style={{
            position: 'fixed', inset: 0, zIndex: 1001,
            background: 'rgba(15,30,69,0.35)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            opacity: mobileOpen ? 1 : 0,
            visibility: mobileOpen ? 'visible' : 'hidden',
            transition: 'opacity 0.35s ease, visibility 0.35s ease',
          }}
        />

        {/* Drawer */}
        <div style={{
          position: 'fixed', top: 0, right: 0, width: 320, height: '100dvh',
          background: '#fff', zIndex: 1002,
          boxShadow: '-8px 0 40px rgba(15,30,69,0.12)',
          transform: mobileOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Mobile header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '20px 20px 16px', borderBottom: '1px solid #F3F4F6', flexShrink: 0,
          }}>
            <Link href="/" onClick={() => setMobileOpen(false)} style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none' }}>
              <div style={{
                width: 30, height: 30, borderRadius: 10,
                background: 'linear-gradient(135deg, #2563EB, #4F46E5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 13, fontWeight: 800,
              }}>E</div>
              <span style={{ fontSize: 18, fontWeight: 700, color: '#0F1E45', letterSpacing: '-0.02em' }}>Easyclz</span>
            </Link>
            <button
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
              style={{
                width: 38, height: 38, borderRadius: 10, border: 'none',
                background: '#F3F4F6', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#374151', transition: 'background 0.15s',
              }}
            >
              <X size={18} strokeWidth={2} />
            </button>
          </div>

          {/* Mobile nav links */}
          <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Link href="/" onClick={() => setMobileOpen(false)} className="mobile-nav-link">
                <span className="mobile-nav-icon">
                  <Home size={16} strokeWidth={2} style={{ color: '#4F46E5' }} />
                </span>
                {lang === 'en' ? 'Home' : 'මුල් පිටුව'}
              </Link>

              {featureGroups.map((group) => (
                <div key={group.group}>
                  <div style={{
                    padding: '12px 12px 8px', fontSize: 11, fontWeight: 700,
                    letterSpacing: '0.06em', textTransform: 'uppercase',
                    color: group.accent, display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: group.accent }} />
                    {lang === 'en' ? group.group : group.groupSi}
                  </div>
                  {group.items.map((item) => (
                    <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className="mobile-nav-item">
                      <span className="mobile-nav-icon-sm" style={{ backgroundColor: `${group.accent}10` }}>
                        <item.icon size={15} strokeWidth={2} style={{ color: group.accent }} />
                      </span>
                      <span>
                        <span className="mobile-nav-item-label">{lang === 'en' ? item.label : item.labelSi}</span>
                        <span className="mobile-nav-item-desc">{lang === 'en' ? item.desc : item.descSi}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              ))}

              <div style={{ borderTop: '1px solid #F3F4F6', margin: '8px 0', paddingTop: 8 }} />

              <Link href="/pricing" onClick={() => setMobileOpen(false)} className="mobile-nav-link">
                <span className="mobile-nav-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
                  </svg>
                </span>
                {lang === 'en' ? 'Pricing' : 'මිල ගණන්'}
              </Link>

              <div style={{
                padding: '12px 12px 8px', fontSize: 11, fontWeight: 700,
                letterSpacing: '0.06em', textTransform: 'uppercase',
                color: '#9CA3AF', display: 'flex', alignItems: 'center', gap: 6, marginTop: 4,
              }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: '#9CA3AF' }} />
                {lang === 'en' ? 'Resources' : 'සම්පත්'}
              </div>
              {resourceLinks.map((r) => (
                <Link key={r.href} href={r.href} onClick={() => setMobileOpen(false)} className="mobile-nav-item">
                  <span className="mobile-nav-icon-sm" style={{ backgroundColor: '#EEF2FF' }}>
                    <r.icon size={15} strokeWidth={2} style={{ color: '#4F46E5' }} />
                  </span>
                  <span>
                    <span className="mobile-nav-item-label">{lang === 'en' ? r.labelEn : r.labelSi}</span>
                    <span className="mobile-nav-item-desc">{lang === 'en' ? r.descEn : r.descSi}</span>
                  </span>
                </Link>
              ))}
            </div>
          </div>

          {/* Mobile bottom CTA */}
          <div style={{
            padding: '16px 20px 20px', borderTop: '1px solid #F3F4F6',
            flexShrink: 0,
          }}>
            <a href="https://student.easyclz.com/" target="_blank" rel="noopener noreferrer" className="mobile-drawer-primary" style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '14px 0', borderRadius: 12,
              background: 'linear-gradient(135deg, #0F1E45, #1E3A5F)',
              color: '#fff', fontWeight: 700, fontSize: 14, textDecoration: 'none',
              boxShadow: '0 2px 8px rgba(15,30,69,0.2)',
            }}>
              <GraduationCap size={17} strokeWidth={2} />
              {lang === 'en' ? 'Student Portal' : 'ශිෂ්‍ය ද්වාරය'}
            </a>
          </div>
        </div>
      </>

      <style>{`
        /* ── Logo ── */
        .logo-icon:hover { transform: scale(1.05); }

        /* ── Desktop nav ── */
        .nav-btn {
          position: relative;
        }
        .nav-btn::after {
          content: '';
          position: absolute;
          bottom: 2px; left: 50%;
          width: 0; height: 3px;
          border-radius: 2px;
          background: #2563EB;
          transition: all 0.25s ease;
          transform: translateX(-50%);
        }
        .nav-btn-active::after {
          width: 20px;
        }
        .nav-btn:hover { background: #F3F4F6; color: #0F1E45; }
        .header-nav-item:hover > .nav-btn { color: #2563EB; }
        .header-nav-item:hover > .nav-btn::after { width: 20px; background: #2563EB; }

        /* ── Chevron ── */
        .header-nav-item:hover .nav-chevron { transform: rotate(180deg); }

        /* ── Mega-menu ── */
        .mega-menu {
          transform: translateX(-50%) translateY(4px) scale(0.97);
        }
        .header-nav-item:hover .mega-menu,
        .header-nav-item:focus-within .mega-menu {
          opacity: 1 !important;
          visibility: visible !important;
          transform: translateX(-50%) translateY(0) scale(1) !important;
        }
        /* ── Resources dropdown — drops straight down, anchored under its button ── */
        .resources-menu {
          transform: translateY(4px) scale(0.97);
          transform-origin: top right;
        }
        .header-nav-item:hover .resources-menu,
        .header-nav-item:focus-within .resources-menu {
          opacity: 1 !important;
          visibility: visible !important;
          transform: translateY(0) scale(1) !important;
        }

        .megamenu-link {
          display: flex; align-items: flex-start; gap: 12px;
          padding: 9px 10px; border-radius: 10px;
          text-decoration: none;
          transition: all 0.15s ease;
        }
        .megamenu-link:hover {
          background: #F9FAFB;
          transform: translateX(2px);
        }
        .megamenu-icon {
          width: 32px; height: 32px; border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          margin-top: 1px;
          transition: transform 0.15s ease;
        }
        .megamenu-link:hover .megamenu-icon {
          transform: scale(1.08);
        }
        .megamenu-label {
          display: block; font-size: 13.5px; font-weight: 600;
          color: #0F1E45; line-height: 1.3;
        }
        .megamenu-desc {
          display: block; font-size: 11.5px; color: #9CA3AF;
          margin-top: 2px; line-height: 1.4;
        }
        .megamenu-cta:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 16px rgba(99,102,241,0.35);
        }
        .megamenu-cta:hover .megamenu-cta-arrow {
          transform: translateX(3px);
        }
        .megamenu-footer-link {
          display: flex; align-items: center; justify-content: center; gap: 6px;
          color: #94A3B8; font-size: 12.5px; text-decoration: none;
          transition: color 0.15s;
          padding: 4px 0;
        }
        .megamenu-footer-link:hover { color: #fff; }

        /* ── CTAs ── */
        .header-secondary-cta:hover {
          border-color: #A5B4FC;
          background: #F8FAFF;
          color: #2563EB;
        }
        .header-primary-cta:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 16px rgba(37,99,235,0.3) !important;
        }
        .header-primary-cta:active { transform: translateY(0) scale(0.98); }

        /* ── Focus visible (a11y) ── */
        .nav-btn:focus-visible,
        .header-primary-cta:focus-visible,
        .header-secondary-cta:focus-visible,
        .megamenu-link:focus-visible,
        .mobile-hamburger:focus-visible {
          outline: 2px solid #2563EB; outline-offset: 2px;
        }

        /* ── Responsive: hamburger ── */
        .mobile-hamburger { display: flex; }
        @media (min-width: 1024px) { .mobile-hamburger { display: none; } }
        .mobile-hamburger:hover { background: #F3F4F6; }

        /* ── Mobile nav ── */
        .mobile-nav-link {
          display: flex; align-items: center; gap: 12px;
          padding: 12px 12px; border-radius: 10px;
          text-decoration: none; font-size: 15; font-weight: 600; color: #0F1E45;
          transition: background 0.12s;
        }
        .mobile-nav-link:hover { background: #F9FAFB; }
        .mobile-nav-icon {
          width: 32px; height: 32px; border-radius: 10px;
          background: #EEF2FF; display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .mobile-nav-icon-sm {
          width: 30px; height: 30px; border-radius: 9px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .mobile-nav-item {
          display: flex; align-items: flex-start; gap: 10px;
          padding: 10px 12px; border-radius: 9px;
          text-decoration: none; transition: background 0.12s;
        }
        .mobile-nav-item:hover { background: #F9FAFB; }
        .mobile-nav-item-label {
          display: block; font-size: 14px; font-weight: 600;
          color: #0F1E45; line-height: 1.3;
        }
        .mobile-nav-item-desc {
          display: block; font-size: 12px; color: #9CA3AF;
          margin-top: 1px; line-height: 1.3;
        }
        .mobile-drawer-primary:hover {
          box-shadow: 0 4px 16px rgba(37,99,235,0.3) !important;
        }
        .mobile-drawer-secondary:hover {
          border-color: #A5B4FC;
          background: #F8FAFF;
        }

        /* ── Reduced motion ── */
        @media (prefers-reduced-motion: reduce) {
          header, .nav-btn::after, .megamenu-link, .megamenu-icon,
          .megamenu-cta, .megamenu-cta-arrow,
          .header-primary-cta, .header-secondary-cta,
          .mega-menu, .mobile-backdrop,
          div[style*="transition"] { transition: none !important; }
          .nav-chevron { transition: none !important; }
          .logo-icon:hover { transform: none; }
          .megamenu-link:hover { transform: none; }
          .megamenu-cta:hover { transform: none; }
          .header-primary-cta:hover { transform: none; }
          .megamenu-link:hover .megamenu-icon { transform: none; }
        }
      `}</style>
    </header>
  );
}
