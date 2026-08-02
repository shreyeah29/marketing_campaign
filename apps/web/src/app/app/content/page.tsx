'use client'

import { CreativeLibrary } from '@/components/creative-library'
import { PageHeader } from '@/components/kit'
import { FadeIn } from '@/components/motion'

/** Content library — same CreativeLibrary used by AI Images. */
export default function ContentPage() {
  return (
    <FadeIn>
      <PageHeader title="Content" subtitle="Approved creatives and media from your campaigns." />
      <CreativeLibrary type="image" />
    </FadeIn>
  )
}
