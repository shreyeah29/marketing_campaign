'use client'

import { CopyLibrary } from '@/components/copy-library'
import { PageHeader } from '@/components/kit'
import { FadeIn } from '@/components/motion'

/**
 * Copy & captions.
 *
 * It rendered the image gallery until now, which is why clicking a post here
 * opened a photograph with a download button and no caption in sight. The words
 * are the point of this page; the picture is how you find them.
 */
export default function ContentPage() {
  return (
    <FadeIn>
      <PageHeader
        title="Copy & captions"
        subtitle="Every caption, beside the post it belongs to."
      />
      <CopyLibrary />
    </FadeIn>
  )
}
