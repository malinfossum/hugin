import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { useState } from 'react'
import { FocusProvider } from './context/focus'
import { ReadOnlyProvider } from './context/readOnly'
import { LanguageProvider } from './i18n'
import { makeQueryClient } from './lib/queryClient'
import { createAppRouter } from './router'

export default function App() {
  // useState, not a render-body `new`: the client (its cache) and the router must outlive
  // re-renders.
  const [queryClient] = useState(makeQueryClient)
  const [router] = useState(createAppRouter)

  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <ReadOnlyProvider>
          <FocusProvider>
            <RouterProvider router={router} />
          </FocusProvider>
        </ReadOnlyProvider>
      </LanguageProvider>
    </QueryClientProvider>
  )
}
