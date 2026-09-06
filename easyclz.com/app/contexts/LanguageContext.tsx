'use client';
import { createContext, useContext, useState, ReactNode } from 'react';
import { translations } from '../lib/translations';

type Lang = 'en' | 'si';

const LanguageContext = createContext<{
  lang: Lang;
  setLang: (l: Lang) => void;
  t: typeof translations.en;
}>({
  lang: 'en',
  setLang: () => {},
  t: translations.en,
});

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [lang, setLang] = useState<Lang>('en');
  return (
    <LanguageContext.Provider value={{ lang, setLang, t: translations[lang] }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
