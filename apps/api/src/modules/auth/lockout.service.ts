import type { Redis } from 'ioredis'

/**
 * Account lockout / brute-force throttle for the credential login.
 *
 * Rate limiting (Better Auth's, in front of `/sign-in/email`) caps how fast anyone
 * can try. Lockout is the complementary control: it caps how many times a *single
 * account* can be guessed wrong before that identifier is frozen for a cooldown,
 * regardless of source IP. The two together defeat both a fast attacker from one
 * address and a slow distributed guess against one victim.
 *
 * State lives in Redis keyed by the (lowercased) email, with a sliding window: the
 * failure counter expires on its own, so a locked account unlocks after the
 * cooldown with no cleanup job. A successful login clears it immediately.
 */
export class LockoutService {
  private static readonly PREFIX = 'vsp:auth:lockout:'
  /** Failures within the window before the account is frozen. */
  private static readonly MAX_ATTEMPTS = 5
  /** Window and cooldown, in seconds. */
  private static readonly WINDOW_SECONDS = 15 * 60

  constructor(private readonly redis: Redis) {}

  private key(email: string): string {
    return `${LockoutService.PREFIX}${email.toLowerCase()}`
  }

  /** True when the account has reached the failure threshold and is in cooldown. */
  async isLocked(email: string): Promise<boolean> {
    const raw = await this.redis.get(this.key(email))
    return raw !== null && Number(raw) >= LockoutService.MAX_ATTEMPTS
  }

  /**
   * Records a failed attempt and returns the running count. The first failure
   * starts the window; the counter expires the whole thing after the cooldown.
   */
  async recordFailure(email: string): Promise<number> {
    const key = this.key(email)
    const count = await this.redis.incr(key)
    if (count === 1) await this.redis.expire(key, LockoutService.WINDOW_SECONDS)
    return count
  }

  /** Clears the counter — called on a successful login. */
  async clear(email: string): Promise<void> {
    await this.redis.del(this.key(email))
  }

  static get maxAttempts(): number {
    return LockoutService.MAX_ATTEMPTS
  }
}
