import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  readAppPreferences,
  resolveUiLocale,
  type UiLanguagePreference,
  type UiLocale,
} from './app-preferences';
import type { UiTranslator } from './ui-localization';
export type { UiTranslator } from './ui-localization';

interface UiLocaleContextValue {
  locale: UiLocale;
  languagePreference: UiLanguagePreference;
  t: UiTranslator;
}

const UI_LANGUAGE_CHANGED = 'fielora:ui-language-changed';
const defaultValue: UiLocaleContextValue = {
  locale: 'zh-CN',
  languagePreference: 'SYSTEM',
  t: (simplifiedChinese) => simplifiedChinese,
};
const UiLocaleContext = createContext<UiLocaleContextValue>(defaultValue);

function systemLocale(): string {
  return typeof navigator === 'undefined' ? 'en' : navigator.language || navigator.languages?.[0] || 'en';
}

export function notifyUiLanguagePreferenceChanged(languagePreference: UiLanguagePreference): void {
  window.dispatchEvent(new CustomEvent<UiLanguagePreference>(UI_LANGUAGE_CHANGED, { detail: languagePreference }));
}

export function UiLocaleProvider({ children }: { children: ReactNode }) {
  const [languagePreference, setLanguagePreference] = useState<UiLanguagePreference>(() => readAppPreferences(window.localStorage).languagePreference);
  const locale = resolveUiLocale(languagePreference, systemLocale());
  const t = useCallback<UiTranslator>((simplifiedChinese, english) => locale === 'zh-CN' ? simplifiedChinese : english, [locale]);

  useEffect(() => {
    const changed = (event: Event) => setLanguagePreference((event as CustomEvent<UiLanguagePreference>).detail);
    window.addEventListener(UI_LANGUAGE_CHANGED, changed);
    return () => window.removeEventListener(UI_LANGUAGE_CHANGED, changed);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dataset.uiLocale = locale;
  }, [locale]);

  const value = useMemo(() => ({ locale, languagePreference, t }), [languagePreference, locale, t]);
  return <UiLocaleContext.Provider value={value}>{children}</UiLocaleContext.Provider>;
}

export function useUiLocale(): UiLocaleContextValue {
  return useContext(UiLocaleContext);
}
