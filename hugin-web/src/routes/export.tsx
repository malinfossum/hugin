import { createFileRoute } from '@tanstack/react-router'
import { ExportView } from '../views/ExportView'

export const Route = createFileRoute('/export')({ component: ExportView })
