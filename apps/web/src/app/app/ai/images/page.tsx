'use client'

import { MediaLibrary } from '@/components/media-library'

/**
 * Images & video — the library, not the generator.
 *
 * This route used to be a prompt box that generated one image and forgot it.
 * Generation lives in the studio and the creatives batch now; what was missing
 * was somewhere to see what had already been produced, which is what a library
 * is for.
 */
export default function ImagesAndVideoPage() {
  return (
    <>
      <MediaLibrary />
    </>
  )
}
