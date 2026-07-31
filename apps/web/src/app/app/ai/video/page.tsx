'use client'

import { ModuleIntro } from '@/components/module-intro'

/**
 * AI video generation.
 *
 * There is no video-generation provider wired into the platform, so rather than
 * present a form that always fails, this is an honest gated state describing what
 * the module does and what it needs — consistent with the other provider-gated
 * surfaces (meetings, receptionist).
 */
export default function AiVideoPage() {
  return (
    <ModuleIntro
      title="AI Video"
      subtitle="Generate short video clips from a text prompt"
      icon="video"
      requires="Video generation needs a video model provider connected to the platform."
      capabilities={[
        { title: 'Text-to-video', body: 'Turn a prompt into a short, on-brand clip.' },
        { title: 'Social-ready', body: 'Export formats sized for each platform.' },
        { title: 'Campaign assets', body: 'Drop generated clips straight into the review queue.' },
      ]}
    />
  )
}
