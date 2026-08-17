'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

import { SkeletonList } from '@/components/campaign-studio'

/**
 * Kept so old links still mean what they meant.
 *
 * The five sibling routes became sections of one screen. Bookmarks, emails and
 * workflow notifications already point here, and landing them on a 404 would
 * make the reorganisation the user's problem. Redirects into the matching
 * section instead.
 *
 * `replace`, not `push`: the old URL should not sit in history as a place the
 * back button returns to, because returning to it would redirect again.
 */
export default function CampaignScheduleRedirect() {
  const params = useParams<{ id: string }>()
  const router = useRouter()

  useEffect(() => {
    router.replace(`/app/campaigns/${params.id}?section=calendar`)
  }, [params.id, router])

  return <SkeletonList />
}
