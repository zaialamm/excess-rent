# excess-rent

SIMD-0437 is lowering Solana's rent floor from 6,960 to 696 lamports per byte across five
independently gated steps. Balances are not touched when a step activates, so every account funded
before it is left holding a surplus. This site finds that surplus and hands it back.

Paste any address. It works out what kind of account it is, computes the surplus against the floor
the chain reports right now, projects what each remaining step will release, and lets you take the
token-program part in the browser without closing anything.

## What it can reclaim

| Account | How the surplus comes out | Where |
| --- | --- | --- |
| Token accounts and mints | `WithdrawExcessLamports`, the account stays open and funded | Signed by the account owner, or the mint authority |
| Empty token accounts | `CloseAccount` returns the whole deposit, not just the surplus | Signed by the account owner |
| Upgradeable programs | Redeploying the same binary drops ProgramData to the new floor and pays the difference to the fee payer | Signed by the upgrade authority |

The site is read only. It never asks for a wallet and never builds a transaction: it reports what each
account holds, who is allowed to sign for it, and what to run. For the full walkthrough with code, see
[the write-up by @a_milz](https://x.com/a_milz/status/2095532192579661927).

The loader has no withdraw instruction, which is why a program is the one case this cannot do for
you. The redeploy needs a refundable buffer deposit while it runs; the deposit and the surplus both
land back with the fee payer in the same transaction.

## Running it

```bash
npm install
cp .env.example .env.local   # optional, see below
npm run dev
```

The public cluster endpoints work for a look around and are rate limited hard enough to fail under
any real traffic. Point `RPC_MAINNET`, `RPC_DEVNET` and `RPC_TESTNET` at your own. Scanning a wallet
for programs it can upgrade uses `getProgramAccounts` over the loader, which many endpoints refuse;
when that happens the site says so and you can paste a program ID directly instead.

```bash
npm test        # rent maths, checked against figures read off mainnet
npm run build
npm run typecheck
```

## Deploying

It is a stock Next.js app with no database and no build-time secrets, so any Node host will do.
On Vercel, import the repository and set `RPC_MAINNET`, `RPC_DEVNET` and `RPC_TESTNET` as environment
variables. Leaving them unset still works, on the public cluster endpoints, but those will rate limit
under any real traffic.

## How the numbers are worked out

An account is rent exempt at `(data_len + 128) * lamports_per_byte`. The live rate is never
hardcoded: it is recovered from `getMinimumBalanceForRentExemption(0)`, which is exactly
`128 * lamports_per_byte`. Reading it that way means the site follows each step of the rollout, and
the fallback gate, without a code change. Only the future ladder is a constant, because those rates
are fixed by the SIMD.

Activation status comes from the five feature gate accounts. A missing account means the step has not
been queued on that cluster; a gate whose first byte is zero is queued but not switched on; anything
else is active and carries the slot it activated at.

## Layout

```
src/lib/rent.ts     rent and phase maths, pure, no I/O
src/lib/gates.ts    feature gate status
src/lib/scan.ts     address classification and account discovery
src/lib/claim.ts    what releases a surplus, and who is allowed to sign
src/app/api/        scan and gates
```

## Reference

- [SIMD-0437](https://github.com/solana-foundation/solana-improvement-documents/blob/main/proposals/0437-incremental-rent-reduction.md)
- [Reduced rent](https://solana.com/upgrades/reduced-rent)
- [Feature gate tracker](https://github.com/anza-xyz/agave/wiki/Feature-Gate-Tracker-Schedule)

MIT licensed.
