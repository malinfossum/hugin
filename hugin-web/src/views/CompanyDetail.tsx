import type { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import type { ReactNode } from 'react'
import { type KeyboardEvent, type Ref, type RefObject, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { CompanyLink } from '../components/CompanyLink'
import { Button } from '../components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog'
import { type T, useT } from '../i18n'
import { ApiError } from '../lib/api'
import { displayCompanyName } from '../lib/companyName'
import { companyQuery } from '../lib/queries'
import type { CompanyDetailDto, CompanyDto } from '../lib/types'
import { AdHistory } from './AdHistory'

interface UnitTab {
  orgnr: string
  label: string
}

/** Branch tab labels prefer the kommune name. It's the whole point of a branch tab (which
 * office is this?). Falls back to the display name when a branch has none, or when its
 * kommuneNavn collides with another branch's (kommune name alone wouldn't disambiguate them). */
function branchTabLabel(branch: CompanyDto, branches: CompanyDto[]): string {
  if (!branch.kommuneNavn) return displayCompanyName(branch.name)
  const sharedByCount = branches.filter((b) => b.kommuneNavn === branch.kommuneNavn).length
  return sharedByCount > 1 ? displayCompanyName(branch.name) : branch.kommuneNavn
}

/** The unit's register facts as one wrapping line of label-over-value pairs between hairlines. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="font-medium break-words text-foreground tabular-nums">{children}</dd>
    </div>
  )
}

function UnitBody({
  detail,
  t,
  headingRef,
}: {
  detail: CompanyDetailDto
  t: T
  headingRef: Ref<HTMLHeadingElement>
}) {
  return (
    <>
      {/* The dialog's name: the unit on screen, so a branch tab renames it. The end padding
      keeps a long name clear of the close button. */}
      <div className="pe-10">
        <DialogTitle ref={headingRef} tabIndex={-1}>
          {displayCompanyName(detail.company.name)}
          {detail.company.isBranch && ` ${t('common.branchTag')}`}
        </DialogTitle>
      </div>
      <dl className="mt-5 flex flex-wrap gap-x-10 gap-y-4 border-y border-border py-4">
        <Fact label={t('companies.orgnr')}>{detail.company.orgnr}</Fact>
        <Fact label={t('companies.kommune')}>
          {detail.company.kommuneNavn ?? detail.company.kommune ?? t('companies.notGiven')}
        </Fact>
        <Fact label={t('companies.nace')}>
          {detail.company.naceCode ?? t('companies.notGiven')}
        </Fact>
        {detail.company.isBranch && detail.company.parentOrgnr && (
          <Fact label={t('companies.parentCompany')}>{detail.company.parentOrgnr}</Fact>
        )}
        <Fact label={t('companies.websiteRow')}>
          <CompanyLink
            name={displayCompanyName(detail.company.name)}
            kommuneNavn={detail.company.kommuneNavn}
            website={detail.company.website}
          />
        </Fact>
      </dl>

      <h3 className="mt-10 mb-3 font-heading text-xl font-semibold text-foreground">
        {t('companies.adHistory')}
      </h3>
      <AdHistory ads={detail.ads} />
    </>
  )
}

/** Only rendered when tabs exist. A `role="tabpanel"` isn't valid ARIA without a tablist to go
 * with it, so the no-tabs case (a lone branch's own detail) renders the same content directly
 * instead of wrapping it. */
function TabPanel({ selectedOrgnr, children }: { selectedOrgnr: string; children: ReactNode }) {
  return (
    <div
      role="tabpanel"
      id="unit-tabpanel"
      aria-labelledby={`unit-tab-${selectedOrgnr}`}
      className="flex flex-col"
    >
      {children}
    </div>
  )
}

/** A company's detail as a dialog over the list. `orgnr` null closes it; the last company stays
 * on screen while the dialog animates out. */
