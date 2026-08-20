import '@testing-library/jest-dom/vitest'

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
