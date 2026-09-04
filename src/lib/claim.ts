/**
 * What it takes to release a surplus, described rather than executed.
 *
 * The site is read only: it never asks for a wallet and never builds a
 * transaction. It reports which account holds what, who is allowed to sign for
 * it, and hands over the exact instruction or command to run.
 */
import type { ScannedAccount } from "./scan";

export const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

/**
 * Accounts the Token program can hand back without closing anything: holding a
 * surplus, and with an authority that can still sign. A mint whose authority
 * has been revoked has neither, so it is excluded.
 */
export function claimable(accounts: ScannedAccount[]): ScannedAccount[] {
  return accounts.filter(
    (a) => a.method === "token-withdraw" && BigInt(a.excess) > 0n && a.authority !== undefined,
  );
}

/** Who has to sign for this account, in words. */
export function authorityRole(account: ScannedAccount): string {
  if (account.kind === "mint") return "the mint authority";
  if (account.kind === "token-account") return "the account owner";
  if (account.kind === "program-data") return "the upgrade authority";
  return "the authority";
}
