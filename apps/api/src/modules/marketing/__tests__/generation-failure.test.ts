import { BadRequestException, ServiceUnavailableException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'

import { describeProviderFailure, failureSentence } from '../generation-failure.js'

describe('describeProviderFailure', () => {
  it('separates the four causes that used to share one message', () => {
    const key = describeProviderFailure('Runway', [{ status: 401, message: 'Unauthorized' }])
    const credits = describeProviderFailure('Runway', [
      { status: 400, message: 'You have insufficient credits' },
    ])
    const limit = describeProviderFailure('Runway', [{ status: 429, message: 'Too many requests' }])
    const model = describeProviderFailure('Runway', [
      { status: 400, message: 'Invalid model: gen3a_turbo_x' },
    ])

    // The whole point of this function: four inputs, four different answers.
    for (const [a, b] of [
      [key, credits],
      [key, limit],
      [key, model],
      [credits, limit],
      [credits, model],
      [limit, model],
    ]) {
      expect(a).not.toEqual(b)
    }

    expect(key).toMatch(/API key/i)
    expect(credits).toMatch(/credits/i)
    expect(limit).toMatch(/rate-limit/i)
    expect(model).toMatch(/model/i)
  })

  it('reads an out-of-credits 400 as credits, not as a bad prompt', () => {
    // A provider that is out of money often answers 400. Falling through to the
    // generic 400 branch would tell someone to reword a prompt that is fine.
    expect(
      describeProviderFailure('Runway', [
        { status: 400, message: 'You exceeded your current quota' },
      ]),
    ).toMatch(/credits/i)
  })

  it('reads a 403 as a key problem even when the body mentions a model', () => {
    // gpt-image-1 refuses exactly like this. It is an account setting, not a
    // typo in a model name, and sending someone to change the model name would
    // waste a deploy — which is how that afternoon actually went.
    expect(
      describeProviderFailure('OpenAI', [
        { status: 403, message: 'Project does not have access to model gpt-image-1' },
      ]),
    ).toMatch(/API key|account/i)
  })

  it('never forwards the provider text, which can name the account', () => {
    const secretish = 'Project proj_abc123 for org org_secret cannot use this'
    const said = describeProviderFailure('OpenAI', [{ status: 403, message: secretish }])
    expect(said).not.toContain('proj_abc123')
    expect(said).not.toContain('org_secret')
  })

  it('still says something useful when there are no reasons at all', () => {
    expect(describeProviderFailure('Runway', [])).toContain('Runway')
  })

  it('marks a server error as worth retrying, unlike the others', () => {
    expect(describeProviderFailure('Runway', [{ status: 503, message: 'upstream down' }])).toMatch(
      /again/i,
    )
  })
})

describe('failureSentence', () => {
  it('keeps the carefully written message from a deliberate throw', () => {
    // The OpenAI walk ends with the exact dashboard setting to change. That
    // sentence is the most useful thing in the whole path and must survive.
    const written =
      'This OpenAI key can use 42 models but no image model among them. Verify the organisation under Settings → Organization.'
    expect(failureSentence(new ServiceUnavailableException(written))).toBe(written)
  })

  it('reads the message out of Nest’s object response shape', () => {
    expect(failureSentence(new BadRequestException('Only image concepts can generate media'))).toBe(
      'Only image concepts can generate media',
    )
  })

  it('does not leak the text of an unplanned error', () => {
    const leaky = new Error('connect ECONNREFUSED 10.0.0.4:5432 postgres://user:hunter2@db/x')
    const said = failureSentence(leaky)
    expect(said).not.toContain('hunter2')
    expect(said).not.toContain('10.0.0.4')
    expect(said).toMatch(/went wrong/i)
  })

  it('caps the length, because this is stored and rendered in a card', () => {
    expect(failureSentence(new ServiceUnavailableException('x'.repeat(2000))).length).toBe(500)
  })
})
