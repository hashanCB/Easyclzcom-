'use client';

import { useState, useEffect } from 'react';
import Script from 'next/script';
import Link from 'next/link';
import Image from 'next/image';
import Header from './components/Header';
import Footer from './components/Footer';
import { useLanguage } from './contexts/LanguageContext';
import { fetchApkDownloadUrl } from './lib/publicSettings';
import { Users, CreditCard, FileText, Smartphone, BarChart2, GraduationCap, BookOpen, CheckSquare, UserCheck, MessageSquare, MessageCircle, ClipboardList, FileDown, CalendarPlus } from 'lucide-react';

const featureSlides = [
  {
    key: 'student',
    titleEn: 'Student Management',
    titleSi: 'ශිෂ්‍ය කළමනාකරණය',
    descEn: 'One profile holds everything about a student — contacts, parent numbers, enrolled classes, attendance, payments, and exam marks. Share a join link by SMS or WhatsApp and students register themselves in minutes.',
    descSi: 'ශිෂ්‍යයෙකු එක් වරක් එකතු කළ පසු, ඔහුගේ සියලු තොරතුරු එක් පැතිකඩක තබා ගත හැක: සම්බන්ධතා, දෙමාපිය අංක, ලියාපදිංචි class, පැමිණීම, ගෙවීම් සහ ලකුණු ඉතිහාසය.',
    bulletsEn: ['Each student gets a QR ID card used for fast attendance scanning and identification', 'Profile keeps full history in one place: attendance %, payment status, and exam marks', 'Send the class join link by SMS or WhatsApp, student signs up with OTP at student.easyclz.lk'],
    bulletsSi: ['ඉක්මන් identification සඳහා QR ID කාඩ්පතක්', 'පැමිණීම, ගෙවීම්, ලකුණු එකම තැනක', 'SMS/WhatsApp මගින් join link යවා OTP මගින් ලියාපදිංචි කරගත හැක'],
    img: '/images/ai/1.png',
    accent: '#4F46E5', accentBg: '#EEF2FF',
    Icon: Users,
  },
  {
    key: 'payment',
    titleEn: 'Payment Management',
    titleSi: 'ගෙවීම් කළමනාකරණය',
    descEn: 'Set a standard class fee, a custom amount, or a free seat for each student. Every payment is logged the instant it is collected, and the parent receives an SMS confirmation the same moment.',
    descSi: 'ශිෂ්‍යයෙකු එක් කරන විට standard fee, custom amount, හෝ free seat එකක් සකස් කළ හැක. ගුරු හෝ සහයක යෙදුමෙන් එකතු කරන ගෙවීම් සැණින් record වී දෙමාපියන්ට SMS confirmation එකක් යයි.',
    bulletsEn: ['Set a standard fee, custom amount, or free-card option per student when adding them', 'Each payment sends an instant SMS receipt to the parent\'s registered number', 'Filter unpaid students by class with one tap and send a reminder SMS to all of them at once'],
    bulletsSi: ['ශිෂ්‍යයෙකු එක් කරන විට standard, custom, හෝ free fee සකස් කිරීම', 'ගෙවීමක් කළ වරම SMS receipt එකක් යවයි', 'class එකකට නොගෙවූ ශිෂ්‍යයන් filter කර reminder SMS එකවර යැවිය හැක'],
    img: '/images/ai/2.png',
    accent: '#059669', accentBg: '#ECFDF5',
    Icon: CreditCard,
  },
  {
    key: 'exam',
    titleEn: 'Exam Monitoring',
    titleSi: 'විභාග අධීක්ෂණය',
    descEn: 'Create an exam, enter each student\'s mark, and Easyclz builds a printable mark sheet and a class-wide report automatically. Results appear in every student\'s portal the moment you publish them.',
    descSi: '"Mock Exam 001" වැනි නමක් ලබා දී විභාගයක් සාදන්න, පසුව Student A - 50, Student B - 96 ලෙස එක් එක් ශිෂ්‍යයාගේ ලකුණු ඇතුළත් කරන්න. ලකුණු පත්‍රයක් සහ class report එකක් ස්වයංක්‍රීයව සකස් වේ.',
    bulletsEn: ['Create exams named per class or subject, such as Mock Exam 001 or Term Test 2', 'Enter marks one student at a time, e.g. Student A - 50, Student B - 96', 'Mark sheets and class reports generate automatically, marks show up in the student portal'],
    bulletsSi: ['Mock Exam 001 වැනි නම් සහිතව class/විෂය අනුව විභාග සෑදීම', 'Student A - 50, Student B - 96 ලෙස ලකුණු ඇතුළත් කිරීම', 'ලකුණු පත්‍රය සහ class report ස්වයංක්‍රීයව සකස් වී student portal එකේ පෙන්වයි'],
    img: '/images/ai/3.png',
    accent: '#D97706', accentBg: '#FFFBEB',
    Icon: FileText,
  },
  {
    key: 'online-exam',
    titleEn: 'Online Exams (MCQ)',
    titleSi: 'මාර්ගගත විභාග (MCQ)',
    descEn: 'Build a question bank for each class, then publish a timed MCQ or true/false exam with one join code. Students enter the code on their phones, answer, and get graded instantly. If a student leaves the exam screen, they are warned and the teacher sees how many times — so you know who really did it on their own.',
    descSi: 'සෑම පන්තියකටම ප්‍රශ්න බැංකුවක් සාදා, කාල සීමාවක් සහිත MCQ / True-False විභාගයක් එක් කේතයක් සමඟ ප්‍රකාශ කරන්න. ශිෂ්‍යයන් දුරකථනයෙන් කේතය ඇතුළත් කර පිළිතුරු සපයන විට ස්වයංක්‍රීයව ලකුණු ලැබේ. ශිෂ්‍යයා තිරයෙන් ඉවත් වුවහොත් අනතුරු ඇඟවී එය කී වරක්ද යන්න ගුරුවරයාට පෙනේ.',
    bulletsEn: ['Build a reusable question bank per class (MCQ and True/False)', 'Publish a timed exam with one join code and a set number of questions', 'Students take it in the student portal and are marked instantly, no manual grading', 'Anti-cheat: each time a student leaves the exam screen they are warned and flagged for the teacher'],
    bulletsSi: ['පන්තියකට නැවත භාවිත කළ හැකි ප්‍රශ්න බැංකුවක්', 'එක් කේතයක් සහ ප්‍රශ්න ගණනක් සහිත කාල සීමා විභාගයක් ප්‍රකාශ කිරීම', 'ශිෂ්‍ය ද්වාරයෙන් විභාගය කර සැණින් ලකුණු ලැබීම', 'තිරයෙන් ඉවත් වන සෑම විටම අනතුරු ඇඟවීම සහ ගුරුවරයාට සලකුණු කිරීම'],
    img: '/images/ai/3.png',
    accent: '#0D9488', accentBg: '#F0FDFA',
    Icon: ClipboardList,
  },
  {
    key: 'extra-class',
    titleEn: 'Extra Classes',
    titleSi: 'අමතර පන්ති',
    descEn: 'Hold a one-off extra or revision session outside the regular monthly class. Make it free, charge the usual class fee, or set a custom amount — free-card students stay free automatically. Mark who attended and collect payment for that one session in one place, and every student gets an SMS and a class-chat message about it. Assistants can run extra classes too, and it all stays separate from your monthly attendance and fees so your normal reports are never affected.',
    descSi: 'සුපුරුදු මාසික පන්තියෙන් පිට එක්වරක් පවත්වන අමතර / පුනරීක්ෂණ සැසියක්. නොමිලේ, සුපුරුදු ගාස්තුව, හෝ custom මුදලක් ලෙස තැබිය හැක — free-card ශිෂ්‍යයන් ස්වයංක්‍රීයව නොමිලේ. පැමිණි අය සලකුණු කර එම සැසිය සඳහා ගෙවීම එක තැනකින් එකතු කරන්න, සහ සෑම ශිෂ්‍යයෙකුටම SMS එකක් සහ class chat පණිවිඩයක් යයි. සහයකයන්ටද අමතර පන්ති පැවැත්විය හැකි අතර, මෙය මාසික පැමිණීම් සහ ගාස්තු වලින් වෙන්ව තබයි.',
    bulletsEn: ['Schedule a one-off extra or revision class with its own date, time, and location', 'Make it free, charge the normal class fee, or set a custom amount — free-card students stay free', 'Mark attendance and collect payment for that session, kept separate from monthly fees', 'Every student is notified automatically by SMS and in the class chat', 'Assistants can run extra classes and collect payments too'],
    bulletsSi: ['දිනය, වේලාව, ස්ථානය සහිතව එක්වරක් අමතර / පුනරීක්ෂණ පන්තියක් සැකසීම', 'නොමිලේ, සුපුරුදු ගාස්තුව, හෝ custom මුදලක් — free-card ශිෂ්‍යයන් නොමිලේ', 'එම සැසියට පැමිණීම සහ ගෙවීම මාසික ගාස්තු වලින් වෙන්ව', 'සෑම ශිෂ්‍යයෙකුටම SMS සහ class chat මගින් ස්වයංක්‍රීය දැනුම්දීම', 'සහයකයන්ටද අමතර පන්ති පවත්වා ගෙවීම් එකතු කළ හැක'],
    img: '/images/ai/6.png',
    accent: '#4F46E5', accentBg: '#EEF2FF',
    Icon: CalendarPlus,
  },
  {
    key: 'teacher-app',
    titleEn: 'Teacher Mobile App',
    titleSi: 'ගුරු ජංගම යෙදවුම',
    descEn: 'Mark attendance, record payments, and upload notes in a few taps — even with no internet in the classroom. Everything done offline syncs automatically the moment your phone reconnects. Available on iOS and Android.',
    descSi: 'iOS සහ Android ගුරු යෙදුම මගින් අද පැමිණීම සලකුණු කිරීම, ගෙවීමක් record කිරීම, හෝ notes PDF එකක් upload කිරීම තත්පර කිහිපයකින් කළ හැක, internet නොමැතිවත්.',
    bulletsEn: ['Mark present, late, or absent for the whole class in a few taps, fully offline', 'Record a payment or upload class notes straight from your phone', 'Everything entered offline syncs to your account automatically once back online'],
    bulletsSi: ['Present, late, absent ලෙස class එකම තත්පර කිහිපයකින් සලකුණු කිරීම, offline වුවත්', 'Phone එකෙන්ම ගෙවීම record කිරීම හෝ notes upload කිරීම', 'Offline ඇතුළත් කළ දත්ත නැවත online වූ විට automatic ලෙස sync වේ'],
    img: '/images/ai/4.png',
    accent: '#7C3AED', accentBg: '#F5F3FF',
    Icon: Smartphone,
  },
  {
    key: 'assistant-app',
    titleEn: 'Assistant App',
    titleSi: 'සහයක යෙදුම',
    descEn: 'Add an assistant with their own limited login to collect payments, scan attendance, and register new students. Your main account and settings stay fully under your control at all times.',
    descSi: 'class එක තනියෙන් භාරගත නොහැකි තරම් වැඩි වූ විට, වෙනම login එකක් සහිත සහයකයෙකු එක් කරන්න. ඔවුන්ට ගෙවීම් එකතු කිරීම, QR scan මගින් පැමිණීම, සහ නව ශිෂ්‍ය ලියාපදිංචිය සඳහා වෙනම සීමිත app එකක් ලැබේ.',
    bulletsEn: ['Assistant gets their own login, separate from the teacher\'s main account', 'Can collect payments and scan QR codes for attendance during class', 'Can register new students without ever touching the teacher\'s settings or data'],
    bulletsSi: ['ගුරුවරයාගේ ප්‍රධාන ගිණුමෙන් වෙනස් වූ වෙනම login එකක්', 'class එක අතරතුර ගෙවීම් එකතු කිරීම සහ QR scan මගින් පැමිණීම', 'ගුරුවරයාගේ settings ට ස්පර්ශ නොකර නව ශිෂ්‍යයන් ලියාපදිංචි කිරීම'],
    img: '/images/ai/5.png',
    accent: '#EA580C', accentBg: '#FFF7ED',
    Icon: UserCheck,
  },
  {
    key: 'attendance',
    titleEn: 'Attendance',
    titleSi: 'පැමිණීම',
    descEn: 'Scan a student\'s QR card to mark attendance and log a payment in a single step, or mark the whole class from your phone with no QR needed. Works fully offline and alerts parents by SMS on absences.',
    descSi: 'සහයකයෙක් ඇත්නම් ඉදිරිපිට QR ID කාඩ්පත scan කොට පැමිණීම සහ ගෙවීම එකම scan එකෙන් record කළ හැක. ගුරුවරයාට QR නොමැතිවත් සමස්ත class එක present, late, absent ලෙස සෘජුව සලකුණු කළ හැක.',
    bulletsEn: ['Scan a student\'s QR ID card at the door to mark attendance and log a payment in one step', 'No assistant? Teachers mark the whole class present, late, or absent directly, no QR needed', 'Works fully offline, and sends an SMS to the registered home number the moment a student is marked absent'],
    bulletsSi: ['QR ID කාඩ්පත scan කරමින් පැමිණීම සහ ගෙවීම එකම පියවරෙන් record කිරීම', 'සහයකයෙක් නැතත් ගුරුවරයාට class එක QR නොමැතිව සලකුණු කළ හැක', 'Offline ක්‍රියා කරයි, නොපැමිණි විට නිවසේ අංකයට SMS එකක් ස්වයංක්‍රීයව යයි'],
    img: '/images/ai/6.png',
    accent: '#0EA5E9', accentBg: '#ECFEFF',
    Icon: CheckSquare,
  },
  {
    key: 'reports',
    titleEn: 'Reports & SMS',
    titleSi: 'වාර්තා සහ SMS',
    descEn: 'Payments, absences, and exam results trigger an automatic SMS to parents. Pull up who has paid, who is overdue, attendance rates, and exam performance instantly — no spreadsheets required.',
    descSi: 'ගෙවීමක්, නොපැමිණීමක්, විභාග ප්‍රතිඵලයක් වැනි වැදගත් සිදුවීම් සිදුවූ විට, ස්වයංක්‍රීයව දෙමාපියන්ගේ අංකයට SMS යයි. මාසික ගෙවීම්, කල් ඉකුත් ශිෂ්‍යයන්, පැමිණීම % සහ විභාග කාර්ය සාධනය එක ස්ථානයකින් බැලිය හැක.',
    bulletsEn: ['Automatic SMS for payments, absences, and exam results, sent to the registered number', 'See exactly who has paid this month and who is overdue, by class or system-wide', 'Attendance percentage and exam performance reports without building a single spreadsheet'],
    bulletsSi: ['ගෙවීම්, නොපැමිණීම්, විභාග ප්‍රතිඵල සඳහා ස්වයංක්‍රීය SMS', 'මේ මාසේ ගෙව්වේ කවුද, කල් ඉකුත් වූයේ කවුද බැලිය හැක', 'spreadsheet එකක් සකස් නොකර පැමිණීම % සහ විභාග කාර්ය සාධන වාර්තා'],
    img: '/images/ai/7.png',
    accent: '#0891B2', accentBg: '#ECFEFF',
    Icon: BarChart2,
  },
  {
    key: 'notes',
    titleEn: 'Notes & Files',
    titleSi: 'සටහන් සහ ගොනු',
    descEn: 'Upload class notes as a PDF and they appear in every enrolled student\'s portal at once, neatly organised by class. Students only ever see material for the classes they have joined — no more forwarding the same file fifty times.',
    descSi: 'class එක ඉවර වූ විගසම notes PDF එකක් ගුරු යෙදුමෙන් upload කරන්න, එය ලියාපදිංචි සියලුම ශිෂ්‍යයන්ගේ portal එකේ ක්ෂණිකව පෙන්වයි. class අනුව organize වී ඇති නිසා ශිෂ්‍යයෙකුට ඔහු join වූ class වල material පමණක් පෙනේ.',
    bulletsEn: ['Upload a PDF or file right after class, it appears in the student portal instantly', 'Files are organised strictly by class, only enrolled students can see or download them', 'Replace or remove a file anytime, the change reflects for every student immediately'],
    bulletsSi: ['class එක ඉවර වූ විගස PDF upload කළ වහාම student portal එකේ පෙන්වයි', 'class අනුව ගොනු organize වී ඇති නිසා enrolled ශිෂ්‍යයන්ට පමණක් access', 'ඕනෑම වෙලාවක file replace/remove කළ හැක, වහාම සියලු ශිෂ්‍යයන්ට පෙනේ'],
    img: '/images/ai/8.png',
    accent: '#0891B2', accentBg: '#ECFEFF',
    Icon: FileDown,
  },
  {
    key: 'chat',
    titleEn: 'Class Chat',
    titleSi: 'Class කතාබස',
    descEn: 'Post an announcement once and every student in the class sees it in their portal and can reply. Each class keeps its own separate thread, so messages never cross between your different groups.',
    descSi: '"විභාගය සෙනසුරාදා දක්වා කල් දමා ඇත" වැනි announcement එකක් ගුරු යෙදුමෙන් එක් වරක් post කරන්න, class එකේ සියලු ශිෂ්‍යයන්ට portal එකේ පෙනේ. සෑම class එකකටම වෙනම chat thread එකක් ඇත.',
    bulletsEn: ['Post one announcement and every enrolled student sees it in their portal instantly', 'Students can reply directly, no separate WhatsApp group needed', 'Each class keeps its own separate thread, nothing mixes between classes'],
    bulletsSi: ['Announcement එකක් post කළ විගස enrolled සියලුම ශිෂ්‍යයන්ට portal එකේ පෙනේ', 'ශිෂ්‍යයන්ට කෙලින්ම reply කළ හැක, වෙනම WhatsApp group අවශ්‍ය නැත', 'සෑම class එකකටම වෙනම thread, එකිනෙක මිශ්‍ර නොවේ'],
    img: '/images/ai/9.png',
    accent: '#7C3AED', accentBg: '#F5F3FF',
    Icon: MessageSquare,
  },
  {
    key: 'portal',
    titleEn: 'Student Portal',
    titleSi: 'ශිෂ්‍ය ද්වාරය',
    descEn: 'Students sign up free at student.easyclz.lk, verify their phone by OTP, and join with the class code you share. From there they get their payment QR and history, exam marks, downloadable notes, and class chat — all from their own phone or laptop.',
    descSi: 'ශිෂ්‍යයෙකු student.easyclz.lk හි නොමිලේ ගිණුමක් සාදා, OTP මගින් phone number verify කොට, ගුරුවරයා දුන් class code ඇතුළත් කොට join වේ. ගෙවීම් QR, ලකුණු, notes සහ chat සියල්ල එතැනින් බැලිය හැක.',
    bulletsEn: ['Free signup at student.easyclz.lk with OTP phone verification, no app download needed', 'Join any class instantly just by entering the class code the teacher shares', 'See payment history, exam marks the moment they\'re published, notes, and class chat in one place'],
    bulletsSi: ['student.easyclz.lk හිදී OTP මගින් නොමිලේ ලියාපදිංචිය, app download අවශ්‍ය නැත', 'ගුරුවරයා දුන් class code ඇතුළත් කොට ඕනෑම class එකකට join වීම', 'ගෙවීම් ඉතිහාසය, ලකුණු, notes සහ chat එක තැනක'],
    img: '/images/ai/10.png',
    accent: '#DB2777', accentBg: '#FDF2F8',
    Icon: GraduationCap,
  },
];

