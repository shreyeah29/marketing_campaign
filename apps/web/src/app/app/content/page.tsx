'use client'

import { CreativeLibrary } from '@/components/creative-library'
import { PageHeader } from '@/components/kit'
import { FadeIn } from '@/components/motion'
import { LIBRARY_SECTION, SectionNav } from '@/components/section-nav'

/**
 * The library — every creative the system has made, with its approval fate
 * visible, so a poster that worked can be found and used again.
 *
 * No `type` here: this page owns both mediums and the gallery shows its own
 * Posters/Videos tabs. The AI Images and AI Video pages pin it instead.
 */
export default function ContentPage() {
  return (
    <FadeIn>
      <PageHeader title="Library" />
      <SectionNav links={LIBRARY_SECTION} />
      <CreativeLibrary />
    </FadeIn>
  )
}
