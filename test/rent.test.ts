import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ACCOUNT_STORAGE_OVERHEAD,
  BASE_LAMPORTS_PER_BYTE,
  excessOver,
  PHASES,
  rateFromZeroByteMinimum,
  remainingPhases,
  rentExemptMinimum,
} from "../src/lib/rent.ts";
import { sol, sumForDisplay, toSol } from "../src/lib/format.ts";

// Figures below were read off mainnet, not derived from this code.
const VOBLE_PROGRAM_DATA_BYTES = 1_757_597;
const VOBLE_PROGRAM_DATA_LAMPORTS = 12_233_766_000n;
const TOKEN_ACCOUNT_BYTES = 165;
const MINT_BYTES = 82;

test("rent floor matches what mainnet charges", () => {
  assert.equal(rentExemptMinimum(VOBLE_PROGRAM_DATA_BYTES, 6960), VOBLE_PROGRAM_DATA_LAMPORTS);
  assert.equal(rentExemptMinimum(VOBLE_PROGRAM_DATA_BYTES, 6333), 11_131_672_425n);
  assert.equal(rentExemptMinimum(TOKEN_ACCOUNT_BYTES, 6960), 2_039_280n);
  assert.equal(rentExemptMinimum(MINT_BYTES, 6960), 1_461_600n);
});

test("excess is the gap between the old funding and the new floor", () => {
  assert.equal(excessOver(VOBLE_PROGRAM_DATA_LAMPORTS, VOBLE_PROGRAM_DATA_BYTES, 6333), 1_102_093_575n);
  assert.equal(excessOver(VOBLE_PROGRAM_DATA_LAMPORTS, VOBLE_PROGRAM_DATA_BYTES, 696), 11_010_389_400n);
  assert.equal(excessOver(2_039_280n, TOKEN_ACCOUNT_BYTES, 6333), 183_711n);
});

test("excess never goes negative for an underfunded account", () => {
  assert.equal(excessOver(0n, TOKEN_ACCOUNT_BYTES, 6333), 0n);
  assert.equal(excessOver(1n, VOBLE_PROGRAM_DATA_BYTES, 696), 0n);
});

test("an account funded at the current rate has nothing to give back", () => {
  const funded = rentExemptMinimum(TOKEN_ACCOUNT_BYTES, 5080);
  assert.equal(excessOver(funded, TOKEN_ACCOUNT_BYTES, 5080), 0n);
});

test("the live rate is recovered from the zero-byte minimum", () => {
  for (const rate of [BASE_LAMPORTS_PER_BYTE, 6333, 5080, 696]) {
    const minimum = BigInt(ACCOUNT_STORAGE_OVERHEAD * rate);
    assert.equal(rateFromZeroByteMinimum(minimum), rate);
  }
  assert.throws(() => rateFromZeroByteMinimum(7n), /whole number/);
});

test("phase ladder is the one in the SIMD, in activation order", () => {
  assert.deepEqual(PHASES.map((p) => p.rate), [6333, 5080, 2575, 1322, 696]);
  assert.deepEqual(PHASES.map((p) => p.stage), [1, 2, 3, 4, 5]);
  assert.equal(new Set(PHASES.map((p) => p.gate)).size, 5);
});

test("remaining phases exclude the ones already reached", () => {
  assert.deepEqual(remainingPhases(6333).map((p) => p.stage), [2, 3, 4, 5]);
  assert.deepEqual(remainingPhases(696).map((p) => p.stage), []);
});

test("SOL formatting rounds like a ledger", () => {
  assert.equal(toSol(1_102_093_575n), "1.102094");
  assert.equal(toSol(12_233_766_000n, 4), "12.2338");
  assert.equal(toSol(0n), "0.000000");
  assert.equal(sol(183_711n), "◎0.000184");
});

test("an itemised list foots to its displayed total", () => {
  // Phase 3 for the Voble wallet: the three lines disagreed with the exact
  // total by one unit in the last place before sumForDisplay existed.
  const parts = [7_707_624_125n, 29_550_515n, 1_841_700n];
  const shownLines = parts.map((p) => toSol(p));
  const shownTotal = toSol(sumForDisplay(parts));
  const addedUp = shownLines.reduce((acc, line) => acc + Number(line), 0);
  assert.equal(Number(shownTotal).toFixed(6), addedUp.toFixed(6));
});

// --- who is allowed to sign ------------------------------------------------
// The page never signs anything, but it still has to be right about who could:
// the Token program checks the authority, so an account with none is a dead end
// and saying otherwise would send someone chasing a transaction that cannot land.

import { authorityRole, claimable } from "../src/lib/claim.ts";
import type { ScannedAccount } from "../src/lib/scan.ts";

const OWNER = "4fsKwXRgNaqDkMJzXGuVnjmmtCyaDs9W8u6wtGL51L1p";

function account(over: Partial<ScannedAccount> = {}): ScannedAccount {
  return {
    address: "2hp2Ao74qiny2XZiccZThdf3LvEfBJ58UzegPoKpaXXU",
    kind: "token-account",
    dataLen: 165,
    lamports: "2039280",
    floor: "1855569",
    excess: "183711",
    method: "token-withdraw",
    authority: OWNER,
    ...over,
  };
}

test("a token account with a surplus and an owner is claimable", () => {
  assert.equal(claimable([account()]).length, 1);
});

test("a mint with a revoked authority is a dead end", () => {
  const revoked = account({ kind: "mint", dataLen: 82, method: null, authority: undefined });
  assert.equal(claimable([revoked]).length, 0);
});

test("an account already at the floor is not claimable", () => {
  assert.equal(claimable([account({ excess: "0" })]).length, 0);
});

test("a program is not routed through the token instruction", () => {
  assert.equal(claimable([account({ kind: "program-data", method: "program-redeploy" })]).length, 0);
});

test("the signer is named for each kind of account", () => {
  assert.equal(authorityRole(account()), "the account owner");
  assert.equal(authorityRole(account({ kind: "mint" })), "the mint authority");
  assert.equal(authorityRole(account({ kind: "program-data" })), "the upgrade authority");
});
