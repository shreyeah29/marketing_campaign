'use client'
import { ModuleIntro } from '@/components/module-intro'
export default function MeetingsPage() {
  return <ModuleIntro title="Meeting Assistant" subtitle="AI notes, summaries and action items from your calls"
    icon="🎙" requires="Connect a transcription provider (Deepgram) to record and summarise meetings."
    capabilities={[
      { title: 'Live transcription', body: 'Real-time transcripts of calls and meetings.' },
      { title: 'Summaries', body: 'Automatic summaries and extracted action items.' },
      { title: 'CRM sync', body: 'Attach notes and follow-ups to the right contact.' },
    ]} />
}
