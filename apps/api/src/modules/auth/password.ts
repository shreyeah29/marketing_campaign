import { hashPassword as betterAuthHash, verifyPassword as betterAuthVerify } from 'better-auth/crypto'

/**
 * Password hashing, shared between Better Auth and the provisioning path.
 *
 * These are Better Auth's own primitives (scrypt), re-exported through one module
 * so there is exactly one hashing scheme for tenant credentials. It matters
 * because provisioning creates an owner's credential *before* that owner ever
 * touches Better Auth's sign-up: if provisioning hashed differently, the account
 * would exist but be unable to log in. Using the same function means a provisioned
 * owner's password verifies through Better Auth unchanged.
 *
 * This replaces the deliberate placeholder in `ProvisioningService` — the one the
 * comments promised Phase 6 would swap for the real credential path.
 */
export function hashPassword(password: string): Promise<string> {
  return betterAuthHash(password)
}

export function verifyPassword(args: { hash: string; password: string }): Promise<boolean> {
  return betterAuthVerify(args)
}
