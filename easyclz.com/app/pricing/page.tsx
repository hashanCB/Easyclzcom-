'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { useLanguage } from '../contexts/LanguageContext';
import { Check, ChevronDown, Sparkles, Star, HelpCircle, ArrowRight, Shield, RefreshCw, Headphones, Globe } from 'lucide-react';

const plans = [
  {
    name: 'Starter', nameSi: 'ස්ටාටර්',
    students: 'Up to 50 students', studentsSi: 'ශිෂ්‍යයන් 50 දක්වා',
    price: 1, lkr: 300,
    features: ['Up to 50 students', 'Full platform access', 'Teacher Mobile App', 'Student Portal', 'Payments, Attendance, Exams, and Reports', 'SMS features and support'],
    featuresSi: ['ශිෂ්‍යයන් 50 දක්වා', 'සම්පූර්ණ පද්ධති ප්‍රවේශය', 'ගුරු ජංගම යෙදවුම', 'ශිෂ්‍ය ද්වාරය', 'ගෙවීම්, පැමිණීම, විභාග සහ වාර්තා', 'SMS විශේෂාංග සහ සහාය'],
  },
  {
    name: 'Basic', nameSi: 'බේසික්',
    students: 'Up to 100 students', studentsSi: 'ශිෂ්‍යයන් 100 දක්වා',
    price: 3, lkr: 900,
    features: ['Up to 100 students', 'Full platform access', 'Teacher Mobile App', 'Student Portal', 'Payments, Attendance, Exams, and Reports', 'SMS features and support'],
    featuresSi: ['ශිෂ්‍යයන් 100 දක්වා', 'සම්පූර්ණ පද්ධති ප්‍රවේශය', 'ගුරු ජංගම යෙදවුම', 'ශිෂ්‍ය ද්වාරය', 'ගෙවීම්, පැමිණීම, විභාග සහ වාර්තා', 'SMS විශේෂාංග සහ සහාය'],
  },
  {
    name: 'Growth', nameSi: 'ග්‍රෝත්',
    students: 'Up to 500 students', studentsSi: 'ශිෂ්‍යයන් 500 දක්වා',
    price: 8, lkr: 2400,
    popular: true,
    features: ['Up to 500 students', 'Full platform access', 'Teacher Mobile App', 'Student Portal', 'Payments, Attendance, Exams, and Reports', 'SMS features and support'],
    featuresSi: ['ශිෂ්‍යයන් 500 දක්වා', 'සම්පූර්ණ පද්ධති ප්‍රවේශය', 'ගුරු ජංගම යෙදවුම', 'ශිෂ්‍ය ද්වාරය', 'ගෙවීම්, පැමිණීම, විභාග සහ වාර්තා', 'SMS විශේෂාංග සහ සහාය'],
  },
  {
    name: 'Unlimited', nameSi: 'අසීමිත',
    students: 'Unlimited students', studentsSi: 'අසීමිත ශිෂ්‍යයන්',
    price: 25, lkr: 7500,
    features: ['Unlimited students', 'Full platform access', 'Teacher Mobile App', 'Student Portal', 'Payments, Attendance, Exams, and Reports', 'SMS features and support'],
    featuresSi: ['අසීමිත ශිෂ්‍යයන්', 'සම්පූර්ණ පද්ධති ප්‍රවේශය', 'ගුරු ජංගම යෙදවුම', 'ශිෂ්‍ය ද්වාරය', 'ගෙවීම්, පැමිණීම, විභාග සහ වාර්තා', 'SMS විශේෂාංග සහ සහාය'],
  },
];

