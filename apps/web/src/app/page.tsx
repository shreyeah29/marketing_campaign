import { redirect } from 'next/navigation'

export default function Home() {
  // The operator lands in the platform portal; tenant users reach their org shell
  // through their branded subdomain (wired with tenant auth in a later slice).
  redirect('/platform')
}
