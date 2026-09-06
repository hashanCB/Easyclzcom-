'use client';

import Link from 'next/link';
import {
  Users,
  CalendarCheck,
  CreditCard,
  ClipboardList,
  FileText,
  GraduationCap,
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

const guides = [
  {
    href: '/features/student',
    icon: Users,
    step: '01',
    titleEn: 'Add your first students',
    titleSi: 'ඔබේ පළමු ශිෂ්‍යයන් එක් කරන්න',
    descEn: 'Create student profiles, send the class join link by SMS or WhatsApp, and give each student a QR ID card.',
    descSi: 'ශිෂ්‍ය පැතිකඩ සාදා, SMS හෝ WhatsApp මගින් class join link යවා, එක් එක් ශිෂ්‍යයාට QR ID කාඩ්පතක් දෙන්න.',
  },
  {
    href: '/features/attendance',
    icon: CalendarCheck,
    step: '02',
    titleEn: 'Mark attendance with QR',
    titleSi: 'QR මගින් පැමිණීම සලකුණු කරන්න',
    descEn: 'Scan a student\'s QR card at the door, even offline. Parents get an SMS the moment a student is absent.',
    descSi: 'ඉදිරිපිට QR කාඩ්පත scan කරන්න, offline වුවත්. නොපැමිණි විට දෙමාපියන්ට SMS යයි.',
  },
  {
    href: '/features/payment',
    icon: CreditCard,
    step: '03',
    titleEn: 'Collect and track payments',
    titleSi: 'ගෙවීම් එකතු කර නිරීක්ෂණය කරන්න',
    descEn: 'Set a standard fee, custom amount, or free seat per student, then track who has paid by class.',
    descSi: 'ශිෂ්‍යයෙකුට standard, custom හෝ free fee සකස් කර, class අනුව කවුද ගෙව්වේ දැකගන්න.',
  },
  {
    href: '/features/exam',
    icon: ClipboardList,
    step: '04',
    titleEn: 'Create exams and enter marks',
    titleSi: 'විභාග සාදා ලකුණු ඇතුළත් කරන්න',
    descEn: 'Create an exam, enter each student\'s mark once, and Easyclz builds mark sheets and reports for you.',
    descSi: 'විභාගයක් සාදා, එක් එක් ශිෂ්‍යයාගේ ලකුණු ඇතුළත් කරන්න, ලකුණු පත්‍ර ස්වයංක්‍රීයව සැකසේ.',
  },
  {
    href: '/features/notes',
    icon: FileText,
    step: '05',
    titleEn: 'Share notes and files',
    titleSi: 'සටහන් සහ ගොනු බෙදාගන්න',
    descEn: 'Upload a PDF after class and it appears instantly in the portal of every student in that class.',
    descSi: 'class එක ඉවර වූ පසු PDF upload කරන්න, එය සියලු ශිෂ්‍යයන්ගේ portal එකේ පෙන්වයි.',
  },
  {
    href: '/features/portal',
    icon: GraduationCap,
    step: '06',
    titleEn: 'Set up the student portal',
    titleSi: 'ශිෂ්‍ය ද්වාරය සකසන්න',
    descEn: 'Students sign up free with an OTP, join with the class code, and see marks, payments, notes and chat.',
    descSi: 'ශිෂ්‍යයන් OTP මගින් නොමිලේ ලියාපදිංචි වී class code එකෙන් join වී සියල්ල බලයි.',
  },
];

export default function GuidesClient() {
  const { lang } = useLanguage();

  return (
    <div>
      <section className="blog-width py-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {guides.map((g) => (
            <Link
              key={g.href}
              href={g.href}
              className="group"
              style={{
                display: 'flex', flexDirection: 'column', gap: 12,
                borderRadius: 16, border: '1px solid rgba(229,231,235,0.8)',
                textDecoration: 'none', background: '#fff', padding: '1.5rem',
                transition: 'box-shadow 0.2s, border-color 0.2s, transform 0.2s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{
                  width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                  background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <g.icon size={20} strokeWidth={2} style={{ color: '#6366F1' }} />
                </span>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#C7D2FE', letterSpacing: '0.05em' }}>
                  {g.step}
                </span>
              </div>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: '#0F1E45', lineHeight: 1.35 }}>
                {lang === 'en' ? g.titleEn : g.titleSi}
              </h3>
              <p style={{ fontSize: 13.5, color: '#6B7280', lineHeight: 1.6 }}>
                {lang === 'en' ? g.descEn : g.descSi}
              </p>
              <div style={{
                marginTop: 'auto', paddingTop: 6, display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 13, fontWeight: 700, color: '#6366F1',
              }}>
                {lang === 'en' ? 'Read the guide' : 'මාර්ගෝපදේශය කියවන්න'}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
