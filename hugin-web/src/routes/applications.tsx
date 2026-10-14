import { createFileRoute } from '@tanstack/react-router'
import { ApplicationsView } from '../views/ApplicationsView'

export const Route = createFileRoute('/applications')({ component: ApplicationsView })
