'use client'

import { redirect } from 'next/navigation'

/** Home is retired from the shell — Create is the workspace landing. */
export default function AppIndexRedirect() {
  redirect('/app/create')
}
