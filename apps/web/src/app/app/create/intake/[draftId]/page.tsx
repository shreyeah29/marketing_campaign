'use client'

import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'

import { LoadingScreen } from '@/components/ui'

/**
 * Retired second intake.
 *
 * There were two wizards asking overlapping questions in different orders —
 * this one (objective · channels · audience · duration) reached only from
 * onboarding, and the Studio one (platforms · deliverables · audience). Which a
 * client saw depended on how they arrived. The Studio wizard survives; this path
 * redirects so existing links and part-finished drafts still land somewhere.
 */
export default function RetiredIntakeRedirect() {
  const params = useParams<{ draftId: string }>()
  const search = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    const step = search.get('step') === 'audience' ? 'audience' : 'platforms'
    router.replace(`/app/create/wizard/${params.draftId}?step=${step}`)
  }, [params.draftId, router, search])

  return <LoadingScreen />
}
