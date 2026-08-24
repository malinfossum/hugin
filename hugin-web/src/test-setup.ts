import '@testing-library/jest-dom/vitest'
import { beforeEach } from 'vitest'

// Node 22+ defines its own global `localStorage` getter (returns undefined unless the process
// was started with --localstorage-file). vitest's jsdom environment only copies a window
// property onto globalThis when the key isn't already present there — so this Node global wins
// and jsdom's real, working localStorage never gets attached. Replace it with a minimal
// in-memory Storage-compatible polyfill so localStorage-using code behaves the same in tests as
// it does in a real browser.
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>()
  const memoryStorage = {
    getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value))
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size
    },
  }
  Object.defineProperty(globalThis, 'localStorage', {
    value: memoryStorage as unknown as Storage,
    configurable: true,
    writable: true,
  })
}

// jsdom does not implement the <dialog> element's modal behavior.
// Polyfill showModal/close so ConfirmDialog can be tested without a real browser.
// close() mirrors the native no-op-when-already-closed rule and dispatches a real
// 'close' event when it does close — so tests exercise ConfirmDialog's actual
// close-event handling instead of a handler that silently never fires.
HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
  this.setAttribute('open', '')
}
HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
  if (!this.hasAttribute('open')) return
  this.removeAttribute('open')
  this.dispatchEvent(new Event('close'))
}

// jsdom doesn't implement window.scrollTo — it logs a "Not implemented" console error instead
// of the no-op real browsers give it in a headless context. App.tsx's view-switcher calls it to
// restore per-view scroll position, so give it a minimal polyfill that actually tracks scrollY
// (assignable in jsdom, matching the spec's [Replaceable] scrollY) rather than just swallowing
// the call — that way a test can assert on scroll restoration if it ever needs to.
window.scrollTo = ((x?: number | ScrollToOptions, y?: number) => {
  const top = typeof x === 'object' ? (x.top ?? window.scrollY) : (y ?? window.scrollY)
  window.scrollY = top
}) as typeof window.scrollTo

// Deterministic language for every test: the existing test suite asserts bokmål strings
// throughout, and jsdom's navigator.language ('en-US') would otherwise auto-detect English and
// break all of them. Setting the same localStorage key LanguageProvider reads (src/i18n/index.ts)
// pins every test to nb unless a test explicitly overrides it (e.g. the language-toggle test).
beforeEach(() => {
  window.localStorage.setItem('hugin-lang', 'nb')
})
