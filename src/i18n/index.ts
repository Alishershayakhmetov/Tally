// Hermes may lack Intl.PluralRules, which i18next needs for Russian plurals;
// this polyfill only installs itself when the built-in one is missing.
import 'intl-pluralrules';

import { getLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import type { LanguagePref } from '@/domain/settings';

import en from './en.json';
import ru from './ru.json';

export type Language = 'en' | 'ru';

/** The first of the phone's preferred languages that the app supports. */
export function deviceLanguage(): Language {
  for (const locale of getLocales()) {
    if (locale.languageCode === 'en' || locale.languageCode === 'ru') return locale.languageCode;
  }
  return 'en';
}

export function resolveLanguage(pref: LanguagePref): Language {
  return pref === 'system' ? deviceLanguage() : pref;
}

const i18n = createInstance();

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ru: { translation: ru } },
  lng: deviceLanguage(),
  fallbackLng: 'en',
  initAsync: false,
  interpolation: { escapeValue: false },
});

export default i18n;
