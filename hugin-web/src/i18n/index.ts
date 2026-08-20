import {
  createContext,
  createElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'
import { en } from './en'
import { nb } from './nb'

export type Lang = 'nb' | 'en'
export type TranslationKey = keyof typeof nb

const TABLES: Record<Lang, Record<TranslationKey, string>> = { nb, en }
const LOCALES: Record<Lang, string> = { nb: 'nb-NO', en: 'en-GB' }
const STORAGE_KEY = 'hugin-lang'

/** `nb-NO`/`en-GB` for date formatting (spec: keep nb-NO for nb, use en-GB for en). */
export function localeFor(lang: Lang): string {
  return LOCALES[lang]
}

/** localStorage `hugin-lang` wins; otherwise nb/no browsers get nb, everyone else gets en. */
function detectLang(): Lang {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'nb' || stored === 'en') return stored
  } catch {
    /* localStorage unavailable (private mode etc.) — fall through to browser detection */
  }
  const browserLang = typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : ''
  return browserLang.startsWith('nb') || browserLang.startsWith('no') ? 'nb' : 'en'
}

interface LanguageContextValue {
  lang: Lang
  setLang: (lang: Lang) => void
}

// Default (no Provider in the tree) mirrors LiveRegion's AnnounceContext convention: a working,
// non-throwing fallback rather than an error — 'nb' matches the test default set in
// test-setup.ts. The real app always wraps the tree in LanguageProvider (see App.tsx).
const LanguageContext = createContext<LanguageContextValue>({ lang: 'nb', setLang: () => {} })

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang)

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* localStorage unavailable — choice just won't persist */
    }
  }, [])

  return createElement(LanguageContext.Provider, { value: { lang, setLang } }, children)
}

export function useLang(): [Lang, (lang: Lang) => void] {
  const { lang, setLang } = useContext(LanguageContext)
  return [lang, setLang]
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.hasOwn(params, key) ? String(params[key]) : match
  )
}

export type T = (key: TranslationKey, params?: Record<string, string | number>) => string

export function useT(): T {
  const { lang } = useContext(LanguageContext)
  return useCallback<T>((key, params) => interpolate(TABLES[lang][key], params), [lang])
}
