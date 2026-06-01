import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import resourcesToBackend from 'i18next-resources-to-backend';
import { auth, db } from '../lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';

i18n
  .use(resourcesToBackend((language: string, namespace: string) => import(`./locales/${language}/${namespace}.json`)))
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    supportedLngs: ['en', 'fr'],
    ns: ['translation', 'common', 'auth', 'dashboard', 'admin', 'network', 'rankings', 'settings', 'reports', 'validation'],
    defaultNS: 'translation',
    
    interpolation: {
      escapeValue: false, // not needed for react as it escapes by default
    },
    detection: {
      order: ['querystring', 'cookie', 'localStorage', 'sessionStorage', 'navigator', 'htmlTag'],
      lookupLocalStorage: 'i18nextLng',
      caches: ['localStorage', 'cookie'],
    }
  });

// Automatically update HTML lang attribute
i18n.on('languageChanged', (lng) => {
  document.documentElement.setAttribute('lang', lng);
  
  // Try to update user preference in Firestore if logged in
  if (auth.currentUser) {
    const userRef = doc(db, 'users', auth.currentUser.uid);
    updateDoc(userRef, { preferredLanguage: lng }).catch(console.error);
  }
});

export default i18n;
