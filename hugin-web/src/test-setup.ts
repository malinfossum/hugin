import '@testing-library/jest-dom/vitest'

// jsdom does not implement the <dialog> element's modal behavior.
// Polyfill showModal/close so ConfirmDialog can be tested without a real browser.
HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
  this.setAttribute('open', '')
}
HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
  this.removeAttribute('open')
}