const businessTypes = [
  { label: 'Tuition Classes', labelSi: 'ටියුෂන් පන්ති', img: '/images/business-types/home-tuition.png', href: '/business-types' },
  { label: 'Language Schools', labelSi: 'භාෂා පාසල්', img: '/images/business-types/home-language.png', href: '/business-types' },
  { label: 'Music Schools', labelSi: 'සංගීත පාසල්', img: '/images/business-types/home-music.png', href: '/business-types' },
  { label: 'Sports Academies', labelSi: 'ක්‍රීඩා ඇකඩමි', img: '/images/business-types/home-sports-1.png', href: '/business-types' },
  { label: 'Preschools', labelSi: 'පෙරපාසල්', img: '/images/business-types/home-preschool.png', href: '/business-types' },
  { label: 'Dance Schools', labelSi: 'නර්තන පාසල්', img: '/images/business-types/home-dance.png', href: '/business-types' },
  { label: 'Art Classes', labelSi: 'කලා පන්ති', img: '/images/business-types/home-art.png', href: '/business-types' },
];

const testimonials = [
  {
    text: 'Easyclz made managing my 45 students so easy. The SMS reminders alone save me hours every month. I used to call parents manually, now it\'s all automatic.',
    textSi: 'Easyclz මගේ ශිෂ්‍යයන් 45 දෙනා කළමනාකරණය ඉතා පහසු කළා. SMS මතක් කිරීම් නිසා දෙමාපියන්ට ඇමතීම ස්වයංක්‍රීය වුණා.',
    name: 'Kasun Perera',
    role: 'Tuition Teacher, Colombo',
    roleSi: 'ටියුෂන් ගුරුවරයා, කොළඹ',
    subject: 'Mathematics & Science',
    subjectSi: 'ගණිතය සහ විද්‍යාව',
    color: 'bg-blue-600',
    initials: 'KP',
  },
  {
    text: 'The offline feature is perfect for our area. Even without internet, teachers can mark attendance and sync later. My students love the portal too.',
    textSi: 'ඕෆ්ලයින් විශේෂාංගය අපේ ප්‍රදේශයට ඉතා ගැලපෙනවා. අන්තර්ජාලය නොමැතිව පැමිණීම සලකුණු කොට පසුව sync කළ හැකිය.',
    name: 'Nimasha Silva',
    role: 'Music School Owner, Kandy',
    roleSi: 'සංගීත පාසල් හිමිකරු, කන්ද',
    subject: 'Piano & Violin',
    subjectSi: 'පියානෝ සහ වයලීනය',
    color: 'bg-purple-600',
    initials: 'NS',
  },
  {
    text: 'Collecting payments used to be a nightmare. Now everything is tracked automatically and I can see who has paid and who hasn\'t in seconds.',
    textSi: 'ගෙවීම් එකතු කිරීම දැන් ඉතා පහසුයි. කවුරු ගෙව්වාද කවුරු ගෙව්වේ නැද්ද කියා තත්පර කිහිපයකින් දැනගත හැකිය.',
    name: 'Thilina Jayawardena',
    role: 'Sports Academy Director, Galle',
    roleSi: 'ක්‍රීඩා ඇකඩමිය අධ්‍යක්ෂ, ගාල්ල',
    subject: 'Swimming & Athletics',
    subjectSi: 'පිහිනීම සහ ඇතළෙටික්ස්',
    color: 'bg-emerald-600',
    initials: 'TJ',
  },
  {
    text: 'Before Easyclz I kept everything in notebooks. Now my exam results, attendance, and payments are all in one place. It saved my class completely.',
    textSi: 'Easyclz ට පෙර සෑම දෙයක්ම සටහන් පොත්වල තිබ්බා. දැන් විභාග ප්‍රතිඵල, පැමිණීම, ගෙවීම් සියල්ල එක තැනකයි.',
    name: 'Priyanka Fernando',
    role: 'Dance Teacher, Negombo',
    roleSi: 'නර්තන ගුරුවරිය, නේගොඹ',
    subject: 'Bharatha Natyam',
    subjectSi: 'භරත නාට්‍යම්',
    color: 'bg-pink-600',
    initials: 'PF',
  },
  {
    text: 'The exam monitoring feature is incredible. I can enter marks, generate mark sheets, and share results with parents, all within minutes after the exam.',
    textSi: 'විභාග අධීක්ෂණ විශේෂාංගය අසාධාරණයි. ලකුණු ඇතුළු කොට ලකුණු පත්‍ර සාදා දෙමාපියන්ට ඒවා ලබා දිය හැකිය.',
    name: 'Roshan Wickramasinghe',
    role: 'IT Trainer, Kurunegala',
    roleSi: 'IT පුහුණුකරු, කුරුණෑගල',
    subject: 'Computer Science',
    subjectSi: 'පරිගණක විද්‍යාව',
    color: 'bg-orange-600',
    initials: 'RW',
  },
  {
    text: 'I run a small preschool and Easyclz fits perfectly. The $1 plan gives me everything I need. I recommended it to every teacher I know.',
    textSi: 'මට කුඩා පෙරපාසලක් ඇති අතර Easyclz ඉතා ගැලපෙනවා. $1 සැලැස්ම මට අවශ්‍ය සෑම දෙයක්ම ලබා දෙනවා.',
    name: 'Sanduni Rathnayake',
    role: 'Preschool Teacher, Matara',
    roleSi: 'පෙරපාසල් ගුරුවරිය, මාතර',
    subject: 'Early Childhood Education',
    subjectSi: 'ළදරු අධ්‍යාපනය',
    color: 'bg-teal-600',
    initials: 'SR',
  },
];

