'use client';

import { useState } from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import PageHero from '../components/PageHero';
import { useLanguage } from '../contexts/LanguageContext';

const inputCls =
  'w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-darkNavy placeholder-gray-400 outline-none transition-all focus:border-primary focus:bg-white focus:ring-2 focus:ring-blue-100';

export default function ContactPage() {
  const { lang } = useLanguage();
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: '', email: '', phone: '', institute: '', students: '', message: '',
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await new Promise((r) => setTimeout(r, 1200));
    setLoading(false);
    setSubmitted(true);
  };

  return (
    <div style={{ backgroundColor: '#f8f9fc', minHeight: '100vh' }}>
      <Header />

      <PageHero
        titleEn="We'd love to hear from you"
        titleSi="ඔබෙන් ඇසීමට කැමතියි"
        subEn="Have a question about Easyclz? Fill out the form or reach us directly on WhatsApp for the fastest response."
        subSi="Easyclz ගැන ප්‍රශ්නයක් තිබේද? පෝරමය භාවිත කරන්න හෝ WhatsApp හරහා සෘජුව සම්බන්ධ වන්න."
      />

      {/* ── CONTACT METHOD CARDS ── */}
      <section className="st-width" style={{ paddingTop: '2.5rem', paddingBottom: '2.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>

          {[
            {
              icon: (
                <svg style={{ width: 24, height: 24, color: '#fff' }} fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
              ),
              iconBg: '#22C55E', label: 'WhatsApp', value: '+94 77 646 5456',
              badge: lang === 'en' ? 'Fastest reply' : 'වේගවත්ම', badgeColor: '#15803D', badgeBg: '#F0FDF4',
              href: 'https://wa.me/94776465456',
            },
            {
              icon: (
                <svg style={{ width: 24, height: 24, color: '#fff' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
                </svg>
              ),
              iconBg: '#2563EB', label: lang === 'en' ? 'Phone' : 'දුරකථන', value: '+94 77 646 5456',
              badge: lang === 'en' ? 'Mon–Sat 8am–8pm' : 'සඳු–සෙන 8am–8pm', badgeColor: '#1D4ED8', badgeBg: '#EFF6FF',
              href: 'tel:+94776465456',
            },
            {
              icon: (
                <svg style={{ width: 24, height: 24, color: '#fff' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                </svg>
              ),
              iconBg: '#7C3AED', label: 'Email', value: 'hello@easyclz.com',
              badge: lang === 'en' ? 'Reply in 24h' : 'පැය 24 ඇතුළත', badgeColor: '#6D28D9', badgeBg: '#F5F3FF',
              href: 'mailto:hello@easyclz.com',
            },
            {
              icon: (
                <svg style={{ width: 24, height: 24, color: '#9CA3AF' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
              ),
              iconBg: '#F3F4F6', label: lang === 'en' ? 'Location' : 'ස්ථානය', value: 'Kurunegala, Sri Lanka',
              badge: lang === 'en' ? 'Serving all Sri Lanka 🇱🇰' : 'ශ්‍රී ලංකාව 🇱🇰', badgeColor: '#6B7280', badgeBg: '#F9FAFB',
              href: null,
            },
          ].map((c, i) => {
            const inner = (
              <div key={i} style={{
                backgroundColor: '#fff', borderRadius: '1rem', padding: '1.5rem',
                display: 'flex', flexDirection: 'column', gap: '0.75rem',
                boxShadow: '0 1px 3px 0 rgba(0,0,0,.06), 0 1px 2px 0 rgba(0,0,0,.04)',
                transition: 'box-shadow .2s',
                cursor: c.href ? 'pointer' : 'default',
              }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: c.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {c.icon}
                </div>
                <div>
                  <p style={{ fontWeight: 600, color: '#0F1E45', fontSize: '0.875rem' }}>{c.label}</p>
                  <p style={{ color: '#6B7280', fontSize: '0.875rem', marginTop: 2 }}>{c.value}</p>
                  <span style={{ display: 'inline-block', marginTop: 8, fontSize: '0.75rem', fontWeight: 500, color: c.badgeColor, backgroundColor: c.badgeBg, padding: '2px 10px', borderRadius: 9999 }}>
                    {c.badge}
                  </span>
                </div>
              </div>
            );
            return c.href
              ? <a key={i} href={c.href} target={c.href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" style={{ textDecoration: 'none' }}>{inner}</a>
              : inner;
          })}

        </div>
      </section>

      {/* ── FORM CARD ── */}
      <section className="st-width" style={{ paddingBottom: '5rem' }}>
        <div style={{
          backgroundColor: '#fff', borderRadius: '1.5rem', overflow: 'hidden',
          boxShadow: '0 4px 24px 0 rgba(0,0,0,.07)',
          display: 'flex', flexDirection: 'row',
        }}>

          {/* ── Left dark panel ── */}
          <div style={{
            width: '38%', flexShrink: 0,
            backgroundColor: '#0F1E45',
            padding: '2.5rem 2rem',
            display: 'flex', flexDirection: 'column', gap: '2rem',
          }}>
            <div>
              <h2 style={{ fontSize: '1.375rem', fontWeight: 700, color: '#fff', lineHeight: 1.3, marginBottom: '0.75rem' }}>
                {lang === 'en' ? 'Start your free trial today' : 'අදම නොමිලේ trial ආරම්භ'}
              </h2>
              <p style={{ fontSize: '0.875rem', color: '#94A3B8', lineHeight: 1.6 }}>
                {lang === 'en'
                  ? '14 days free. No credit card required. Set up in minutes.'
                  : 'දින 14 නොමිලේ. Credit card අවශ්‍ය නැත.'}
              </p>
            </div>

            {/* Plan list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              <p style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#475569', marginBottom: '0.25rem' }}>
                {lang === 'en' ? 'Plans' : 'සැලසුම්'}
              </p>
              {[
                { students: lang === 'en' ? 'Up to 50 students' : 'ශිෂ්‍ය 50 දක්වා', price: '$1/mo', lkr: 'LKR 300', dot: '#3B82F6' },
                { students: lang === 'en' ? 'Up to 100 students' : 'ශිෂ්‍ය 100 දක්වා', price: '$3/mo', lkr: 'LKR 900', dot: '#6366F1' },
                { students: lang === 'en' ? 'Up to 500 students' : 'ශිෂ්‍ය 500 දක්වා', price: '$8/mo', lkr: 'LKR 2,400', dot: '#8B5CF6' },
                { students: lang === 'en' ? 'Unlimited students' : 'සීමාවකින් තොරව', price: '$25/mo', lkr: 'LKR 7,500', dot: '#A855F7' },
              ].map((p, i) => (
                <div key={i} style={{
                  backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '0.75rem',
                  padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: p.dot, flexShrink: 0 }} />
                    <span style={{ fontSize: '0.8125rem', color: '#CBD5E1' }}>{p.students}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#fff' }}>{p.price}</span>
                    <span style={{ fontSize: '0.7rem', color: '#64748B', marginLeft: 4 }}>{p.lkr}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Trust strip */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: 'auto' }}>
              <div style={{ display: 'flex' }}>
                {[['KP','#2563EB'],['NS','#7C3AED'],['TJ','#059669']].map(([init, bg], i) => (
                  <div key={i} style={{
                    width: 36, height: 36, borderRadius: '50%', border: '2px solid #0F1E45',
                    backgroundColor: bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.7rem', fontWeight: 700, color: '#fff',
                    marginLeft: i > 0 ? -10 : 0,
                  }}>{init}</div>
                ))}
              </div>
              <div>
                <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#fff' }}>100+ teachers</p>
                <p style={{ fontSize: '0.75rem', color: '#64748B' }}>{lang === 'en' ? 'trust Easyclz' : 'Easyclz භාවිතා කරයි'}</p>
              </div>
            </div>
          </div>

          {/* ── Right form panel ── */}
          <div style={{ flex: 1, padding: '2.5rem 2.5rem 2.5rem 2.5rem', backgroundColor: '#fff' }}>

            {submitted ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: '1.5rem', padding: '4rem 0' }}>
                <div style={{ width: 80, height: 80, borderRadius: '50%', backgroundColor: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg style={{ width: 40, height: 40, color: '#22C55E' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
                  </svg>
                </div>
                <div>
                  <h2 className="h2 text-darkNavy" style={{ marginBottom: '0.5rem' }}>
                    {lang === 'en' ? 'Message Sent!' : 'පණිවිඩය යැවූ!'}
                  </h2>
                  <p className="p text-neutralGray-500" style={{ maxWidth: '24rem' }}>
                    {lang === 'en'
                      ? "Thanks for reaching out. We'll get back to you within 24 hours."
                      : 'ස්තූතියි. පැය 24 ඇතුළත ඔබ හා සම්බන්ධ වෙනවා.'}
                  </p>
                </div>
                <a
                  href="https://wa.me/94776465456"
                  target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: '#22C55E', color: '#fff', fontWeight: 600, padding: '0.75rem 1.5rem', borderRadius: '0.75rem', textDecoration: 'none' }}
                >
                  <svg style={{ width: 20, height: 20 }} fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  {lang === 'en' ? 'Chat on WhatsApp' : 'WhatsApp හරහා කතා කරන්න'}
                </a>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: '1.75rem' }}>
                  <h2 className="h2 text-darkNavy">
                    {lang === 'en' ? 'Send us a message' : 'අපට පණිවිඩ යවන්න'}
                  </h2>
                  <p style={{ fontSize: '0.875rem', color: '#6B7280', marginTop: '0.25rem' }}>
                    {lang === 'en'
                      ? "Fill out the form and we'll be in touch shortly."
                      : 'පෝරමය පුරවන්න, ඉක්මනින් සම්බන්ධ වෙමු.'}
                  </p>
                </div>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.125rem' }}>

                  {/* Row 1 */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#0F1E45', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                        {lang === 'en' ? 'Your Name' : 'ඔබේ නම'} <span style={{ color: '#E53935' }}>*</span>
                      </label>
                      <input name="name" type="text" required value={form.name} onChange={handleChange}
                        placeholder={lang === 'en' ? 'e.g. Kasun Perera' : 'නිදසුන: කසුන් පෙරේරා'}
                        className={inputCls} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#0F1E45', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                        {lang === 'en' ? 'Institute / School' : 'ආයතනය'}
                      </label>
                      <input name="institute" type="text" value={form.institute} onChange={handleChange}
                        placeholder={lang === 'en' ? 'School or class name' : 'පාසල හෝ පන්තිය'}
                        className={inputCls} />
                    </div>
                  </div>

                  {/* Row 2 */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#0F1E45', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                        Email <span style={{ color: '#E53935' }}>*</span>
                      </label>
                      <input name="email" type="email" required value={form.email} onChange={handleChange}
                        placeholder="hello@example.com" className={inputCls} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#0F1E45', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                        {lang === 'en' ? 'Phone / WhatsApp' : 'දුරකථන / WhatsApp'}
                      </label>
                      <input name="phone" type="text" value={form.phone} onChange={handleChange}
                        placeholder="+94 77 000 0000" className={inputCls} />
                    </div>
                  </div>

                  {/* Row 3 */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#0F1E45', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                      {lang === 'en' ? 'Number of Students' : 'ශිෂ්‍ය ගණන'}
                    </label>
                    <select name="students" value={form.students} onChange={handleChange} className={inputCls}>
                      <option value="">{lang === 'en' ? 'Select student range' : 'ශිෂ්‍ය ගණන තෝරන්න'}</option>
                      <option value="1-50">1–50 {lang === 'en' ? 'students' : 'ශිෂ්‍යයන්'}, $1/mo (LKR 300)</option>
                      <option value="51-100">51–100 {lang === 'en' ? 'students' : 'ශිෂ්‍යයන්'}, $3/mo (LKR 900)</option>
                      <option value="101-500">101–500 {lang === 'en' ? 'students' : 'ශිෂ්‍යයන්'}, $8/mo (LKR 2,400)</option>
                      <option value="500+">500+ {lang === 'en' ? 'students' : 'ශිෂ්‍යයන්'}, $25/mo (LKR 7,500)</option>
                    </select>
                  </div>

                  {/* Row 4 */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#0F1E45', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                      {lang === 'en' ? 'Message' : 'පණිවිඩය'}
                    </label>
                    <textarea name="message" rows={4} value={form.message} onChange={handleChange}
                      placeholder={lang === 'en' ? 'Tell us about your class or any questions...' : 'ඔබේ පන්තිය ගැන හෝ ප්‍රශ්නය ගැන කියන්න...'}
                      className={`${inputCls} resize-none`} />
                  </div>

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={loading}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      backgroundColor: '#0F1E45', color: '#fff', fontWeight: 600,
                      padding: '0.875rem 1.5rem', borderRadius: '0.75rem', border: 'none',
                      cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
                      fontSize: '0.9375rem', transition: 'background-color .2s',
                    }}
                  >
                    {loading ? (
                      <>
                        <svg style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} fill="none" viewBox="0 0 24 24">
                          <circle style={{ opacity: .25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path style={{ opacity: .75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                        </svg>
                        {lang === 'en' ? 'Sending...' : 'යවමින්...'}
                      </>
                    ) : (
                      lang === 'en' ? 'Send Message →' : 'පණිවිඩය යවන්න →'
                    )}
                  </button>

                  {/* Divider + WhatsApp */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ flex: 1, height: 1, backgroundColor: '#F1F5F9' }} />
                    <span style={{ fontSize: '0.75rem', color: '#94A3B8', whiteSpace: 'nowrap' }}>
                      {lang === 'en' ? 'or reach us directly' : 'හෝ සෘජුව'}
                    </span>
                    <div style={{ flex: 1, height: 1, backgroundColor: '#F1F5F9' }} />
                  </div>

                  <a
                    href="https://wa.me/94776465456"
                    target="_blank" rel="noopener noreferrer"
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      backgroundColor: '#F0FDF4', border: '1.5px solid #86EFAC',
                      color: '#16A34A', fontWeight: 600, fontSize: '0.9375rem',
                      padding: '0.75rem 1.5rem', borderRadius: '0.75rem',
                      textDecoration: 'none', transition: 'background-color .2s',
                    }}
                  >
                    <svg style={{ width: 20, height: 20, color: '#22C55E' }} fill="currentColor" viewBox="0 0 24 24">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                    {lang === 'en' ? 'Chat on WhatsApp' : 'WhatsApp හරහා කතා කරන්න'}
                  </a>

                </form>
              </>
            )}
          </div>

        </div>
      </section>

      <Footer />

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
