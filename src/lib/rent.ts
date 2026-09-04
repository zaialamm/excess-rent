/**
 * Rent maths for SIMD-0437.
 *
 * A Solana account is rent exempt when it holds at least
 *   (data_len + ACCOUNT_STORAGE_OVERHEAD) * lamports_per_byte
 * lamports. SIMD-0437 lowers `lamports_per_byte` from 6,960 to 696 across five
 * independently gated steps. Balances are never touched when a step activates,
 * so every account funded before it is left holding a surplus.
 *
 * Nothing here hardcodes the *current* rate. Call sites read that from the
 * chain (see `rateFromZeroByteMinimum`) so the numbers follow the rollout on
 * their own. The ladder below is only used to project future steps.
 */

/** Per-account storage overhead the runtime charges rent on, in bytes. */
export const ACCOUNT_STORAGE_OVERHEAD = 128;

/** The rate every account created before the rollout was funded at. */
export const BASE_LAMPORTS_PER_BYTE = 6960;

export interface Phase {
  /** 1-5, matching the SIMD-0437-N naming. */
  stage: number;
  /** Effective lamports per byte once this step activates. */
  rate: number;
  /** Feature gate account. Its presence and contents give activation status. */
  gate: string;
}

/** The five steps, in activation order. Source: SIMD-0437. */
export const PHASES: readonly Phase[] = [
  { stage: 1, rate: 6333, gate: "4a6f7o7iTcA8hRDCrPLkSatnt5Ykxiu36wo5p1Tt12wC" },
  { stage: 2, rate: 5080, gate: "61BtM7BkDEE8Yq5fskEVAQT9mYA8qCejJWoLe5apqg81" },
  { stage: 3, rate: 2575, gate: "Ftxb3ZKq7aNqgxDBbP7EonvR2RszZk9ctjdsTX38kQaz" },
  { stage: 4, rate: 1322, gate: "GsUBNYNDPdMLHPD37TToHzrzcNcjpC9w5n1EcJk5iTaM" },
  { stage: 5, rate: 696, gate: "mZdnRh9T2EbDNvqKjkCR3bvo5c816tJaojtE9Xs7iuY" },
] as const;

/** Lamports an account of `dataLen` bytes must hold to be rent exempt. */
export function rentExemptMinimum(dataLen: number, lamportsPerByte: number): bigint {
  if (!Number.isInteger(dataLen) || dataLen < 0) throw new RangeError(`bad dataLen: ${dataLen}`);
  if (!Number.isInteger(lamportsPerByte) || lamportsPerByte <= 0) {
    throw new RangeError(`bad lamportsPerByte: ${lamportsPerByte}`);
  }
  return BigInt(dataLen + ACCOUNT_STORAGE_OVERHEAD) * BigInt(lamportsPerByte);
}

/** Lamports held above the rent-exempt floor. Never negative. */
export function excessOver(lamports: bigint, dataLen: number, lamportsPerByte: number): bigint {
  const floor = rentExemptMinimum(dataLen, lamportsPerByte);
  return lamports > floor ? lamports - floor : 0n;
}

/**
 * Recover the live rate from `getMinimumBalanceForRentExemption(0)`, which is
 * exactly ACCOUNT_STORAGE_OVERHEAD * lamports_per_byte. Reading it this way
 * also picks up the SIMD-0437 fallback gate, or any later adjustment, without
 * a code change.
 */
export function rateFromZeroByteMinimum(minimumForZeroBytes: bigint): number {
  const rate = minimumForZeroBytes / BigInt(ACCOUNT_STORAGE_OVERHEAD);
  if (rate * BigInt(ACCOUNT_STORAGE_OVERHEAD) !== minimumForZeroBytes) {
    throw new Error(`minimum ${minimumForZeroBytes} is not a whole number of lamports per byte`);
  }
  return Number(rate);
}

/** Steps that have not yet reached `currentRate`, cheapest floor last. */
export function remainingPhases(currentRate: number): readonly Phase[] {
  return PHASES.filter((p) => p.rate < currentRate);
}

/** What `lamports` held by a `dataLen` account releases at each future step. */
export function projectPhases(
  lamports: bigint,
  dataLen: number,
  currentRate: number,
): { stage: number; rate: number; excess: bigint }[] {
  return PHASES.map((p) => ({
    stage: p.stage,
    rate: p.rate,
    excess: excessOver(lamports, dataLen, Math.min(p.rate, currentRate)),
  }));
}
