'use client';

import Header from '../components/Header';
import Footer from '../components/Footer';
import PageHero from '../components/PageHero';
import { useLanguage } from '../contexts/LanguageContext';

export default function PrivacyPage() {
  const { lang } = useLanguage();

  return (
    <div>
      <Header />

      <PageHero
        titleEn="Privacy Policy"
        titleSi="රහස්‍යතා ප්‍රතිපත්තිය"
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
                ? 'Easyclz ("we", "our", or "us") is committed to protecting the privacy of our users, teachers, school owners, and students, across Sri Lanka. This Privacy Policy explains how we collect, use, store, and protect your information when you use our platform at xoox.easyclz.com, student.easyclz.lk, or our mobile applications.'
                : 'Easyclz ("අපි") ශ්‍රී ලංකාව පුරා අපගේ පරිශීලකයින්ගේ, ගුරුවරුන්, පාසල් හිමිකරුවන් සහ ශිෂ්‍යයන්ගේ, රහස්‍යතාව ආරක්ෂා කිරීමට කැපවී සිටී.'}
            </p>
          </div>

          {[
            {
              title: lang === 'en' ? '1. Information We Collect' : '1. අපි එකතු කරන තොරතුරු',
              body: lang === 'en'
                ? [
                    'Account information: Name, email address, and phone number when you register.',
                    'Student data: Student names, contact details, attendance records, exam marks, and monthly fee records entered by teachers or administrators.',
                    'Usage data: Pages visited, features used, and session information to improve the platform.',
                    'Device information: Device type and operating system when using our mobile app.',
                    'SMS logs: Records of SMS notifications sent via text.lk on your behalf.',
                  ]
                : [
                    'ගිණුම් තොරතුරු: ලියාපදිංචි වන විට නම, ඊමේල් ලිපිනය සහ දුරකථන අංකය.',
                    'ශිෂ්‍ය දත්ත: ගුරුවරුන් ඇතුළු කරන ශිෂ්‍ය නම්, සම්බන්ධතා, පැමිණීම, ලකුණු සහ ගාස්තු.',
                    'භාවිත දත්ත: වේදිකාව වැඩිදියුණු කිරීමට session සහ feature භාවිත.',
                    'උපාංග තොරතුරු: ජංගම යෙදවුම භාවිතයේදී device වර්ගය.',
                    'SMS ලොග්: text.lk හරහා යවන SMS දැනුම්දීම් වාර්තා.',
                  ],
            },
            {
              title: lang === 'en' ? '2. How We Use Your Information' : '2. ඔබේ තොරතුරු භාවිත කරන ආකාරය',
              body: lang === 'en'
                ? [
                    'To provide and operate the Easyclz platform and mobile applications.',
                    'To send SMS notifications to students and parents using text.lk.',
                    'To generate reports on attendance, fees, and exam performance.',
                    'To troubleshoot technical issues and improve our services.',
                    'To contact you about account updates, new features, or support.',
                    'We do NOT sell your data to any third parties.',
                  ]
                : [
                    'Easyclz platform සහ ජංගම යෙදවුම් ක්‍රියාත්මක කිරීමට.',
                    'text.lk භාවිතා කරමින් ශිෂ්‍යයන්ට SMS දැනුම්දීම් යැවීමට.',
                    'පැමිණීම, ගාස්තු සහ විභාග කාර්ය සාධනය පිළිබඳ වාර්තා සෑදීමට.',
                    'තාක්ෂණික ගැටළු නිරාකරණය කිරීමට.',
                    'ගිණුම් යාවත්කාලීන සහ සහාය සඳහා ඔබ සම්බන්ධ කිරීමට.',
                    'අපි ඔබේ දත්ත කිසිදු තෙවන පාර්ශ්වයකට විකුණන්නේ නැත.',
                  ],
            },
            {
              title: lang === 'en' ? '3. Data Storage & Security' : '3. දත්ත ගබඩා කිරීම සහ ආරක්ෂාව',
              body: lang === 'en'
                ? [
                    'All data is securely stored using industry-standard encryption.',
                    'The offline-first teacher app stores data locally on your device and syncs securely when connected.',
                    'We use secure HTTPS connections for all data transfers.',
                    'Only authorised administrators and teachers can access student records within their own organisation.',
                    'We regularly back up data to prevent loss.',
                  ]
                : [
                    'සියලු දත්ත ශිල්ප ප්‍රමිතිය encryption භාවිතා කරමින් ආරක්ෂිතව ගබඩා කෙරේ.',
                    'ඕෆ්ලයින්-ප්‍රථම ගුරු යෙදවුම දත්ත ස්ථානීයව ගබඩා කරයි.',
                    'සියලු දත්ත හුවමාරු සඳහා HTTPS භාවිතා කෙරේ.',
                    'ශිෂ්‍ය වාර්තා ප්‍රවේශ කළ හැකි වන්නේ නිසි ගුරුවරුන්ට/පරිපාලකයන්ට පමණි.',
                    'දත්ත නැතිවීම වැළැක්වීම සඳහා නිතිපතා backup කෙරේ.',
                  ],
            },
            {
              title: lang === 'en' ? '4. Student Data & Children\'s Privacy' : '4. ශිෂ්‍ය දත්ත සහ ළදරු රහස්‍යතාව',
              body: lang === 'en'
                ? [
                    'Student data is entered and managed by the teacher or school administrator.',
                    'Students access their portal via OTP (one-time password) sent to their registered phone number, no password required.',
                    'We do not knowingly collect data directly from children under 13 without parental consent.',
                    'Student data is used only within the context of the registered class or school.',
                  ]
                : [
                    'ශිෂ්‍ය දත්ත ගුරුවරයා හෝ පාසල් පරිපාලකයා විසින් ඇතුළු කරනු ලැබේ.',
                    'ශිෂ්‍යයන් OTP (එක-වරක් මුරපදය) හරහා portal වෙත ප්‍රවේශ වේ.',
                    'වයස 13 ට අඩු ළමුන්ගෙන් දෙමාපිය අනුදැනුමකින් තොරව දත්ත සෘජුවම එකතු නොකෙරේ.',
                    'ශිෂ්‍ය දත්ත ලියාපදිංචි පන්තියේ හෝ පාසලේ context තුළ පමණක් භාවිතා වේ.',
                  ],
            },
            {
              title: lang === 'en' ? '5. SMS Notifications' : '5. SMS දැනුම්දීම්',
              body: lang === 'en'
                ? [
                    'SMS notifications are sent via our partner text.lk.',
                    'SMS messages are used only for class reminders, fee alerts, and exam result notifications.',
                    'Phone numbers used for SMS are those provided by the teacher or administrator.',
                    'Recipients can request to be removed from SMS notifications by contacting their teacher or hello@easyclz.com.',
                  ]
                : [
                    'SMS දැනුම්දීම් text.lk හරහා යවනු ලැබේ.',
                    'SMS හරහා ගන්නා දුරකථන අංක ගුරුවරයා/පරිපාලකයා විසින් ලබා දෙනු ලැබේ.',
                    'ලබාගන්නන්ට hello@easyclz.com හරහා ඉල්ලා SMS ඉවත් කළ හැකිය.',
                  ],
            },
            {
              title: lang === 'en' ? '6. Your Rights' : '6. ඔබේ අයිතිවාසිකම්',
              body: lang === 'en'
                ? [
                    'Request access to the personal data we hold about you.',
                    'Request correction of inaccurate data.',
                    'Request deletion of your account and associated data.',
                    'Withdraw consent for SMS communications.',
                    'To exercise any of these rights, contact us at hello@easyclz.com.',
                  ]
                : [
                    'ඔබ ගැන ගබඩා කර ඇති දත්ත ප්‍රවේශ ඉල්ලීමේ අයිතිය.',
                    'නිවැරදි නොවන දත්ත නිවැරදි කිරීමේ ඉල්ලීමේ අයිතිය.',
                    'ඔබේ ගිණුම සහ දත්ත මකා දැමීමේ ඉල්ලීමේ අයිතිය.',
                    'SMS සඳහා hello@easyclz.com හරහා ඉල්ලීම් කරන්න.',
                  ],
            },
            {
              title: lang === 'en' ? '7. Changes to This Policy' : '7. මෙම ප්‍රතිපත්තියේ වෙනස්කම්',
              body: lang === 'en'
                ? [
                    'We may update this Privacy Policy from time to time.',
                    'We will notify registered users of significant changes via email or in-app notification.',
                    'Continued use of Easyclz after changes means you accept the updated policy.',
                  ]
                : [
                    'මෙම රහස්‍යතා ප්‍රතිපත්තිය යාවත්කාලීන කළ හැකිය.',
                    'ලියාපදිංචි පරිශීලකයන්ට ඊමේල් හෝ app දැනුම්දීම් හරහා දැනුම් දෙනු ලැබේ.',
                  ],
            },
            {
              title: lang === 'en' ? '8. Contact Us' : '8. අප අමතන්න',
              body: lang === 'en'
                ? [
                    'If you have any questions about this Privacy Policy, please contact us:',
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
