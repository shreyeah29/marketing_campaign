import { HttpException } from '@nestjs/common'

/**
 * Turning a failed generation into a sentence someone can act on.
 *
 * Every failure in the generation paths was already diagnosed properly — the
 * OpenAI walk ends by asking the key what it *can* do and naming the dashboard
 * setting to change. All of it went to `logger.error`, and the screen got a
 * generic line. So the reason existed, was correct, and was only ever readable
 * by someone with access to the deployment logs.
 *
 * These two functions are the other end of that: the category of failure, in
 * language aimed at the person looking at the empty tile, short enough to store
 * on the asset and render in a card.
 */

/** One provider refusal, reduced to the parts that decide what to say. */
export interface ProviderFailure {
  readonly status?: number | undefined
  readonly message: string
}

/**
 * What a provider's refusal means, in one sentence.
 *
 * Runway's failures all arrived as "Media generation failed — try again", which
 * is equally true of a rejected key, an empty credit balance, a rate limit and a
 * wrong model name — four problems with four different fixes, and only one of
 * them is solved by trying again. The distinguishing detail was in the log the
 * whole time.
 *
 * The provider's own text is deliberately not forwarded. It names account and
 * project identifiers, and the person reading a failed tile is not the audience
 * for those. What travels is the category, which is the part that says what to
 * do next.
 *
 * Order matters: the message is checked for "credit" before the status is
 * trusted, because a provider that is out of credits may answer 400, and the
 * message is checked for "model" only after the account-level causes are ruled
 * out — a 401 whose body happens to mention a model name is still a key problem.
 */
export function describeProviderFailure(
  provider: string,
  reasons: readonly ProviderFailure[],
): string {
  const first = reasons[0]
  if (!first) return `${provider} did not return a picture — try again.`
  const status = first.status
  const text = first.message.toLowerCase()

  if (status === 401 || status === 403) {
    return `${provider} rejected the API key. It is missing, expired, or belongs to a different account.`
  }
  if (status === 402 || /credit|quota|billing|insufficient|exceeded your/.test(text)) {
    return `The ${provider} account has run out of credits. Top it up and try again.`
  }
  if (status === 429) {
    return `${provider} is rate-limiting this account. Wait a minute and try again.`
  }
  if (/model/.test(text)) {
    return `${provider} does not recognise the configured model. Check the model name in the deployment settings.`
  }
  if (status === 400) {
    return `${provider} refused this prompt. Rewording the concept usually clears it.`
  }
  if (status !== undefined && status >= 500) {
    return `${provider} had a server error. This one is worth trying again shortly.`
  }
  return `${provider} did not return a picture — try again.`
}

/** Length cap: this is stored on the asset and rendered inside a card. */
const MAX_REASON = 500

/**
 * The sentence to record on an asset when its generation fails.
 *
 * `HttpException` covers everything the generation paths throw deliberately, and
 * those messages were already written with care — the OpenAI one ends with the
 * exact dashboard setting to change. They are reused rather than re-summarised.
 *
 * Anything else is an unplanned error. Its raw text is the wrong thing to put in
 * front of a client — it can carry a stack frame, a connection string or an
 * internal hostname — so it becomes a generic line and the detail stays in the
 * log.
 */
export function failureSentence(err: unknown): string {
  if (err instanceof HttpException) {
    const body: unknown = err.getResponse()
    if (typeof body === 'string' && body.trim()) return body.trim().slice(0, MAX_REASON)
    if (typeof body === 'object' && body !== null) {
      const message: unknown = (body as { message?: unknown }).message
      if (typeof message === 'string' && message.trim()) {
        return message.trim().slice(0, MAX_REASON)
      }
      // Nest's default validation shape is an array of strings.
      if (Array.isArray(message) && message.every((m) => typeof m === 'string')) {
        const joined = message.join('; ').trim()
        if (joined) return joined.slice(0, MAX_REASON)
      }
    }
    return err.message.slice(0, MAX_REASON)
  }
  return 'Something went wrong while generating this. Try again — if it keeps happening, the deployment logs will have the detail.'
}