const faqs = [
  {
    q: 'Is there a free trial?',
    a: 'Yes! You can start with any plan free for 14 days. No credit card required.',
    qSi: 'නොමිලේ අත්හදා බැලීමක් තිබේද?',
    aSi: 'ඔව්! ඕනෑම සැලැස්මක් සමඟ දින 14ක් නොමිලේ ආරම්භ කළ හැකිය. ක්‍රෙඩිට් කාඩ්පත් අවශ්‍ය නොවේ.',
  },
  {
    q: 'Can I switch plans later?',
    a: 'Absolutely. You can upgrade or downgrade your plan at any time.',
    qSi: 'පසුව සැලසුම් වෙනස් කළ හැකිද?',
    aSi: 'නිසැකව. ඕනෑම විටෙක ඔබේ සැලැස්ම upgrade හෝ downgrade කළ හැකිය.',
  },
  {
    q: 'Are prices in LKR?',
    a: 'Prices are listed in USD. You can pay via local payment methods at the LKR equivalent.',
    qSi: 'මිල ගණන් LKR හිද?',
    aSi: 'USD හි ලැයිස්තුගත කෙරී ඇත. LKR ප්‍රතිතුලිතයෙන් දේශීය ගෙවීම් ක්‍රම හරහා ගෙවිය හැකිය.',
  },
  {
    q: 'What payment methods do you accept?',
    a: 'We accept credit/debit cards, bank transfers, and local Sri Lankan payment methods.',
    qSi: 'ඔබ පිළිගන්නේ ගෙවීම් ක්‍රම මොනවාද?',
    aSi: 'ක්‍රෙඩිට්/ඩෙබිට් කාඩ්, බැංකු හුවමාරු, සහ දේශීය ශ්‍රී ලාංකික ගෙවීම් ක්‍රම පිළිගනිමු.',
  },
  {
    q: 'Is my data secure?',
    a: 'Yes. All data is encrypted and securely stored. We take privacy very seriously.',
    qSi: 'මගේ දත්ත ආරක්ෂිතද?',
    aSi: 'ඔව්. සියලු දත්ත සංකේතාත්මක ලෙස ගබඩා කෙරේ. අපි රහස්‍යතාව ඉතා බැරෑරුම් ලෙස සළකමු.',
  },
  {
    q: 'Do I need to sign a long-term contract?',
    a: 'No. Easyclz is a monthly subscription. Cancel anytime with one month\'s notice.',
    qSi: 'දිගු කාලීන ගිවිසුමකට අත්සන් කළ යුතුද?',
    aSi: 'නැත. Easyclz මාසික දායකත්ව සේවාවකි. ඕනෑම විටෙක නවත්වන්න.',
  },
];

const guarantees = [
  {
    icon: RefreshCw,
    titleEn: '14-Day Free Trial',
    titleSi: 'දින 14 නොමිලේ',
    descEn: 'Try any plan free for 14 days. No credit card needed.',
    descSi: 'ඕනෑම සැලැස්මක් දින 14ක් නොමිලේ. Credit card අවශ්‍ය නැත.',
  },
  {
    icon: Shield,
    titleEn: 'Cancel Anytime',
    titleSi: 'ඕනෑම විටෙක අවලංගු කරන්න',
    descEn: 'No long-term contracts. Cancel with one month\'s notice.',
    descSi: 'දිගු කාලීන ගිවිසුම් නැත.',
  },
  {
    icon: Headphones,
    titleEn: 'Local Support',
    titleSi: 'දේශීය සහාය',
    descEn: 'Sinhala & English support via phone, email, and WhatsApp.',
    descSi: 'සිංහල සහ ඉංග්‍රීසි සහාය (ඇමතුම්, ඊමේල්, WhatsApp).',
  },
  {
    icon: Globe,
    titleEn: 'Offline First',
    titleSi: 'ඕෆ්ලයින් මුලින්',
    descEn: 'Works without internet on iOS & Android. Syncs when online.',
    descSi: 'iOS හා Android මත අන්තර්ජාලය නොමැතිව ක්‍රියා කරයි.',
  },
];

