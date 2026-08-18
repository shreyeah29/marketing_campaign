'use client'

import { ReviewQueue } from '@/components/review-queue'

/**
 * The review queue, at its own address.
 *
 * It used to be `/app/creatives?status=needs_review` — the creatives page with a
 * query string — so choosing "Review queue" in the sidebar arrived at a screen
 * headed **Creatives**, carrying the creatives page's generator controls and a
 * tab strip. One destination wearing two names in two different sidebar groups
 * is how you end up unsure which of the two "creatives" you are looking at.
 *
 * A route of its own costs one file and removes that ambiguity permanently: the
 * queue is the queue, the creatives page makes creatives, and the sidebar link
 * and the page title finally say the same word.
 */
export default function ReviewPage() {
  return <ReviewQueue />
}
