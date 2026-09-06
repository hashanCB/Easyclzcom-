export type BlogPost = {
  key: string;
  titleEn: string;
  titleSi: string;
  excerptEn: string;
  excerptSi: string;
  date: string;
  author: string;
  bodyEn: string[];
  bodySi: string[];
  img: string;
};

export const posts: BlogPost[] = [
  {
    key: 'welcome-to-easyclz',
    titleEn: 'Introducing Easyclz: Class Management Made Simple for Sri Lankan Tutors',
    titleSi: 'Easyclz හඳුන්වාදීම: ශ්‍රී ලාංකික උපදේශකයින් සඳහා පන්ති කළමනාකරණය සරල කිරීම',
    excerptEn: 'Why we built Easyclz, and how it helps tuition teachers manage attendance, payments, exams, and communication from one app.',
    excerptSi: 'Easyclz සැකසූ හේතුව සහ එය හරහා පැමිණීම්, ගෙවීම්, විභාග සහ සන්නිවේදනය එක තැනකින් කළමනාකරණය කරන ආකාරය.',
    date: '2026-06-16',
    author: 'The Easyclz Team',
    img: '/images/ai/1.png',
    bodyEn: [
      "Most tuition teachers in Sri Lanka run their classes with a mix of notebooks, WhatsApp groups, and memory. It works, until a class grows past 30 or 40 students, then attendance gets messy, fee collection turns into a monthly chase, and finding one student's exam marks from three months ago means flipping through old papers.",
      "We built Easyclz to fix that. It's a single app where a teacher can manage everything a tuition class actually needs: student profiles, daily attendance, exam marks, payments, and class communication, without juggling five different tools.",
      "Attendance can be marked in seconds with a QR scan, even offline, and syncs automatically once the connection is back. Parents get an SMS the moment their child is marked absent, so there's no need to manually follow up with phone calls.",
      "On the payment side, teachers can set a standard fee, a custom amount, or a free seat when adding a student, then track who has paid and who hasn't, by class or across the whole system, instead of relying on a mental list or a notebook.",
      "Exams work the same way: create an exam, enter marks once, and Easyclz generates printable mark sheets and reports automatically. Students can see their own marks, attendance, payment history, and class notes by logging into the student portal, no more 'sir, what did I get for the last test?' messages.",
      "As classes grow, teachers can bring in an assistant who collects payments and marks attendance through their own app, without ever touching the teacher's main account.",
      "This is just the first post. Over the next few weeks we'll be sharing how individual features work, tips from teachers already using Easyclz, and what we're building next. If you teach tuition classes and want to see it in action, you can start a free 14-day trial, no credit card required.",
    ],
    bodySi: [
      "ශ්‍රී ලංකාවේ බොහෝ උපදේශක ගුරුවරුන් පොත්, WhatsApp groups සහ මතකය මත රඳා පවතිමින් පන්ති පවත්වනවා. ශිෂ්‍ය සංඛ්‍යාව 30-40 ඉක්මවන විට පැමිණීම, ගාස්තු එකතු කිරීම සහ පැරණි ලකුණු සොයා ගැනීම අසීරු වෙනවා.",
      "මෙය විසඳීමට Easyclz සැකසුවා. ශිෂ්‍ය පැතිකඩ, දෛනික පැමිණීම, විභාග ලකුණු, ගෙවීම් සහ class සන්නිවේදනය, සියල්ල එක app එකකින් කළමනාකරණය කළ හැකියි.",
      "QR scan මගින් තත්පර කිහිපයකින් පැමිණීම සලකුණු කළ හැකි අතර, offline වුවත් ක්‍රියා කරයි. නොපැමිණි විට දෙමාපියන්ට SMS එකක් ස්වයංක්‍රීයව යවනු ලැබේ.",
      "ගෙවීම් සඳහා standard fee, custom amount, හෝ free seat සකස් කළ හැකි අතර, class එකකට හෝ සම්පූර්ණ පද්ධතියටම කවුද ගෙව්වේ කවුද නොගෙව්වේ දැකගත හැකියි.",
      "විභාග සාදා ලකුණු එක් වරක් ඇතුළත් කළ පසු, මුද්‍රිත ලකුණු පත්‍ර සහ වාර්තා ස්වයංක්‍රීයව ජනනය වේ. ශිෂ්‍යයන්ට ශිෂ්‍ය ද්වාරයෙන් ලකුණු, පැමිණීම, ගෙවීම් සහ class notes බැලිය හැකියි.",
      "පන්ති වැඩි වනවිට, ගුරුවරයාගේ ප්‍රධාන ගිණුමට ස්පර්ශ නොකර ගෙවීම් එකතු කිරීමට සහ පැමිණීම සලකුණු කිරීමට සහයකයෙකු එක් කරගත හැකියි.",
      "මේක අපේ පළමු blog post එකයි. ඉදිරි සති කිහිපය තුළ විශේෂාංග, ගුරුවරුන්ගේ අත්දැකීම් සහ අපි ඉදිරියට සකස් කරන දේවල් ගැන share කරන්නෙමු. 14 දින නොමිලේ trial එකක් ආරම්භ කරන්න, credit card අවශ්‍ය නැත.",
    ],
  },
];
