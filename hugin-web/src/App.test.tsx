import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders four nav buttons with Dashbord active by default', () => {
    render(<App />)

    const nav = screen.getByRole('navigation', { name: 'Hovedmeny' })
    const buttons = screen.getAllByRole('button', { name: /Dashbord|Søknader|Bedrifter|Eksport/ })
    expect(buttons).toHaveLength(4)
    expect(nav).toBeInTheDocument()

    const dashbord = screen.getByRole('button', { name: 'Dashbord' })
    expect(dashbord).toHaveAttribute('aria-current', 'page')
  })

  it('moves aria-current to Søknader when clicked', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Søknader' }))

    expect(screen.getByRole('button', { name: 'Søknader' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Dashbord' })).not.toHaveAttribute('aria-current')
  })
})
