'use client'
import { ModuleIntro } from '@/components/module-intro'
export default function ReceptionistPage() {
  return <ModuleIntro title="AI Receptionist" subtitle="An always-on voice agent that answers and routes calls"
    icon="phone" requires="Connect a telephony provider (Twilio / Vapi / Retell) and a voice provider to take calls."
    capabilities={[
      { title: 'Answer 24/7', body: 'Greet callers, answer FAQs and capture intent.' },
      { title: 'Route & book', body: 'Transfer to a human or book an appointment.' },
      { title: 'Logged to CRM', body: 'Every call is transcribed and saved to the contact.' },
    ]} />
}