// short, scannable value-prop per tool (bento grid pattern)
const featureTags: Record<string, { en: string; si: string }> = {
  'student':       { en: 'One profile for every student', si: 'සෑම ශිෂ්‍යයෙකුටම එක් පැතිකඩක්' },
  'payment':       { en: 'Fees logged with instant SMS', si: 'ගෙවීම් + ක්ෂණික SMS' },
  'exam':          { en: 'Marks become mark sheets, auto', si: 'ලකුණු ස්වයංක්‍රීය මාර්ක් ෂීට්' },
  'online-exam':   { en: 'Timed MCQ with anti-cheat', si: 'කාල සීමා MCQ + වංචා වැළැක්වීම' },
  'extra-class':   { en: 'One-off paid or free sessions', si: 'එක්වරක් අමතර පන්ති' },
  'teacher-app':   { en: 'Run your class fully offline', si: 'Offline පන්තිය කළමනාකරණය' },
  'assistant-app': { en: 'Helpers with limited access', si: 'සීමිත access සහයකයන්' },
  'attendance':    { en: 'QR scan or one-tap marking', si: 'QR scan හෝ එක්-tap' },
  'reports':       { en: 'Auto SMS and clear reports', si: 'ස්වයංක්‍රීය SMS + වාර්තා' },
  'notes':         { en: 'Share notes to the portal', si: 'notes portal එකට' },
  'chat':          { en: 'Announce once, per class', si: 'class එකට announcement' },
  'portal':        { en: 'Students see it all online', si: 'ශිෂ්‍යයන්ට සියල්ල online' },
};