export function CompanyDetail({
  orgnr,
  onClose,
  finalFocus,
}: {
  orgnr: string | null
  onClose: () => void
  /** Where focus goes once the dialog has closed (the dialog popup's `finalFocus`). */
  finalFocus?: DialogPrimitive.Popup.Props['finalFocus']
}) {
  const [shownOrgnr, setShownOrgnr] = useState(orgnr)
  if (orgnr !== null && orgnr !== shownOrgnr) setShownOrgnr(orgnr)
  const t = useT()
  const popupRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  return (
    <Dialog
      open={orgnr !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      onOpenChangeComplete={(open) => {
        if (!open) setShownOrgnr(null)
      }}
    >
      <DialogContent
        closeLabel={t('common.close')}
        // The company's name rather than the first link or tab in the dialog; while it is still
        // loading, the popup itself, and the name takes over once it arrives (CompanyBody).
        ref={popupRef}
        initialFocus={() => headingRef.current ?? popupRef.current}
        finalFocus={finalFocus}
        className="sm:max-w-3xl"
      >
        {shownOrgnr && <CompanyBody orgnr={shownOrgnr} headingRef={headingRef} />}
      </DialogContent>
    </Dialog>
  )
}

function CompanyBody({
  orgnr,
  headingRef,
}: {
  orgnr: string
  headingRef: RefObject<HTMLHeadingElement | null>
}) {
  // The tab selection is remembered together with the root it belongs to, so opening a different
  // company falls back to that company's own unit without an effect (and without one render
  // fetching the previous company's tab). The selection is also reset during render when the
  // root changes, so A → C → back to A (while mounted) lands on A's own unit, not its old tab.
  const t = useT()
  const [selection, setSelection] = useState({ root: orgnr, unit: orgnr })
  if (selection.root !== orgnr) setSelection({ root: orgnr, unit: orgnr })
  const selectedOrgnr = selection.root === orgnr ? selection.unit : orgnr
  // Both queries share a cache key while the main unit is selected, so that is one request.
  const rootQuery = useQuery(companyQuery(orgnr))
  const unitQuery = useQuery(companyQuery(selectedOrgnr))
  const rootDetail = rootQuery.data ?? null
  const detail = unitQuery.data ?? null
  const error = unitQuery.isError
    ? unitQuery.error instanceof ApiError
      ? unitQuery.error.message
      : t('companies.detailLoadError')
    : null
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  // Once per company the name takes focus, so a keyboard or screen reader user lands on what
  // they opened rather than on the first link in the dialog. Not when focus is already on
  // something inside it: a tab switch keeps focus on its tab. The data can answer before the
  // dialog has moved focus in, so focus still on the row behind it counts as not yet inside.
  // An error hides the body, so the heading is missing; the one-shot waits for a successful retry
  // (`error` is a dependency so the retry runs this again).
  const focusedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!detail || error || focusedFor.current === orgnr) return
    const heading = headingRef.current
    if (!heading) return
    focusedFor.current = orgnr
    const popup = heading.closest('[role="dialog"]')
    const active = document.activeElement
    if (!popup?.contains(active) || active === popup) heading.focus()
  }, [detail, error, orgnr, headingRef])

  const selectUnit = (unitOrgnr: string) => setSelection({ root: orgnr, unit: unitOrgnr })

  const branches = rootDetail?.branches ?? []
  const tabs: UnitTab[] =
    branches.length > 0
      ? [
          { orgnr, label: t('companies.mainUnit') },
          ...branches.map((b) => ({ orgnr: b.orgnr, label: branchTabLabel(b, branches) })),
        ]
      : []

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    event.preventDefault()
    const delta = event.key === 'ArrowRight' ? 1 : -1
    const next = tabs[(index + delta + tabs.length) % tabs.length]
    selectUnit(next.orgnr)
    tabRefs.current.get(next.orgnr)?.focus()
  }

  return (
    <div className="flex flex-col">
      {/* Until the unit answers, the dialog still needs a name. */}
      {!detail && <DialogTitle className="sr-only">{t('nav.companies')}</DialogTitle>}

      {tabs.length > 0 && (
        // The units as underline tabs on a hairline; the strip wraps on a narrow screen.
        <div
          role="tablist"
          aria-label={t('companies.unitTabs')}
          className="-mt-1 mb-6 flex flex-wrap gap-x-1 border-b border-border pe-10"
        >
          {tabs.map((tab, index) => {
            const selected = tab.orgnr === selectedOrgnr
            return (
              <button
                key={tab.orgnr}
                type="button"
                role="tab"
                id={`unit-tab-${tab.orgnr}`}
                aria-selected={selected}
                aria-controls="unit-tabpanel"
                tabIndex={selected ? 0 : -1}
                className={cn(
                  '-mb-px min-h-11 rounded-t-lg border-0 border-b-2 bg-transparent px-3 text-body-sm hover:bg-muted hover:text-foreground',
                  selected
                    ? 'border-foreground font-medium text-foreground'
                    : 'border-transparent text-muted-foreground'
                )}
                ref={(el) => {
                  if (el) tabRefs.current.set(tab.orgnr, el)
                  else tabRefs.current.delete(tab.orgnr)
                }}
                onClick={() => selectUnit(tab.orgnr)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
      )}

      {error && (
        <p
          role="status"
          className="flex flex-wrap items-center gap-x-3 border-y border-border py-3 pe-10 text-body-sm"
        >
          <AlertTriangle aria-hidden="true" className="size-4 text-destructive" />
          {error}
          <Button variant="link" className="min-h-11" onClick={() => unitQuery.refetch()}>
            {t('common.retry')}
          </Button>
        </p>
      )}

      {!error &&
        detail &&
        (tabs.length > 0 ? (
          <TabPanel selectedOrgnr={selectedOrgnr}>
            <UnitBody detail={detail} t={t} headingRef={headingRef} />
          </TabPanel>
        ) : (
          <div className="flex flex-col">
            <UnitBody detail={detail} t={t} headingRef={headingRef} />
          </div>
        ))}
    </div>
  )
}
