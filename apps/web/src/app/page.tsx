import { redirect } from 'next/navigation'

export default function Home() {
  // Tenant users enter through the app shell, which sends them to sign in when
  // there is no session. The platform operator console lives separately at
  // /platform.
  redirect('/app')
}
