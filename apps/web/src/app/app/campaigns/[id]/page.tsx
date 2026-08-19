'use client'

import { Suspense, useCallback, useMemo } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'

import { EmptyState } from '@/components/kit'
import { FadeIn } from '@/components/motion'
import { ContentCalendar } from '@/components/content-calendar'
import CampaignPerformancePage from '@/components/campaign-performance'
import {
  AnalyticsSection,
  AssetEditor,
  AssetListSection,
  CreativeStudio,
  OverviewSection,
  SECTIONS,
  SkeletonList,
  StrategySection,
  sectionCount,
  useCampaign,
  type Asset,
} from '@/components/campaign-studio'

/**
 * Campaign detail — one screen, twelve sections.
 *
 * The sections are tabs, not routes wearing a tab's clothes. `CampaignProvider`
 * in the layout loads the campaign and its assets once; switching section is a
 * query-string change against state already in hand, so nothing remounts and
 * nothing refetches. That is the whole reason the five sibling routes were
 * collapsed — each was a navigation, and each paid for the same data again.
 *
 * Every section is always present, including the ones with nothing in them. A
 * rail that changes shape per campaign teaches people not to trust where things
 * live: if Blog disappears when a campaign has no blog content, the next person
 * to look for Blog concludes the feature does not exist. So Blog stays, and says
 * nothing was generated for it.
 *
 * Counts are real or absent, never zero-as-placeholder. `sectionCount` returns
 * null for the sections that do not derive from assets and while assets are
 * loading, because a wrong zero reads as "nothing here" and closes the tab for
 * good.
 */

const DEFAULT_SECTION = 'overview'

export default function CampaignDetailPage() {
  return (
    <Suspense fallback={<SkeletonList />}>
      <CampaignDetailInner />
    </Suspense>
  )
}

function CampaignDetailInner() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const search = useSearchParams()
  const { campaign, assets, loading, showPerformance, reload } = useCampaign()

  const campaignId = params.id
  const requested = search.get('section') ?? DEFAULT_SECTION
  const active = SECTIONS.some((s) => s.id === requested) ? requested : DEFAULT_SECTION
  const selectedAssetId = search.get('asset')

  /**
   * Section changes replace rather than push.
   *
   * Twelve tabs and a push per click turns the back button into a tour of every
   * section someone glanced at. Replacing keeps back meaning "leave this
   * campaign", which is what a person pressing it wants. Opening an asset does
   * push, because there closing the drawer is the obvious back.
   */
  const go = useCallback(
    (sectionId: string, assetId?: string) => {
      const next = new URLSearchParams()
      if (sectionId !== DEFAULT_SECTION) next.set('section', sectionId)
      if (assetId) next.set('asset', assetId)
      const qs = next.toString()
      const url = `/app/campaigns/${campaignId}${qs ? `?${qs}` : ''}`
      if (assetId) router.push(url)
      else router.replace(url)
    },
    [campaignId, router],
  )

  const openAsset = useCallback(
    (a: Asset) => {
      go(active, a.id)
    },
    [go, active],
  )

  const selectedAsset = useMemo(
    () => (selectedAssetId ? (assets?.find((a) => a.id === selectedAssetId) ?? null) : null),
    [assets, selectedAssetId],
  )

  const counts = useMemo(
    () => new Map(SECTIONS.map((def) => [def.id, sectionCount(def, assets)])),
    [assets],
  )

  // SECTIONS is a non-empty literal, but TypeScript cannot know that from an
  // index, so the fallback is explicit rather than asserted.
  const def = SECTIONS.find((s) => s.id === active) ?? {
    id: DEFAULT_SECTION,
    label: 'Overview',
    icon: 'layout' as const,
  }

  return (
    <FadeIn className="camp-detail">
      {/* ── Section tabs ─────────────────────────────────────────────────
          A horizontal bar rather than a 208px column. Two of the four columns
          on this screen were navigation, and the section rail was the one that
          bought the least with its width: twelve labels that fit across the top
          were occupying a fifth of the viewport beside content that needed it.

          Icons are dropped at this size. Label and count identify a tab in a
          row; a glyph beside each only competes with the one piece of
          information that varies. */}
      <nav className="camp-rail" aria-label="Campaign sections">
        {SECTIONS.map((s) => {
          const count = counts.get(s.id) ?? null
          return (
            <button
              key={s.id}
              type="button"
              className={`camp-rail__item${s.id === active ? ' is-active' : ''}`}
              aria-current={s.id === active ? 'page' : undefined}
              onClick={() => go(s.id)}
            >
              <span className="camp-rail__label">{s.label}</span>
              {/* No badge when the count is unknown — see sectionCount. */}
              {count !== null ? <span className="camp-rail__count">{count}</span> : null}
            </button>
          )
        })}
      </nav>

      {/* ── Section body ─────────────────────────────────────────────────── */}
      <div className="camp-body">
        {active === 'overview' ? (
          campaign ? (
            <OverviewSection campaign={campaign} assets={assets} />
          ) : (
            <SkeletonList />
          )
        ) : null}

        {active === 'strategy' ? (
          campaign ? (
            <StrategySection campaign={campaign} />
          ) : (
            <SkeletonList />
          )
        ) : null}

        {active === 'calendar' ? <ContentCalendar campaignId={campaignId} /> : null}

        {active === 'media' ? (
          <CreativeStudio
            selectedAssetId={selectedAssetId}
            /* The drawer was a nested route and is now a query parameter, so it
               is rendered here rather than by the router. Same component, same
               deep-linkability. */
            drawer={
              selectedAsset ? (
                <AssetEditor
                  asset={selectedAsset}
                  variant="drawer"
                  onBack={() => go(active)}
                  onChanged={reload}
                />
              ) : null
            }
          />
        ) : null}

        {active === 'analytics' ? (
          showPerformance ? (
            <CampaignPerformancePage />
          ) : (
            <AnalyticsSection assets={assets} />
          )
        ) : null}

        {/* Every remaining section is an asset list, filtered by the same
            predicate the rail counted with. */}
        {['social', 'ads', 'email', 'landing', 'blog', 'review', 'publishing'].includes(active) ? (
          <AssetListSection def={def} assets={assets} onOpen={openAsset} />
        ) : null}

        {/* A section id that exists in SECTIONS but has no body would otherwise
            render blank. Nothing should reach this, and if it does it says so
            rather than looking broken. */}
        {!loading &&
        ![
          'overview',
          'strategy',
          'calendar',
          'media',
          'analytics',
          'social',
          'ads',
          'email',
          'landing',
          'blog',
          'review',
          'publishing',
        ].includes(active) ? (
          <EmptyState
            icon={def.icon}
            title={`${def.label} is not built yet`}
            hint="This section exists in the campaign structure but has no panel. Nothing is missing from your campaign."
          />
        ) : null}
      </div>
    </FadeIn>
  )
}
