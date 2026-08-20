import '@testing-library/jest-dom/vitest'

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
