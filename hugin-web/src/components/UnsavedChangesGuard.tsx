import { type ShouldBlockFn, useBlocker, useRouter } from '@tanstack/react-router'
import { useReadOnly } from '../context/readOnly'
import { useT } from '../i18n'
import { ConfirmDialog } from './ConfirmDialog'

/** Only leaving the route unmounts the view, and the draft with it. A navigation that stays on
 * the route (a filter or the dashboard's ?show=all in the URL) keeps the view mounted, so it
 * passes without a question. Module-level: useBlocker re-registers whenever this changes. */
const leavesRoute: ShouldBlockFn = ({ current, next }) => current.routeId !== next.routeId

interface Props {
  /** True only once the person has changed something that isn't saved yet. A form that was
   * merely opened (still showing what it loaded) is not dirty. */
  dirty: boolean
}

/** Asks before a navigation would unmount a form with unsaved changes: views unmount when their
 * route stops matching, so a draft would otherwise be lost without a word. Render it inside the
 * component that owns the draft. The question is the app's own ConfirmDialog; closing the tab or
 * reloading gets the browser's native prompt instead, since a page can't style that one. */
export function UnsavedChangesGuard({ dirty }: Props) {
  // A form rendered on its own (its component tests) has no router, so no navigation to guard.
  const hasRouter = useRouter({ warn: false }) !== null
  const { readOnly } = useReadOnly()
  return hasRouter ? <Blocker when={dirty && !readOnly} /> : null
}

function Blocker({ when }: { when: boolean }) {
  const t = useT()
  const blocker = useBlocker({
    shouldBlockFn: leavesRoute,
    disabled: !when,
    enableBeforeUnload: true,
    withResolver: true,
  })

  return (
    <ConfirmDialog
      open={blocker.status === 'blocked'}
      title={t('unsaved.title')}
      confirmLabel={t('unsaved.leave')}
      variant="danger"
      onConfirm={() => blocker.proceed?.()}
      onCancel={() => blocker.reset?.()}
    >
      <p>{t('unsaved.body')}</p>
    </ConfirmDialog>
  )
}