export default function PricingPage() {
  const { t, lang } = useLanguage();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div>
      <Header />

      {/* ── Hero ── */}
      <section style={{
        padding: '8rem 0 3rem',
        background: 'linear-gradient(180deg, #F8FAFF 0%, #EEF2FF 50%, #fff 100%)',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle at 70% 40%, rgba(99,102,241,0.04) 0%, transparent 50%)', pointerEvents: 'none' }} />
        <div className="st-width" style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: '#EEF2FF', border: '1px solid rgba(99,102,241,0.12)',
              padding: '5px 14px', borderRadius: 9999, marginBottom: 16,
            }}>
              <Sparkles size={14} color="#6366F1" strokeWidth={2.5} />
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', color: '#6366F1' }}>
                {lang === 'en' ? 'Simple Pricing' : 'සරල මිල ගණන්'}
              </span>
            </div>
            <h1 style={{
              fontSize: 'clamp(1.75rem, 4vw, 3rem)',
              fontWeight: 800, color: '#0F1E45',
              letterSpacing: '-0.025em', lineHeight: 1.1,
            }}>
              {lang === 'en' ? (
                <>Simple, <span style={{ background: 'linear-gradient(135deg, #6366F1, #8B5CF6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>honest pricing</span></>
              ) : (
                <>සරල, <span style={{ background: 'linear-gradient(135deg, #6366F1, #8B5CF6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>සාධාරණ මිල</span></>
              )}
            </h1>
            <p style={{ fontSize: 15, color: '#6B7280', lineHeight: 1.7, marginTop: 10 }}>
              {lang === 'en'
                ? 'No hidden fees. Cancel anytime. Start with a 14-day free trial, no credit card required.'
                : 'සැඟවුණු ගාස්තු නැත. ඕනෑම විටෙක අවලංගු කරන්න. දින 14ක් නොමිලේ ආරම්භ කරන්න.'}
            </p>
          </div>
        </div>
      </section>

      {/* ── Pricing Cards ── */}
      <section style={{ padding: '2rem 0 4rem' }}>
        <div className="st-width">
          <div className="pricing-grid" style={{
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.25rem',
            alignItems: 'start',
          }}>
            {plans.map((plan) => {
              const isPopular = plan.popular;
              return (
                <div key={plan.name} className="pricing-card" style={{
                  background: isPopular
                    ? 'linear-gradient(135deg, #0F1E45 0%, #1E3A5F 100%)'
                    : '#fff',
                  border: isPopular
                    ? '1px solid rgba(99,102,241,0.15)'
                    : '1px solid rgba(229,231,235,0.6)',
                  borderRadius: 20,
                  boxShadow: isPopular
                    ? '0 12px 40px rgba(15,30,69,0.16), 0 2px 8px rgba(99,102,241,0.08)'
                    : '0 4px 16px rgba(15,30,69,0.04)',
                  position: 'relative',
                  overflow: 'visible',
                  transition: 'transform 0.25s, box-shadow 0.25s, border-color 0.25s',
                }}>
                  {isPopular && (
                    <div style={{
                      position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)',
                      background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
                      color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
                      padding: '5px 18px', borderRadius: 9999, whiteSpace: 'nowrap',
                      boxShadow: '0 4px 12px rgba(99,102,241,0.25)',
                      display: 'flex', alignItems: 'center', gap: 5,
                    }}>
                      <Star size={11} fill="currentColor" strokeWidth={2} />
                      {lang === 'en' ? 'Most Popular' : 'වඩාත් ජනප්‍රිය'}
                    </div>
                  )}

                  <div style={{ padding: isPopular ? '1.75rem 1.5rem 0' : '1.75rem 1.5rem 0' }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: isPopular ? '#fff' : '#0F1E45' }}>
                      {lang === 'en' ? plan.name : plan.nameSi}
                    </div>
                    <div style={{ fontSize: 13, color: isPopular ? 'rgba(255,255,255,0.5)' : '#6B7280', marginTop: 3 }}>
                      {lang === 'en' ? plan.students : plan.studentsSi}
                    </div>
                  </div>

                  <div style={{ padding: '1rem 1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                      <span style={{ fontSize: 34, fontWeight: 800, color: isPopular ? '#fff' : '#0F1E45', letterSpacing: '-0.03em' }}>
                        ${plan.price}
                      </span>
                      <span style={{ fontSize: 13, color: isPopular ? 'rgba(255,255,255,0.4)' : '#9CA3AF' }}>
                        /mo
                      </span>
                    </div>
                    <div style={{ fontSize: 12.5, color: isPopular ? 'rgba(255,255,255,0.35)' : '#9CA3AF', marginTop: 2 }}>
                      LKR {plan.lkr.toLocaleString()}/mo
                    </div>
                  </div>

                  <div style={{ height: 1, background: isPopular ? 'rgba(255,255,255,0.06)' : '#F3F4F6', margin: '0 1.5rem' }} />

                  <ul style={{
                    padding: '1.25rem 1.5rem',
                    display: 'flex', flexDirection: 'column', gap: 10,
                    flex: 1,
                  }}>
                    {(lang === 'en' ? plan.features : plan.featuresSi).map((f) => (
                      <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <span style={{
                          width: 20, height: 20, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: isPopular ? 'rgba(99,102,241,0.2)' : '#EEF2FF',
                        }}>
                          <Check size={11} strokeWidth={3} color={isPopular ? '#818CF8' : '#6366F1'} />
                        </span>
                        <span style={{
                          fontSize: 13, fontWeight: 500, lineHeight: 1.5,
                          color: isPopular ? 'rgba(255,255,255,0.75)' : '#4B5563',
                        }}>
                          {f}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <div style={{ padding: '0 1.5rem 1.5rem' }}>
                    <a
                      href="https://xoox.easyclz.com"
                      target="_blank" rel="noopener noreferrer"
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        padding: '12px 0', borderRadius: 12,
                        fontSize: 14, fontWeight: 700, textDecoration: 'none',
                        background: isPopular ? 'linear-gradient(135deg, #6366F1, #8B5CF6)' : 'transparent',
                        color: isPopular ? '#fff' : '#6366F1',
                        border: isPopular ? 'none' : '1.5px solid #6366F1',
                        transition: 'opacity 0.15s, transform 0.15s',
                      }}
                      className="pricing-cta-btn"
                    >
                      {lang === 'en' ? (isPopular ? 'Start Free Trial' : 'Get Started') : (isPopular ? 'නොමිලේ ආරම්භ' : 'ආරම්භ කරන්න')}
                      <ArrowRight size={15} strokeWidth={2.5} />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footnote */}
          <div style={{
            textAlign: 'center', marginTop: '2rem',
            fontSize: 12.5, color: '#9CA3AF', lineHeight: 1.6,
          }}>
            {lang === 'en'
              ? '* All plans include full platform access. Choose based on your student count.'
              : '* සියලු මිල ගණන් USD හි. LKR ප්‍රතිතුලිතය ලබා ගත හැකිය.'}
          </div>
        </div>
      </section>

      {/* ── Payment Gateway ── */}
      <section style={{ padding: '2rem 0', background: '#fff' }}>
        <div className="st-width">
          <div style={{
            background: '#F8FAFF', borderRadius: 20,
            border: '1px solid rgba(99,102,241,0.08)',
            padding: '2rem 2.5rem',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexWrap: 'wrap', gap: '1.5rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 14,
                background: 'linear-gradient(135deg, #EEF2FF, #E0E7FF)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth="2">
                  <rect x="1" y="4" width="22" height="16" rx="2" />
                  <line x1="1" y1="10" x2="23" y2="10" />
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0F1E45' }}>
                  {lang === 'en' ? 'Secure payments powered by' : 'ආරක්ෂිත ගෙවීම් මගින්'}
                </div>
                <div style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>
                  {lang === 'en'
                    ? 'Your payment info is encrypted and processed securely via Stripe.'
                    : 'ඔබේ ගෙවීම් තොරතුරු Stripe හරහා සංකේතාත්මකව සුරක්ෂිත කෙරේ.'}
                </div>
              </div>
            </div>
            <Image
              src="/logo/stripe.png"
              alt="Stripe"
              width={120}
              height={36}
              style={{ width: 120, height: 'auto', objectFit: 'contain', flexShrink: 0 }}
            />
          </div>
        </div>
      </section>

      {/* ── Trust/Guarantee row ── */}
      <section style={{ padding: '3rem 0', background: '#F8FAFF' }}>
        <div className="st-width">
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem',
          }}>
            {guarantees.map((g) => (
              <div key={g.titleEn} style={{
                background: '#fff', borderRadius: 16,
                border: '1px solid rgba(229,231,235,0.5)',
                padding: '1.5rem', textAlign: 'center',
                transition: 'transform 0.2s, box-shadow 0.2s',
              }} className="guarantee-card">
                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 12px',
                }}>
                  <g.icon size={20} color="#6366F1" strokeWidth={2} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0F1E45', marginBottom: 4 }}>
                  {lang === 'en' ? g.titleEn : g.titleSi}
                </div>
                <div style={{ fontSize: 12.5, color: '#6B7280', lineHeight: 1.5 }}>
                  {lang === 'en' ? g.descEn : g.descSi}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section style={{ padding: '5rem 0', background: '#fff' }}>
        <div className="st-width" style={{ maxWidth: 720, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <h2 style={{ fontSize: 'clamp(1.25rem, 2.5vw, 1.75rem)', fontWeight: 800, color: '#0F1E45', letterSpacing: '-0.02em' }}>
              {lang === 'en' ? 'Frequently Asked Questions' : 'නිතර අසන ප්‍රශ්න'}
            </h2>
            <p style={{ fontSize: 14, color: '#6B7280', marginTop: 6 }}>
              {lang === 'en' ? 'Everything you need to know about Easyclz pricing.' : 'Easyclz මිල ගණන් පිළිබඳ ඔබ දැනගත යුතු සියල්ල.'}
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {faqs.map((faq, i) => {
              const isOpen = openFaq === i;
              return (
                <div key={i} style={{
                  background: isOpen ? '#F8FAFF' : '#fff',
                  border: isOpen ? '1px solid rgba(99,102,241,0.12)' : '1px solid #F3F4F6',
                  borderRadius: 14, overflow: 'hidden',
                  transition: 'background 0.2s, border-color 0.2s',
                }}>
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : i)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '1rem 1.25rem', border: 'none', background: 'transparent', cursor: 'pointer',
                      textAlign: 'left', gap: 12,
                    }}
                  >
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#0F1E45', lineHeight: 1.4 }}>
                      {lang === 'en' ? faq.q : faq.qSi}
                    </span>
                    <ChevronDown size={18} color="#9CA3AF" strokeWidth={2}
                      style={{
                        flexShrink: 0,
                        transition: 'transform 0.25s',
                        transform: isOpen ? 'rotate(180deg)' : 'none',
                      }}
                    />
                  </button>
                  <div style={{
                    maxHeight: isOpen ? 200 : 0,
                    opacity: isOpen ? 1 : 0,
                    transition: 'max-height 0.3s ease, opacity 0.25s ease, padding 0.3s ease',
                    overflow: 'hidden',
                    padding: isOpen ? '0 1.25rem 1rem' : '0 1.25rem',
                  }}>
                    <p style={{ fontSize: 13.5, color: '#6B7280', lineHeight: 1.7 }}>
                      {lang === 'en' ? faq.a : faq.aSi}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{
        padding: '4rem 0',
        background: 'linear-gradient(135deg, #0F1E45 0%, #1E3A5F 100%)',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle at 30% 50%, rgba(99,102,241,0.08) 0%, transparent 50%)', pointerEvents: 'none' }} />
        <div className="st-width" style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
          <h2 style={{ fontSize: 'clamp(1.25rem, 2.5vw, 1.75rem)', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
            {lang === 'en' ? 'Ready to simplify your class management?' : 'ඔබේ පන්ති කළමනාකරණය සරල කිරීමට සූදානම්ද?'}
          </h2>
          <p style={{ fontSize: 14, color: '#94A3B8', marginTop: 8, maxWidth: 440, margin: '8px auto 0' }}>
            {lang === 'en'
              ? 'Join hundreds of Sri Lankan teachers using Easyclz. Start your 14-day free trial today.'
              : 'ශ්‍රී ලංකාවේ ගුරුවරුන් සිය ගණනක් Easyclz භාවිතා කරයි. අදම ආරම්භ කරන්න.'}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: '1.5rem' }}>
            <a
              href="https://xoox.easyclz.com"
              target="_blank" rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
                color: '#fff', fontWeight: 700, fontSize: 14,
                padding: '14px 28px', borderRadius: 12, textDecoration: 'none',
                transition: 'opacity 0.15s, transform 0.15s',
              }}
              className="hover:opacity-90"
            >
              {lang === 'en' ? 'Start Free Trial' : 'නොමිලේ ආරම්භ කරන්න'}
              <ArrowRight size={16} strokeWidth={2.5} />
            </a>
            <Link href="/contact" style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: 'transparent', color: '#94A3B8',
              fontWeight: 600, fontSize: 14,
              padding: '14px 20px', borderRadius: 12, textDecoration: 'none',
              border: '1px solid rgba(255,255,255,0.1)',
              transition: 'color 0.15s, border-color 0.15s',
            }}
              className="hover:text-white hover:border-white/20">
              {lang === 'en' ? 'Contact Sales' : 'විකුණුම් අමතන්න'}
            </Link>
          </div>
        </div>
      </section>

      <Footer />

      <style>{`
        .pricing-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 20px 60px rgba(15,30,69,0.10) !important;
        }
        .pricing-card:hover {
          border-color: rgba(99,102,241,0.15) !important;
        }
        .pricing-cta-btn:hover {
          opacity: 0.85;
          transform: translateY(-1px);
        }
        .guarantee-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 8px 24px rgba(15,30,69,0.06);
        }
        @media (max-width: 1024px) {
          .pricing-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 640px) {
          .pricing-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
