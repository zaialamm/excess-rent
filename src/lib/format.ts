/** Display helpers. Everything on-chain is a bigint of lamports until here. */

export const LAMPORTS_PER_SOL = 1_000_000_000n;

/** Fixed-decimal SOL. Rounds half away from zero, like toFixed. */
export function toSol(lamports: bigint, decimals = 6): string {
  const scale = 10n ** BigInt(decimals);
  const scaled = (lamports * scale + LAMPORTS_PER_SOL / 2n) / LAMPORTS_PER_SOL;
  const whole = scaled / scale;
  const frac = (scaled % scale).toString().padStart(decimals, "0");
  return decimals === 0 ? whole.toString() : `${whole}.${frac}`;
}

/**
 * The lamport glyph is missing from most display faces, so a browser silently
 * substitutes a fallback and it lands at the wrong size next to the number.
 * Keep it in its own element with its own font stack: see `Lamports`.
 */
export const LAMPORT_GLYPH = "◎";

/** SOL with the lamport glyph, for body copy where the type is uniform. */
export function sol(lamports: bigint, decimals = 6): string {
  return `${LAMPORT_GLYPH}${toSol(lamports, decimals)}`;
}

/**
 * Sum of the *rounded* parts, so an itemised list always foots to its total.
 * Rounding each line and the exact total independently disagrees by one unit
 * in the last place often enough to be noticed.
 */
export function sumForDisplay(parts: bigint[], decimals = 6): bigint {
  const step = LAMPORTS_PER_SOL / 10n ** BigInt(decimals);
  return parts.reduce((acc, p) => acc + ((p + step / 2n) / step) * step, 0n);
}

export function usd(lamports: bigint, solPrice: number | null): string | null {
  if (solPrice === null) return null;
  const value = (Number(lamports) / Number(LAMPORTS_PER_SOL)) * solPrice;
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function commas(n: number | bigint): string {
  return n.toLocaleString("en-US");
}

/** Middle-truncated address, for tables. */
export function shortAddress(address: string, lead = 8, tail = 5): string {
  if (address.length <= lead + tail + 1) return address;
  return `${address.slice(0, lead)}…${address.slice(-tail)}`;
}