function FeaturesSection({ lang }: { lang: string }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const open = openIdx !== null ? featureSlides[openIdx] : null;

  useEffect(() => {
    if (openIdx === null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenIdx(null); };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [openIdx]);

  // Bento grid: some cards span 2 cols on large screens for visual rhythm
  const spans = [
    'lg:col-span-2', // Student Management — hero feature
    '',               // Payment
    '',               // Exam
    '',               // Online Exams
    '',               // Extra Classes
    '',               // Teacher Mobile App
    '',               // Assistant App
    'lg:col-span-2', // Attendance — key differentiator
    '',               // Reports
    '',               // Notes
    '',               // Chat
    '',               // Portal
  ];

  return (
    <section style={{
      padding: '6rem 0',
      background: 'linear-gradient(180deg, #F8FAFF 0%, #FFFFFF 100%)',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Subtle background orbs */}
      <div style={{
        position: 'absolute', top: -240, right: -160, width: 560, height: 560,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(79,70,229,0.05) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: -200, left: -160, width: 440, height: 440,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(5,150,105,0.04) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div className="st-width">

        {/* ── Section header ── */}
        <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            fontSize: 12, fontWeight: 600,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            color: '#4F46E5', backgroundColor: '#EEF2FF',
            border: '1px solid rgba(79,70,229,0.15)',
            padding: '5px 16px', borderRadius: 9999, marginBottom: 16,
            boxShadow: '0 2px 8px rgba(79,70,229,0.06)',
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: '#4F46E5' }} />
            {lang === 'en' ? 'Everything You Need' : 'ඔබට අවශ්‍ය සියල්ල'}
          </span>
          <h2 style={{
            fontSize: 'clamp(1.75rem, 3.5vw, 2.75rem)', fontWeight: 800,
            background: 'linear-gradient(135deg, #0F1E45 0%, #4F46E5 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            letterSpacing: '-0.03em', lineHeight: 1.15,
          }}>
            {lang === 'en' ? 'Your all-in-one class management system' : 'ඔබේ සම්පූර්ණ පන්ති කළමනාකරණ පද්ධතිය'}
          </h2>
          <p style={{ fontSize: 16, color: '#6B7280', marginTop: 12, maxWidth: 520, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
            {lang === 'en'
              ? 'Ten powerful tools built into one system for Sri Lankan tutors and schools. Tap any tool to learn more.'
              : 'ශ්‍රී ලාංකික ගුරුවරුන් සඳහා නිර්මිත එක app එකක් තුළ ශක්තිමත් tools 10ක්. වැඩි විස්තර සඳහා tool එකක් tap කරන්න.'}
          </p>
        </div>

        {/* ── Modern bento card grid ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4" style={{ gap: '1.25rem' }}>
          {featureSlides.map((s, i) => {
            const CardIcon = s.Icon;
            const tag = featureTags[s.key];
            const span = spans[i];
            return (
              <button
                key={s.key}
                onClick={() => setOpenIdx(i)}
                className={`feature-card2 ${span}`}
                style={{
                  backgroundColor: '#fff',
                  borderRadius: '1.25rem',
                  border: '1px solid #EFF1F5',
                  padding: '1.75rem',
                  cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                  gap: '0.875rem', textAlign: 'left',
                  position: 'relative',
                  transition: 'transform 0.3s ease, box-shadow 0.3s ease, border-color 0.3s ease',
                  boxShadow: '0 2px 8px rgba(15,30,69,0.04)',
                }}
              >
                {/* Index number decoration — accent-tinted so it reads clearly */}
                <span style={{
                  position: 'absolute', top: 12, right: 16,
                  fontSize: 50, fontWeight: 900, lineHeight: 1,
                  color: s.accent, opacity: 0.22,
                  letterSpacing: '-0.04em', pointerEvents: 'none',
                  fontFamily: 'system-ui, sans-serif',
                }}>
                  {String(i + 1).padStart(2, '0')}
                </span>

                {/* Icon */}
                <span style={{
                  width: 52, height: 52, borderRadius: 16, flexShrink: 0,
                  backgroundColor: s.accentBg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: `0 4px 12px ${s.accent}15`,
                }}>
                  <CardIcon size={24} color={s.accent} strokeWidth={2} />
                </span>

                <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0F1E45', lineHeight: 1.3, letterSpacing: '-0.01em', marginTop: 2 }}>
                  {lang === 'en' ? s.titleEn : s.titleSi}
                </h3>

                <p style={{ fontSize: 13.5, color: '#6B7280', lineHeight: 1.5, margin: 0 }}>
                  {lang === 'en' ? tag.en : tag.si}
                </p>

                <span className="feature-more2" style={{
                  marginTop: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontSize: 13, fontWeight: 600, color: s.accent,
                }}>
                  {lang === 'en' ? 'Learn more' : 'වැඩි විස්තර'}
                  <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" className="feature-arrow2" style={{ transition: 'transform 0.25s ease' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7"/>
                  </svg>
                </span>
              </button>
            );
          })}
        </div>

      </div>

      {/* ── Refined modal ── */}
      {open && (
        <div
          className="fc-backdrop2"
          onClick={() => setOpenIdx(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            backgroundColor: 'rgba(15,30,69,0.5)',
            backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1.5rem',
          }}
        >
          <div
            className="fc-modal2"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative',
              width: '100%', maxWidth: 540,
              backgroundColor: '#fff',
              borderRadius: '1.75rem',
              padding: '2.5rem',
              boxShadow: '0 40px 100px rgba(15,30,69,0.3)',
              maxHeight: '85vh', overflowY: 'auto',
            }}
          >
            {/* Close */}
            <button
              onClick={() => setOpenIdx(null)}
              aria-label="Close"
              className="modal-close2"
              style={{
                position: 'absolute', top: 18, right: 18,
                width: 36, height: 36, borderRadius: '50%',
                border: 'none', cursor: 'pointer', backgroundColor: '#F3F4F6',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.15s',
                zIndex: 1,
              }}
            >
              <svg width="18" height="18" fill="none" stroke="#374151" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M6 6l12 12M18 6L6 18"/>
              </svg>
            </button>

            {/* Accent bar */}
            <div style={{ width: 56, height: 4, borderRadius: 2, backgroundColor: open.accent, marginBottom: '1.5rem' }} />

            {/* Icon + title */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: '1.25rem', paddingRight: 40 }}>
              <span style={{
                width: 60, height: 60, borderRadius: 18, flexShrink: 0,
                backgroundColor: open.accentBg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 4px 16px ${open.accent}20`,
              }}>
                <open.Icon size={28} color={open.accent} strokeWidth={2} />
              </span>
              <h3 style={{ fontSize: 24, fontWeight: 800, color: '#0F1E45', lineHeight: 1.2, letterSpacing: '-0.02em' }}>
                {lang === 'en' ? open.titleEn : open.titleSi}
              </h3>
            </div>

            <p style={{ fontSize: 15, color: '#6B7280', lineHeight: 1.7, marginBottom: '1.75rem' }}>
              {lang === 'en' ? open.descEn : open.descSi}
            </p>

            {/* Bullets */}
            <ul style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(lang === 'en' ? open.bulletsEn : open.bulletsSi).map((b: string, i: number) => (
                <li key={i} className="modal-bullet2" style={{
                  display: 'flex', alignItems: 'flex-start', gap: 14,
                  backgroundColor: '#F9FAFB',
                  border: '1px solid #F3F4F6',
                  borderRadius: 14,
                  padding: '0.875rem 1.125rem',
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease',
                }}>
                  <span style={{
                    width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                    backgroundColor: open.accentBg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginTop: 1,
                  }}>
                    <svg width="13" height="13" fill="none" stroke={open.accent} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/>
                    </svg>
                  </span>
                  <span style={{ fontSize: 14, color: '#374151', fontWeight: 500, lineHeight: 1.6 }}>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <style>{`
        .feature-card2 {
          width: 100%;
          position: relative;
          overflow: hidden;
        }
        .feature-card2::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 1.25rem;
          opacity: 0;
          transition: opacity 0.3s ease;
          background: linear-gradient(135deg, rgba(79,70,229,0.02) 0%, transparent 50%);
          pointer-events: none;
        }
        .feature-card2:hover::before { opacity: 1; }
        .feature-card2:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 32px rgba(15,30,69,0.08);
          border-color: #C7D2FE;
        }
        .feature-card2:hover .feature-arrow2 { transform: translateX(4px); }
        @media (prefers-reduced-motion: reduce) {
          .feature-card2, .feature-card2::before, .feature-card2:hover { transform: none; transition: none; }
          .feature-arrow2 { transition: none; }
        }
        .fc-backdrop2 { animation: fcFade2 0.35s ease both; }
        .fc-modal2 { animation: fcPop2 0.5s cubic-bezier(0.22,1,0.36,1) both; }
        .modal-close2:hover { background-color: #E5E7EB; }
        .modal-bullet2:hover {
          transform: translateX(3px);
          box-shadow: 0 2px 8px rgba(15,30,69,0.04);
          border-color: #E5E7EB;
        }
        @keyframes fcFade2 { from { opacity: 0; } to { opacity: 1; } }
        @keyframes fcPop2 {
          0%   { opacity: 0; transform: translateY(24px) scale(0.95); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </section>
  );
}

function TestimonialsCarousel({ lang }: { lang: string }) {
  const [active, setActive] = useState(0);

  const colorMap: Record<string, { bg: string; text: string }> = {
    'bg-blue-600':    { bg: '#2563EB', text: '#fff' },
    'bg-purple-600':  { bg: '#9333EA', text: '#fff' },
    'bg-emerald-600': { bg: '#059669', text: '#fff' },
    'bg-pink-600':    { bg: '#DB2777', text: '#fff' },
    'bg-orange-600':  { bg: '#EA580C', text: '#fff' },
    'bg-teal-600':    { bg: '#0D9488', text: '#fff' },
  };

  const featured = testimonials[active];
  const rest = testimonials.filter((_, i) => i !== active);
  const fc = colorMap[featured.color] ?? { bg: '#2563EB', text: '#fff' };

  return (
    <section style={{ background: 'linear-gradient(180deg, #F8FAFF 0%, #EEF2FF 100%)', padding: '5rem 0', position: 'relative', overflow: 'hidden' }}>
      {/* subtle decorative dots */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle at 25% 50%, rgba(99,102,241,0.03) 0%, transparent 50%)', pointerEvents: 'none' }} />
      <div className="st-width" style={{ position: 'relative', zIndex: 1 }}>

        {/* ── Header ── */}
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <span style={{
            display: 'inline-block', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: '#6366F1', backgroundColor: '#EEF2FF',
            border: '1px solid rgba(99,102,241,0.15)', padding: '4px 14px', borderRadius: 9999, marginBottom: 12,
          }}>
            {lang === 'en' ? 'Teacher Feedback' : 'ගුරු අදහස්'}
          </span>
          <h2 style={{ fontSize: 'clamp(1.5rem,3vw,2.25rem)', fontWeight: 800, color: '#0F1E45', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
            {lang === 'en' ? 'What Teachers Are Saying' : 'ගුරුවරුන් කියන දේ'}
          </h2>
          <p style={{ fontSize: 15, color: '#6B7280', marginTop: 8, maxWidth: 480, margin: '8px auto 0', lineHeight: 1.6 }}>
            {lang === 'en'
              ? 'Real feedback from teachers and school owners using Easyclz every day.'
              : 'ශ්‍රී ලංකාවේ Easyclz භාවිතා කරන ගුරුවරුන්ගේ සැබෑ අදහස්.'}
          </p>
        </div>

        {/* ── Layout: featured left + mini cards right ── */}
        <div className="testimonials-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', alignItems: 'start' }}>

          {/* Featured card */}
          <div key={active} className="featured-card" style={{
            background: '#fff',
            border: '1px solid rgba(229,231,235,0.6)',
            borderRadius: '1.5rem', padding: '2rem',
            boxShadow: '0 4px 20px rgba(15,30,69,0.06)',
            display: 'flex', flexDirection: 'column', gap: '1.25rem',
          }}>
            {/* Quote icon */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, #EEF2FF, #E0E7FF)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="18" height="18" fill="#4F46E5" viewBox="0 0 24 24"><path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z"/></svg>
              </div>
              <div style={{ display: 'flex', gap: 3 }}>
                {[1,2,3,4,5].map((s) => (
                  <svg key={s} width="14" height="14" fill="#F59E0B" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                  </svg>
                ))}
              </div>
            </div>
            <p style={{ fontSize: 16, color: '#374151', lineHeight: 1.75, fontStyle: 'italic' }}>
              &ldquo;{lang === 'en' ? featured.text : featured.textSi}&rdquo;
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderTop: '1px solid #F3F4F6', paddingTop: '1.25rem' }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: `linear-gradient(135deg, ${fc.bg}, ${fc.bg}dd)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 4px 12px ' + fc.bg + '30' }}>
                <span style={{ color: fc.text, fontWeight: 700, fontSize: 16 }}>{featured.initials}</span>
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#0F1E45' }}>{featured.name}</p>
                <p style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{(lang === 'en' ? featured.role : featured.roleSi).split(',').pop()?.trim()}</p>
              </div>
            </div>
          </div>

          {/* Right: 2-column mini cards grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            {rest.slice(0, 4).map((t, i) => {
              const c = colorMap[t.color] ?? { bg: '#2563EB', text: '#fff' };
              return (
                <button key={i}
                  onClick={() => setActive(testimonials.indexOf(t))}
                  className="mini-testimonial"
                  style={{
                    textAlign: 'left', border: '1px solid rgba(229,231,235,0.5)', cursor: 'pointer',
                    background: '#fff',
                    borderRadius: '1.25rem', padding: '1.25rem',
                    display: 'flex', flexDirection: 'column', gap: 10,
                    transition: 'transform 0.18s, box-shadow 0.18s, border-color 0.18s',
                    boxShadow: '0 2px 8px rgba(15,30,69,0.04)',
                  }}
                >
                  <div style={{ display: 'flex', gap: 2 }}>
                    {[1,2,3,4,5].map((s) => (
                      <svg key={s} width="10" height="10" fill="#F59E0B" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                      </svg>
                    ))}
                  </div>
                  <p style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.6, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    &ldquo;{lang === 'en' ? t.text : t.textSi}&rdquo;
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto' }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ color: c.text, fontWeight: 700, fontSize: 10 }}>{t.initials}</span>
                    </div>
                    <div>
                      <p style={{ fontSize: 11.5, fontWeight: 600, color: '#0F1E45' }}>{t.name}</p>
                      <p style={{ fontSize: 9.5, color: '#9CA3AF' }}>{(lang === 'en' ? t.role : t.roleSi).split(',').pop()?.trim()}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Dot indicators */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: '2.5rem' }}>
          {testimonials.map((_, i) => (
            <button key={i} onClick={() => setActive(i)} style={{
              width: i === active ? 28 : 8, height: 8, borderRadius: 9999,
              background: i === active ? 'linear-gradient(90deg, #6366F1, #8B5CF6)' : '#E5E7EB',
              border: 'none', cursor: 'pointer', transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)',
              boxShadow: i === active ? '0 2px 8px rgba(99,102,241,0.3)' : 'none',
            }} />
          ))}
        </div>

      </div>

      <style>{`
        .featured-card {
          animation: fadeSlideUp 0.35s ease both;
        }
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .mini-testimonial:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(15,30,69,0.08);
          border-color: rgba(99,102,241,0.2);
        }
        @media (max-width: 768px) {
          .testimonials-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}



// Phone screen slideshow — slow crossfade between app screens, looping
const phoneSlides = ['/images/home/1.png', '/images/home/2.png'];

function PhoneSlideshow() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((p) => (p + 1) % phoneSlides.length), 4000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="hero-phone-screen">
      {phoneSlides.map((src, idx) => (
        <Image
          key={src}
          src={src}
          alt="Easyclz app screen"
          fill
          sizes="260px"
          priority={idx === 0}
          className="phone-slide"
          style={{ opacity: idx === i ? 1 : 0 }}
        />
      ))}
    </div>
  );
}

// Live iPhone-style status bar: real time + signal/wifi/battery
function PhoneStatusBar() {
  const [time, setTime] = useState('9:41');
  useEffect(() => {
    const fmt = () => {
      const d = new Date();
      let h = d.getHours() % 12;
      if (h === 0) h = 12;
      setTime(`${h}:${String(d.getMinutes()).padStart(2, '0')}`);
    };
    fmt();
    const id = setInterval(fmt, 15000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="phone-statusbar">
      <span className="phone-sb-time">{time}</span>
      <span className="phone-sb-icons">
        {/* signal bars */}
        <svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor" aria-hidden>
          <rect x="0" y="7" width="3" height="4" rx="1" />
          <rect x="4.7" y="5" width="3" height="6" rx="1" />
          <rect x="9.3" y="2.5" width="3" height="8.5" rx="1" />
          <rect x="14" y="0" width="3" height="11" rx="1" />
        </svg>
        {/* wifi */}
        <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor" aria-hidden>
          <path d="M8 2.4c2.5 0 4.8 1 6.5 2.6l-1.4 1.5C11.8 5.3 10 4.5 8 4.5s-3.8.8-5.1 2L1.5 5C3.2 3.4 5.5 2.4 8 2.4z" />
          <path d="M8 6.2c1.4 0 2.7.6 3.6 1.5l-1.5 1.5c-.5-.6-1.3-.9-2.1-.9s-1.6.3-2.1.9L4.4 7.7C5.3 6.8 6.6 6.2 8 6.2z" />
          <circle cx="8" cy="10.4" r="1.3" />
        </svg>
        {/* battery */}
        <span className="phone-sb-battery"><span className="phone-sb-battery-fill" /></span>
      </span>
    </div>
  );
}

export default function HomePage() {
  const { t, lang } = useLanguage();
  const [apkUrl, setApkUrl] = useState('');

  // APK download link is set in the super-admin "Website" page (shared Supabase).
  useEffect(() => {
    fetchApkDownloadUrl().then(setApkUrl);
  }, []);

  return (
    <div>
      <div className="bg-no-repeat bg-center bg-cover bg-home pt-[80px]">
      <Header />

      {/* Hero Section */}
      <section className="st-width" style={{ marginTop: '6rem', paddingTop: '2.5rem', paddingBottom: '2rem' }}>
       <div className="hero-flex">
        <div className="hero-text">

          {/* ── Badge ── */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            background: 'linear-gradient(135deg, #EEF2FF, #F0FDF4)',
            border: '1px solid rgba(99,102,241,0.12)',
            borderRadius: 9999, padding: '4px 16px 4px 4px',
            marginBottom: '1rem',
          }}>
            <span style={{
              background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
              color: '#fff', borderRadius: 9999, padding: '3px 11px',
              fontSize: 10.5, fontWeight: 700, letterSpacing: '0.03em',
              textTransform: 'uppercase',
              boxShadow: '0 2px 6px rgba(99,102,241,0.25)',
            }}>
              {lang === 'en' ? 'New' : 'අලුත්'}
            </span>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: '#4F46E5' }}>
              {lang === 'en' ? 'Online exams with anti-cheat' : 'වංචා වැළැක්වීම සහිත මාර්ගගත විභාග'}
            </span>
          </div>

          {/* ── Hero heading ── */}
          <h1 style={{
            fontSize: 'clamp(2.25rem, 5vw, 3.75rem)',
            fontWeight: 800,
            lineHeight: 1.08,
            letterSpacing: '-0.03em',
            color: '#0F1E45',
            textAlign: 'left',
          }}>
            {lang === 'en' ? (
              <>
                Manage Your{' '}
                <span style={{ position: 'relative', display: 'inline-block' }}>
                  <span style={{
                    background: 'linear-gradient(135deg, #2563EB 0%, #7C3AED 60%, #DB2777 100%)',
                    backgroundSize: '200% auto',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    animation: 'heroGradientShift 4s ease infinite',
                  }}>Classes,</span>
                </span>
                <br />
                Focus on{' '}
                <span style={{
                  background: 'linear-gradient(135deg, #059669 0%, #0EA5E9 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}>Teaching.</span>
              </>
            ) : (
              <>
                ඔබේ පන්ති{' '}
                <span style={{
                  background: 'linear-gradient(135deg, #2563EB 0%, #7C3AED 100%)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}>කළමනාකරණය,</span>
                <br />
                ඉගැන්වීමට{' '}
                <span style={{
                  background: 'linear-gradient(135deg, #059669 0%, #0EA5E9 100%)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}>අවධානය.</span>
              </>
            )}
          </h1>

          {/* ── Description ── */}
          <p style={{
            marginTop: '1.5rem',
            fontSize: 17,
            lineHeight: 1.75,
            color: '#4B5563',
            maxWidth: 520,
            textAlign: 'left',
          }}>
            {lang === 'en'
              ? 'Easyclz is the all-in-one class management system for Sri Lankan teachers — track students, fees, exams, and attendance. Works offline, sends SMS alerts, and eliminates paperwork.'
              : 'Easyclz, ශ්‍රී ලාංකික ගුරුවරුන් සඳහා පන්ති කළමනාකරණ පද්ධතිය. ශිෂ්‍යයන්, ගාස්තු, විභාග, පැමිණීම, ඕෆ්ලයින් වැඩ කරයි, SMS යවයි.'}
          </p>

          {/* ── Feature pills ── */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.625rem', marginTop: '1.75rem' }}>
            {[
              { text: lang === 'en' ? 'Offline-first' : 'ඕෆ්ලයින්', color: '#2563EB', bg: '#EFF6FF' },
              { text: lang === 'en' ? 'SMS alerts' : 'SMS ඇඟවීම්', color: '#059669', bg: '#ECFDF5' },
              { text: lang === 'en' ? 'Student portal' : 'ශිෂ්‍ය portal', color: '#7C3AED', bg: '#F5F3FF' },
              { text: lang === 'en' ? 'iOS & Android' : 'iOS & Android', color: '#DB2777', bg: '#FDF2F8' },
            ].map((pill) => (
              <span key={pill.text} className="hero-pill" style={{
                fontSize: 12.5, fontWeight: 600, color: pill.color,
                backgroundColor: pill.bg,
                border: '1px solid transparent',
                borderRadius: 9999,
                padding: '6px 15px',
                whiteSpace: 'nowrap',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                cursor: 'default',
                boxShadow: `0 1px 3px ${pill.color}08`,
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10" fill={pill.color} opacity="0.15" />
                  <path d="M8 12l3 3 5-5" stroke={pill.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {pill.text}
              </span>
            ))}
          </div>

          {/* ── Download CTA ── */}
          <div className="mt-10" style={{
            background: 'linear-gradient(135deg, #F8FAFF 0%, #F0F4FF 50%, #FAF5FF 100%)',
            border: '1px solid rgba(99,102,241,0.12)',
            borderRadius: 20,
            padding: '1.5rem 1.75rem',
            maxWidth: 540,
            boxShadow: '0 4px 20px rgba(99,102,241,0.06)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              <div style={{
                width: 46, height: 46, borderRadius: 14,
                background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', boxShadow: '0 4px 12px rgba(99,102,241,0.3)',
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="5" y="2" width="14" height="20" rx="2" /><line x1="12" y1="18" x2="12" y2="18" />
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0F1E45', lineHeight: 1.3 }}>
                  {lang === 'en' ? 'Download the Teacher App' : 'ගුරු යෙදවුම බාගන්න'}
                </div>
                <div style={{ fontSize: 12.5, color: '#6B7280', lineHeight: 1.3, marginTop: 1 }}>
                  {lang === 'en' ? 'Manage classes from your phone' : 'ඔබගේ දුරකථනයෙන් පන්ති කළමනාකරණය කරන්න'}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
              {apkUrl ? (
                <a
                  href={apkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Get it on Google Play"
                  className="store-badge-link"
                  style={{ display: 'inline-block', position: 'relative', overflow: 'hidden', borderRadius: 12, filter: 'drop-shadow(0 2px 6px rgba(15,30,69,0.06))' }}
                >
                  <Image
                    src="/images/hero/google.webp"
                    alt="Get it on Google Play"
                    width={156}
                    height={46}
                    style={{ height: 46, width: 'auto', display: 'block', borderRadius: 12 }}
                  />
                  <span className="badge-shine" style={{
                    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                    pointerEvents: 'none', borderRadius: 12,
                  }} />
                </a>
              ) : (
                <Image
                  src="/images/hero/google.webp"
                  alt="Get it on Google Play"
                  width={156}
                  height={46}
                  style={{ height: 46, width: 'auto', display: 'block', borderRadius: 12, opacity: 0.55 }}
                />
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(99,102,241,0.08)' }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'linear-gradient(135deg, #ECFDF5, #D1FAE5)',
                borderRadius: 9999, padding: '4px 12px 4px 8px',
                fontSize: 12, fontWeight: 600, color: '#065F46',
              }}>
                <span style={{ position: 'relative', display: 'inline-flex' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#10B981', display: 'block' }} />
                  <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', backgroundColor: '#10B981', animation: 'ping 1.4s cubic-bezier(0,0,0.2,1) infinite' }} />
                </span>
                {lang === 'en' ? 'Free Trial' : 'නොමිලේ'}
              </span>
              <span style={{ fontSize: 12.5, color: '#374151', fontWeight: 500 }}>
                {lang === 'en'
                  ? <>14-day free trial &nbsp;·&nbsp; No credit card</>
                  : <>දින 14 නොමිලේ &nbsp;·&nbsp; Credit card අවශ්‍ය නැත</>}
              </span>
            </div>
          </div>

        </div>
        {/* ── Phone mockup stage ── */}
        <div className="hero-stage">

          {/* decorative dots */}
          <div className="hero-dot hero-dot-tl" />
          <div className="hero-dot hero-dot-br" />

          {/* floating stat — top left */}
          <div className="hero-float hero-float-1">
            <div className="hero-float-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            </div>
            <div>
              <span className="hero-float-num">10</span>
              <span className="hero-float-label">{lang === 'en' ? 'tools' : 'tools'}</span>
            </div>
          </div>

          {/* floating stat — bottom right */}
          <div className="hero-float hero-float-2">
            <div className="hero-float-icon" style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
            </div>
            <div>
              <span className="hero-float-label">{lang === 'en' ? 'Works' : 'වැඩ කරයි'}</span>
              <span className="hero-float-num">Offline</span>
            </div>
          </div>

          {/* floating store badge — Google Play (top right) */}
          {apkUrl ? (
            <a href={apkUrl} target="_blank" rel="noopener noreferrer" className="hero-badge hero-badge-google" aria-label="Get it on Google Play">
              <Image src="/Google-Play.webp" alt="Get it on Google Play" width={150} height={45} style={{ width: 150, height: 'auto', display: 'block' }} />
            </a>
          ) : (
            <div className="hero-badge hero-badge-google">
              <Image src="/Google-Play.webp" alt="Get it on Google Play" width={150} height={45} style={{ width: 150, height: 'auto', display: 'block' }} />
            </div>
          )}

          {/* floating store badge — App Store (bottom left) */}
          <div className="hero-badge hero-badge-apple">
            <Image src="/App-Store.webp" alt="Download on the App Store" width={140} height={46} style={{ width: 140, height: 'auto', display: 'block' }} />
          </div>

          {/* phone */}
          <div className="hero-phone">
            <PhoneSlideshow />
            <div className="phone-status-bg" />
            <span className="hero-phone-dynamic-island" />
            <PhoneStatusBar />
            <div className="hero-phone-home-indicator" />
          </div>
        </div>
       </div>{/* /hero-flex */}

        <style>{`
          @keyframes heroGradientShift {
            0%, 100% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
          }
          @keyframes ping {
            75%, 100% { transform: scale(2); opacity: 0; }
          }

          /* Two-part hero: text left, phone right (real flexbox, not Tailwind) */
          .hero-flex {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 2.5rem;
          }
          .hero-text { width: 100%; }
          @media (min-width: 768px) {
            .hero-flex { flex-direction: row; align-items: center; gap: 3rem; }
            .hero-text { flex: 1 1 0%; min-width: 0; }
            .hero-stage { flex: 0 0 470px; }
          }

          .hero-stage {
            position: relative;
            display: flex; align-items: center; justify-content: center;
            min-height: 580px;
          }
          /* phone frame */
          .hero-phone {
            position: relative;
            width: 304px; height: 616px;
            background: linear-gradient(145deg, #1a1a2e, #111827);
            border-radius: 48px;
            padding: 12px;
            box-shadow:
              0 30px 80px rgba(15,30,69,0.2),
              0 8px 24px rgba(15,30,69,0.08),
              inset 0 0 1px rgba(255,255,255,0.08);
            animation: heroPhoneFloat 6s ease-in-out infinite;
          }
          .hero-phone-screen {
            position: relative; width: 100%; height: 100%;
            border-radius: 36px; overflow: hidden; background: #fff;
          }
          /* slideshow crossfade */
          .phone-slide {
            object-fit: cover; object-position: top center;
            transition: opacity 1.6s ease-in-out;
          }
          @media (prefers-reduced-motion: reduce) {
            .phone-slide { transition: none; }
          }
          .hero-phone-dynamic-island {
            position: absolute; top: 16px; left: 50%; transform: translateX(-50%);
            width: 84px; height: 22px; background: #000;
            border-radius: 12px; z-index: 5;
          }
          /* white status strip behind the icons (a bit taller than the island) */
          .phone-status-bg {
            position: absolute; top: 12px; left: 12px; right: 12px; height: 40px; z-index: 4;
            background: #fff; border-radius: 36px 36px 0 0; pointer-events: none;
          }
          /* status row — sits level with the island, time left / icons right */
          .phone-statusbar {
            position: absolute; top: 16px; left: 12px; right: 12px; height: 22px; z-index: 6;
            display: flex; align-items: center; justify-content: space-between;
            padding: 0 20px; color: #0F1E45; pointer-events: none;
          }
          .phone-sb-time { font-size: 14px; font-weight: 700; letter-spacing: 0.02em; }
          .phone-sb-icons { display: inline-flex; align-items: center; gap: 6px; }
          .phone-sb-battery {
            position: relative; display: inline-block; width: 23px; height: 11px;
            border: 1px solid currentColor; border-radius: 3px; opacity: 0.95;
          }
          .phone-sb-battery::after {
            content: ''; position: absolute; right: -3px; top: 3px;
            width: 2px; height: 5px; background: currentColor; border-radius: 0 1px 1px 0;
          }
          .phone-sb-battery-fill {
            position: absolute; left: 1.5px; top: 1.5px; bottom: 1.5px;
            width: 72%; background: currentColor; border-radius: 1.5px;
          }
          .hero-phone-home-indicator {
            position: absolute; bottom: 18px; left: 50%; transform: translateX(-50%);
            width: 100px; height: 4px; background: rgba(255,255,255,0.15);
            border-radius: 2px; z-index: 3;
          }
          /* floating cards */
          .hero-float {
            position: absolute; z-index: 3;
            background: rgba(255,255,255,0.92);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            border: 1px solid rgba(255,255,255,0.6);
            border-radius: 18px;
            padding: 14px 18px;
            display: flex; align-items: center; gap: 12px;
            box-shadow: 0 14px 40px rgba(15,30,69,0.1);
          }
          .hero-float-icon {
            width: 36px; height: 36px; border-radius: 12px;
            background: linear-gradient(135deg, #6366F1, #8B5CF6);
            display: flex; align-items: center; justify-content: center;
            flex-shrink: 0;
            box-shadow: 0 4px 10px rgba(99,102,241,0.2);
          }
          .hero-float-num {
            font-size: 20px; font-weight: 800; color: #0F1E45;
            line-height: 1.1; display: block;
          }
          .hero-float-label {
            font-size: 12px; font-weight: 500; color: #6B7280;
            display: block; margin-top: 1px;
          }
          .hero-float-1 { top: 12%; left: -8%; animation: heroFloat 4.4s ease-in-out infinite; }
          .hero-float-2 { bottom: 14%; right: -8%; animation: heroFloat 5s ease-in-out infinite 0.5s; }
          /* decorative dots */
          .hero-dot {
            position: absolute; z-index: 1;
            width: 10px; height: 10px; border-radius: 50%;
          }
          .hero-dot-tl { top: 6%; left: 6%; background: #34D399; box-shadow: 0 0 20px rgba(52,211,153,0.3); }
          .hero-dot-br { bottom: 8%; right: 10%; background: #818CF8; box-shadow: 0 0 20px rgba(129,140,248,0.3); }

          /* floating store badges */
          .hero-badge { position: absolute; z-index: 3; display: block; line-height: 0;
            filter: drop-shadow(0 10px 24px rgba(15,30,69,0.16)); border-radius: 12px; }
          .hero-badge img { border-radius: 12px; }
          .hero-badge-google { top: 30%; right: -10%; animation: heroFloat 5.2s ease-in-out infinite 0.2s; }
          .hero-badge-apple  { bottom: 26%; left: -9%; animation: heroFloat 4.8s ease-in-out infinite 0.6s; }
          a.hero-badge { transition: transform 0.18s ease; }
          a.hero-badge:hover { transform: translateY(-3px); }

          /* pills */
          .hero-pill { transition: all 0.2s ease; }
          .hero-pill:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(15,30,69,0.06); }

          .store-badge-link { transition: transform 0.18s, filter 0.18s; }
          .store-badge-link:hover { transform: translateY(-2px); filter: drop-shadow(0 4px 12px rgba(99,102,241,0.2)); }
          .badge-shine {
            background: linear-gradient(120deg, transparent 0%, transparent 30%, rgba(255,255,255,0.5) 50%, transparent 70%, transparent 100%);
            background-size: 250% 100%;
            background-position: 200% 0;
            transition: background-position 0s;
          }
          .store-badge-link:hover .badge-shine {
            background-position: -60% 0;
            transition: background-position 0.55s ease;
          }

          @keyframes heroFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
          @keyframes heroPhoneFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }

          @media (max-width: 767px) {
            .hero-stage { min-height: 520px; overflow: hidden; }
            .hero-float-1 { left: 2%; }
            .hero-float-2 { right: 2%; }
            .hero-badge-google { right: 0; }
            .hero-badge-apple { left: 0; }
          }
          @media (max-width: 380px) {
            .hero-float { padding: 10px 14px; }
            .hero-badge img { width: 120px !important; }
          }
          @media (prefers-reduced-motion: reduce) {
            .hero-phone, .hero-float-1, .hero-float-2, .hero-badge { animation: none; }
          }
        `}</style>
      </section>
      </div>{/* /bg-home */}

      {/* Features Tabs Section */}
      <FeaturesSection lang={lang} />

      {/* Testimonials Section */}
      <TestimonialsCarousel lang={lang} />



      {/* Pricing Preview */}
      <section style={{ background: 'linear-gradient(180deg, #F8FAFF 0%, #EEF2FF 100%)', padding: '5rem 0', position: 'relative', overflow: 'hidden' }}>
        <div className="st-width">

          {/* ── Section header ── */}
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <span style={{
              display: 'inline-block', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: '#6366F1', backgroundColor: '#EEF2FF',
              border: '1px solid rgba(99,102,241,0.15)', padding: '4px 14px', borderRadius: 9999, marginBottom: 12,
            }}>
              {lang === 'en' ? 'Pricing' : 'මිල ගණන්'}
            </span>
            <h2 style={{ fontSize: 'clamp(1.5rem,3vw,2.25rem)', fontWeight: 800, color: '#0F1E45', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              {lang === 'en' ? 'Simple, honest pricing' : 'සරල, සාධාරණ මිල ගණන්'}
            </h2>
            <p style={{ fontSize: 15, color: '#6B7280', marginTop: 8, maxWidth: 480, margin: '8px auto 0', lineHeight: 1.6 }}>
              {lang === 'en'
                ? 'No hidden fees. Cancel anytime. Start with a 14-day free trial.'
                : 'සැඟවුණු ගාස්තු නැත. ඕනෑම විටෙක අවලංගු කරන්න.'}
            </p>
          </div>

          {/* ── Pricing cards ── */}
          <div className="pricing-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.25rem' }}>
            {[
              { name: 'Starter', nameSi: 'ස්ටාටර්', students: 'Up to 50 students', studentsSi: 'ශිෂ්‍යයන් 50 දක්වා', price: 1, features: ['Full platform access', 'Teacher Mobile App', 'Student Portal', 'Payments, Attendance, Exams, and Reports'] },
              { name: 'Basic', nameSi: 'බේසික්', students: 'Up to 100 students', studentsSi: 'ශිෂ්‍යයන් 100 දක්වා', price: 3, features: ['Full platform access', 'Teacher Mobile App', 'Student Portal', 'Payments, Attendance, Exams, and Reports'] },
              { name: 'Growth', nameSi: 'ග්‍රෝත්', students: 'Up to 500 students', studentsSi: 'ශිෂ්‍යයන් 500 දක්වා', price: 8, popular: true, features: ['Full platform access', 'Teacher Mobile App', 'Student Portal', 'Payments, Attendance, Exams, and Reports'] },
              { name: 'Unlimited', nameSi: 'අසීමිත', students: 'Unlimited students', studentsSi: 'අසීමිත ශිෂ්‍යයන්', price: 25, features: ['Full platform access', 'Teacher Mobile App', 'Student Portal', 'Payments, Attendance, Exams, and Reports'] },
            ].map((plan, idx) => (
              <div key={plan.name} className="pricing-card" style={{
                background: plan.popular ? 'linear-gradient(135deg, #0F1E45, #1E3A5F)' : '#fff',
                border: plan.popular ? '1px solid rgba(99,102,241,0.2)' : '1px solid rgba(229,231,235,0.5)',
                borderRadius: '1.5rem',
                padding: '2rem 1.5rem',
                boxShadow: plan.popular ? '0 12px 40px rgba(15,30,69,0.2), 0 2px 8px rgba(99,102,241,0.1)' : '0 4px 16px rgba(15,30,69,0.04)',
                display: 'flex', flexDirection: 'column',
                position: 'relative',
                transform: plan.popular ? 'scale(1.04)' : 'none',
                transition: 'transform 0.25s, box-shadow 0.25s',
              }}>
                {plan.popular && (
                  <div style={{
                    position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                    background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
                    color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
                    padding: '4px 16px', borderRadius: 9999, whiteSpace: 'nowrap',
                    boxShadow: '0 4px 12px rgba(99,102,241,0.3)',
                  }}>
                    {lang === 'en' ? 'Most Popular' : 'වඩාත් ජනප්‍රිය'}
                  </div>
                )}
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: plan.popular ? '#fff' : '#0F1E45' }}>
                    {lang === 'en' ? plan.name : plan.nameSi}
                  </div>
                  <div style={{ fontSize: 12.5, color: plan.popular ? 'rgba(255,255,255,0.6)' : '#6B7280', marginTop: 2 }}>
                    {lang === 'en' ? plan.students : plan.studentsSi}
                  </div>
                </div>
                <div style={{ marginBottom: '1.5rem' }}>
                  <span style={{ fontSize: 36, fontWeight: 800, color: plan.popular ? '#fff' : '#0F1E45' }}>${plan.price}</span>
                  <span style={{ fontSize: 13, color: plan.popular ? 'rgba(255,255,255,0.5)' : '#9CA3AF', marginLeft: 4 }}>/month</span>
                </div>
                <ul style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: '1.5rem', flex: 1 }}>
                  {plan.features.map((f) => (
                    <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                        <circle cx="12" cy="12" r="10" fill={plan.popular ? 'rgba(99,102,241,0.2)' : '#EEF2FF'} />
                        <path d="M8 12l3 3 5-5" stroke={plan.popular ? '#818CF8' : '#6366F1'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span style={{ fontSize: 13, fontWeight: 500, color: plan.popular ? 'rgba(255,255,255,0.8)' : '#4B5563' }}>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/contact"
                  style={{
                    display: 'block', textAlign: 'center', padding: '12px 0',
                    borderRadius: 12, fontSize: 14, fontWeight: 700, textDecoration: 'none',
                    background: plan.popular ? 'linear-gradient(135deg, #6366F1, #8B5CF6)' : 'transparent',
                    color: plan.popular ? '#fff' : '#6366F1',
                    border: plan.popular ? 'none' : '1.5px solid #6366F1',
                    transition: 'opacity 0.18s, transform 0.18s',
                  }}
                  className="pricing-cta"
                >
                  {lang === 'en' ? (plan.popular ? 'Start Free Trial' : 'Get Started') : (plan.popular ? 'නොමිලේ ආරම්භ' : 'ආරම්භ කරන්න')}
                </Link>
              </div>
            ))}
          </div>

          <div style={{ textAlign: 'center', marginTop: '2.5rem' }}>
            <Link href="/pricing" style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              fontSize: 14, fontWeight: 600, color: '#6366F1', textDecoration: 'none',
              transition: 'gap 0.18s',
            }}
            className="pricing-link"
            >
              {lang === 'en' ? 'View Full Pricing Details' : 'සම්පූර්ණ මිල ගණන් බලන්න'}
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                <path d="M3.33337 9.16669V10.8334H13.3334L8.75004 15.4167L9.93337 16.6L16.5334 10L9.93337 3.40002L8.75004 4.58336L13.3334 9.16669H3.33337Z" fill="currentColor" />
              </svg>
            </Link>
          </div>

        </div>

        <style>{`
          .pricing-grid {
            animation: fadeIn 0.4s ease both;
          }
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(12px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .pricing-card:hover {
            transform: translateY(-4px);
            box-shadow: 0 16px 48px rgba(15,30,69,0.12) !important;
          }
          .pricing-cta:hover {
            opacity: 0.9;
            transform: translateY(-1px);
          }
          .pricing-link:hover {
            gap: 12px !important;
          }
          @media (max-width: 1024px) {
            .pricing-grid { grid-template-columns: repeat(2, 1fr) !important; }
          }
          @media (max-width: 640px) {
            .pricing-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>
      </section>

      <Footer />

      {/* Swiper + Splide initialization scripts */}
      <Script id="feature-swiper-init" strategy="afterInteractive">{`
        (function() {
          var featureTitles = [
            "Student Management", "Payment Management", "Exam Monitoring",
            "Teacher Mobile App", "Reports & SMS", "Student Portal"
          ];
          var featureCount = featureTitles.length;

          function getTabButtons() {
            return document.querySelectorAll('#features-tabs .tab-feature');
          }

          function updateTabs(activeIdx) {
            var tabButtons = getTabButtons();
            tabButtons.forEach(function(btn, idx) {
              var label = btn.querySelector('.tab-label');
              var underline = btn.querySelector('.tab-underline');
              if (idx === activeIdx) {
                if (label) { label.style.color = 'var(--primaryred-100)'; label.style.fontWeight = '700'; }
                if (underline) { underline.style.display = 'block'; underline.style.background = 'var(--primaryred-100)'; }
              } else {
                if (label) { label.style.color = 'var(--neutralsgray-500)'; label.style.fontWeight = '400'; }
                if (underline) { underline.style.display = 'none'; }
              }
            });
          }

          document.addEventListener('DOMContentLoaded', function() {
            var desktopSwiper = null;
            if (window.Swiper && window.matchMedia('(min-width: 1024px)').matches) {
              desktopSwiper = new Swiper("#features-swiper-desktop", {
                loop: true,
                speed: 600,
                slidesPerView: 2,
                spaceBetween: 33,
                centeredSlides: false,
                navigation: {
                  nextEl: ".swiper-button-next",
                  prevEl: ".swiper-button-prev",
                },
                on: {
                  init: function() {
                    updateTabs(this.realIndex);
                    var tabButtons = getTabButtons();
                    var sw = this;
                    tabButtons.forEach(function(btn, idx) {
                      btn.onclick = function() { sw.slideToLoop(idx); };
                    });
                  },
                  slideChangeTransitionStart: function() {
                    updateTabs(this.realIndex);
                  },
                },
              });
            }

            if (window.Swiper && window.matchMedia('(max-width: 1023px)').matches) {
              new Swiper("#features-swiper-mobile", {
                loop: true,
                speed: 600,
                slidesPerView: 1,
                spaceBetween: 0,
                autoplay: { delay: 3000, disableOnInteraction: false },
                on: {
                  init: function() { updateTabs(this.realIndex); },
                  slideChangeTransitionStart: function() { updateTabs(this.realIndex); },
                },
              });
            }

            if (window.Splide) {
              var testimonials = new Splide("#testimonials", {
                type: "slide",
                perPage: 1,
                perMove: 1,
                arrows: false,
                autoWidth: true,
              });
              testimonials.mount();

              var prevBtn = document.getElementById("testimonials__prevBtn");
              var nextBtn = document.getElementById("testimonials__nextBtn");
              if (prevBtn) prevBtn.addEventListener("click", function() { testimonials.go("<"); });
              if (nextBtn) nextBtn.addEventListener("click", function() { testimonials.go(">"); });
            }
          });
        })();
      `}</Script>
    </div>
  );
}
