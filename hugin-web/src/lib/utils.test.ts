import { describe, expect, it } from 'vitest'
import { cn } from './utils'

describe('cn', () => {
  it('keeps a theme type step beside a text colour', () => {
    expect(cn('text-body-sm', 'text-muted-foreground')).toBe('text-body-sm text-muted-foreground')
    expect(cn('text-primary', 'text-small')).toBe('text-primary text-small')
    expect(cn('text-headline text-foreground')).toBe('text-headline text-foreground')
  })

  it('lets a later type step replace an earlier one', () => {
    expect(cn('text-sm', 'text-body-sm')).toBe('text-body-sm')
    expect(cn('text-small', 'text-headline')).toBe('text-headline')
  })
})
