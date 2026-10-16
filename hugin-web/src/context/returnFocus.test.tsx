import { type AnyRouter, useRouter } from '@tanstack/react-router'
import { act, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TestRouter } from '../test-utils'
import { ReturnFocusProvider, useReturnFocus } from './returnFocus'

let returnFocus: ReturnType<typeof useReturnFocus>
let router: AnyRouter

function Probe() {
  returnFocus = useReturnFocus()
  router = useRouter()
  return (
    <div data-testid="page">
      <a href="/companies/1" data-return-focus="company:1">
        Acme
      </a>
      <button type="button">Elsewhere</button>
      <h2 tabIndex={-1}>Card</h2>
    </div>
  )
}

async function renderProbe() {
  render(
    <TestRouter>
      <ReturnFocusProvider>
        <Probe />
      </ReturnFocusProvider>
    </TestRouter>
  )
  await screen.findByTestId('page')
}

/** Follows a link away and comes back with Back, as Tilbake or the browser would. */
async function leaveAndReturn(orgnr = '1') {
  await act(() => router.navigate({ to: '/companies/{-$orgnr}', params: { orgnr } }))
  await act(async () => router.history.back())
  await waitFor(() => expect(router.state.location.pathname).toBe('/'))
}

describe('ReturnFocusProvider', () => {
  it('focuses the remembered link once its entry is current again', async () => {
    await renderProbe()
    returnFocus.remember('company:1', '/companies/1')
    await leaveAndReturn()

    act(() => returnFocus.restore(screen.getByTestId('page')))

    expect(screen.getByRole('link', { name: 'Acme' })).toHaveFocus()
  })

  it('does nothing when the page was never left (a Ctrl-click opened a new tab instead)', async () => {
    await renderProbe()
    returnFocus.remember('company:1', '/companies/1')

    act(() => returnFocus.restore(screen.getByTestId('page')))

    expect(document.body).toHaveFocus()
  })

  it('forgets a link that was never followed once the page is left another way', async () => {
    await renderProbe()
    // Remembered, but the person stayed (a new tab, or the unsaved-changes guard), then left
    // through the nav instead.
    returnFocus.remember('company:1', '/companies/1')
    await act(() => router.navigate({ to: '/companies/{-$orgnr}', params: {} }))
    await act(async () => router.history.back())
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))

    act(() => returnFocus.restore(screen.getByTestId('page')))

    expect(document.body).toHaveFocus()
  })

  it('leaves focus alone when the person has already moved it', async () => {
    await renderProbe()
    returnFocus.remember('company:1', '/companies/1')
    await leaveAndReturn()
    const elsewhere = screen.getByRole('button', { name: 'Elsewhere' })
    act(() => elsewhere.focus())

    act(() => returnFocus.restore(screen.getByTestId('page')))

    expect(elsewhere).toHaveFocus()
  })

  it('focuses the fallback when the link is gone, never leaving focus on the body', async () => {
    await renderProbe()
    returnFocus.remember('company:2', '/companies/2')
    await leaveAndReturn('2')

    act(() =>
      returnFocus.restore(screen.getByTestId('page'), screen.getByRole('heading', { name: 'Card' }))
    )

    expect(screen.getByRole('heading', { name: 'Card' })).toHaveFocus()
  })

  it('does nothing when the page is reached again by a new entry, not by going back', async () => {
    await renderProbe()
    returnFocus.remember('company:1', '/companies/1')
    await act(() => router.navigate({ to: '/companies/{-$orgnr}', params: { orgnr: '1' } }))
    // A push back to the same page, as the nav does: a new entry with a different index.
    await act(() => router.navigate({ to: '/' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))

    act(() => returnFocus.restore(screen.getByTestId('page')))

    expect(document.body).toHaveFocus()
  })
})
