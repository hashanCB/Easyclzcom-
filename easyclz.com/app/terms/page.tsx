'use client';

import Header from '../components/Header';
import Footer from '../components/Footer';
import PageHero from '../components/PageHero';
import { useLanguage } from '../contexts/LanguageContext';

export default function TermsPage() {
  const { lang } = useLanguage();

  return (
    <div>
      <Header />

      <PageHero
        titleEn="Terms & Conditions"
        titleSi="නියම සහ කොන්දේසි"
        subEn="Last updated: January 2025 · Easyclz, Kurunegala, Sri Lanka"
        subSi="අවසන් යාවත්කාලීන කළේ: ජනවාරි 2025 · Easyclz, කුරුණෑගල, ශ්‍රී ලංකාව"
      />

      {/* Content */}
      <section className="st-width py-12">
        <div className="max-w-3xl space-y-10">

          {/* Intro */}
          <div>
            <p className="p text-neutralGray-600">
              {lang === 'en'
                ? 'These Terms & Conditions govern your use of the Easyclz platform, including the admin dashboard (xoox.easyclz.com), the student portal (student.easyclz.lk), and the Easyclz Teacher Mobile App. By creating an account or using our services, you agree to these terms. Please read them carefully.'
                : 'මෙම නියම සහ කොන්දේසි Easyclz platform, admin dashboard (xoox.easyclz.com), student portal (student.easyclz.lk) සහ ගුරු ජංගම යෙදවුම භාවිතය පාලනය කරයි. ගිණුමක් සෑදීමෙන් හෝ සේවා භාවිත කිරීමෙන් ඔබ මෙම නියමවලට එකඟ වේ.'}
            </p>
          </div>

          {[
            {
              title: lang === 'en' ? '1. Acceptance of Terms' : '1. නියම පිළිගැනීම',
              body: lang === 'en'
                ? [
                    'By accessing or using Easyclz, you confirm that you are at least 18 years old or have parental/guardian consent.',
                    'If you are registering on behalf of a school or organisation, you confirm that you have authority to bind that organisation to these terms.',
                    'We may update these terms at any time. Continued use after changes constitutes acceptance.',
                  ]
                : [
                    'Easyclz භාවිත කිරීමෙන් ඔබ අවම වශයෙන් වයස 18 ක් ඇති බව හෝ දෙමාපිය/භාරකාර අනුදැනුම ඇති බව තහවුරු කරයි.',
                    'පාසලක් හෝ ආයතනයක් නියෝජනය කරන්නේ නම්, ඔබට ඒ ආයතනය බැඳ ගැනීමේ අධිකාරය ඇති බව තහවුරු කරයි.',
                  ],
            },
            {
              title: lang === 'en' ? '2. Account Registration' : '2. ගිණුම් ලියාපදිංචිය',
              body: lang === 'en'
                ? [
                    'You must provide accurate and complete information when creating your account.',
                    'You are responsible for maintaining the security of your account credentials.',
                    'You must notify us immediately at hello@easyclz.com if you suspect unauthorised access.',
                    'Student portal accounts are created via OTP (one-time password), no separate registration is needed for students.',
                    'One admin account may manage multiple teachers under a single subscription.',
                  ]
                : [
                    'ගිණුමක් සෑදීමේදී නිවැරදි සහ සම්පූර්ණ තොරතුරු ලබා දිය යුතුය.',
                    'ඔබේ ගිණුම් credentials ආරක්ෂා කිරීමේ වගකීම ඔබ සතුය.',
                    'අනවසර ප්‍රවේශය සැකයක් ඇත්නම් hello@easyclz.com ට දැනුම් දෙන්න.',
                    'ශිෂ්‍ය portal ගිණුම් OTP හරහා සෑදේ, ශිෂ්‍යයන්ට වෙනම ලියාපදිංචිය අවශ්‍ය නැත.',
                  ],
            },
            {
              title: lang === 'en' ? '3. Subscription & Billing' : '3. සාමාජිකත්වය සහ බිල්',
              body: lang === 'en'
                ? [
                    'Easyclz offers monthly subscription plans: Starter ($1 / LKR 300), Basic ($3 / LKR 900), Growth ($8 / LKR 2,400), and Unlimited ($25 / LKR 7,500).',
                    'A 14-day free trial is available on all plans. No credit card required to start.',
                    'After the trial period, a paid subscription is required to continue using all features.',
                    'Payments are accepted via Visa and Mastercard.',
                    'All prices are listed in USD. LKR equivalents are shown for reference.',
                    'We do not offer refunds for partially used billing periods, but you can cancel at any time.',
                    'Downgrading your plan takes effect at the start of the next billing cycle.',
                  ]
                : [
                    'Easyclz මාසික සාමාජිකත්ව සැලසුම් ලබා දෙයි: Starter ($1), Basic ($3), Growth ($8), Unlimited ($25).',
                    'සියලු සැලසුම් සඳහා දින 14 නොමිලේ trial ලැබේ.',
                    'Visa සහ Mastercard හරහා ගෙවීම් කළ හැකිය.',
                    'ආපසු ගෙවීම් ලබා නොදෙනු ලැබේ, නමුත් ඕනෑම වේලාවක් cancel කළ හැකිය.',
                  ],
            },
            {
              title: lang === 'en' ? '4. Acceptable Use' : '4. පිළිගත හැකි භාවිතය',
              body: lang === 'en'
                ? [
                    'You agree to use Easyclz only for lawful purposes, managing classes, students, fees, and communications.',
                    'You must not attempt to hack, disrupt, or gain unauthorised access to any part of the system.',
                    'You must not upload offensive, illegal, or misleading content.',
                    'You must not use Easyclz to send spam SMS messages or harass students/parents.',
                    'Violation of these rules may result in immediate account suspension without refund.',
                  ]
                : [
                    'Easyclz නීතිමය අරමුණු සඳහා පමණක්, පන්ති, ශිෂ්‍යයන්, ගාස්තු කළමනාකරණයට, භාවිත කළ යුතුය.',
                    'පද්ධතිය hack කිරීමට හෝ අනවසර ප්‍රවේශ ලබා ගැනීමට උත්සාහ නොකළ යුතුය.',
                    'ඔබ නීති විරෝධී හෝ නොසලකා හරින content upload නොකළ යුතුය.',
                    'spam SMS හෝ ශිෂ්‍යයන්/දෙමාපියන් පෙළීම නොකළ යුතුය.',
                  ],
            },
            {
              title: lang === 'en' ? '5. Data Ownership' : '5. දත්ත හිමිකාරිත්වය',
              body: lang === 'en'
                ? [
                    'You own all data you enter into Easyclz, student records, attendance, fees, and exam results.',
                    'Easyclz does not claim ownership of your data.',
                    'Upon account termination, you may request a data export before deletion.',
                    'We retain anonymised usage data to improve our platform.',
                  ]
                : [
                    'ඔබ Easyclz ට ඇතුළු කරන සියලු දත්ත, ශිෂ්‍ය වාර්තා, පැමිණීම, ගාස්තු, ඔබට අයිත්.',
                    'Easyclz ඔබේ දත්ත හිමිකාරිත්වය ඉල්ලා නොගනී.',
                    'ගිණුම් නතර කිරීමෙන් පසු data export ඉල්ලා ගත හැකිය.',
                  ],
            },
            {
              title: lang === 'en' ? '6. Teacher Mobile App' : '6. ගුරු ජංගම යෙදවුම',
              body: lang === 'en'
                ? [
                    'The Easyclz Teacher App is available for Android and iOS devices.',
                    'The app works offline, data entered offline will sync when an internet connection is available.',
                    'Teachers are responsible for keeping the app updated to the latest version.',
                    'We are not responsible for data loss caused by device damage, theft, or failure to sync.',
                  ]
                : [
                    'ගුරු App Android සහ iOS devices සඳහා ලැබේ.',
                    'App ඕෆ්ලයින් ලෙස ක්‍රියා කරයි, internet ලැබෙන විට sync වේ.',
                    'App නවතම version ට update කිරීම ගුරුවරයාගේ වගකීමයි.',
                  ],
            },
            {
              title: lang === 'en' ? '7. Limitation of Liability' : '7. වගකීම් සීමාව',
              body: lang === 'en'
                ? [
                    'Easyclz is provided "as is". We do not guarantee uninterrupted or error-free service.',
                    'We are not liable for any indirect, incidental, or consequential damages arising from use of the platform.',
                    'Our maximum liability to you in any circumstance is limited to the amount you paid in the last 3 months.',
                    'We are not responsible for SMS delivery failures caused by the recipient\'s network or text.lk service interruptions.',
                  ]
                : [
                    'Easyclz "as is" ලෙස ලබා දෙනු ලැබේ. බාධාවකින් තොර සේවාවක් සහතික නොකෙරේ.',
                    'text.lk SMS delivery ගැටළු සඳහා අපි වගකිව නොහැකිය.',
                  ],
            },
            {
              title: lang === 'en' ? '8. Termination' : '8. නතර කිරීම',
              body: lang === 'en'
                ? [
                    'You may cancel your Easyclz subscription at any time by contacting hello@easyclz.com.',
                    'We reserve the right to suspend or terminate accounts that violate these terms.',
                    'Upon termination, your access to the platform and all stored data will be removed after a 30-day grace period.',
                  ]
                : [
                    'hello@easyclz.com හරහා ඕනෑම වේලාවක subscription cancel කළ හැකිය.',
                    'නියම උල්ලංඝනය කළ ගිණුම් අත්හිටුවීමේ හෝ ඉවත් කිරීමේ අයිතිය අප සතුය.',
                    'Cancel කිරීමෙන් දින 30 කට පසු ප්‍රවේශය සහ දත්ත ඉවත් කෙරේ.',
                  ],
            },
            {
              title: lang === 'en' ? '9. Governing Law' : '9. පාලක නීතිය',
              body: lang === 'en'
                ? [
                    'These terms are governed by the laws of Sri Lanka.',
                    'Any disputes shall be resolved in the courts of Kurunegala, Sri Lanka.',
                    'If you have any concerns, please contact us first at hello@easyclz.com, we will always try to resolve issues amicably.',
                  ]
                : [
                    'මෙම නියම ශ්‍රී ලංකා නීතිය මගින් පාලනය වේ.',
                    'ඕනෑම ආරවුලක් කුරුණෑගල, ශ්‍රී ලංකාවේ අධිකරණ හරහා විසඳනු ලැබේ.',
                    'hello@easyclz.com හරහා ගැටළු කලින් විසඳීමට හැකිය.',
                  ],
            },
            {
              title: lang === 'en' ? '10. Contact' : '10. සම්බන්ධ වන්න',
              body: lang === 'en'
                ? [
                    'Email: hello@easyclz.com',
                    'Phone / WhatsApp: +94 77 646 5456',
                    'Address: Kurunegala, Sri Lanka',
                  ]
                : [
                    'ඊමේල්: hello@easyclz.com',
                    'දුරකථන / WhatsApp: +94 77 646 5456',
                    'ලිපිනය: කුරුණෑගල, ශ්‍රී ලංකාව',
                  ],
            },
          ].map((section, i) => (
            <div key={i}>
              <h2 className="h2 text-darkNavy mb-4">{section.title}</h2>
              <ul className="space-y-2">
                {section.body.map((item, j) => (
                  <li key={j} className="flex gap-3 items-start p text-neutralGray-600">
                    <span className="text-accessibleRed mt-1 flex-shrink-0">-</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}

        </div>
      </section>

      <Footer />
    </div>
  );
}
