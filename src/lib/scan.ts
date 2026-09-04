/**
 * Turns one pasted address into the list of accounts that hold reclaimable
 * rent, and what each releases now and at every remaining SIMD-0437 step.
 */
import "server-only";
import { getAddressDecoder } from "@solana/kit";
import { excessOver, PHASES, rateFromZeroByteMinimum, rentExemptMinimum } from "./rent";
import {
  LOADER_V3,
  rpc,
  rpcMany,
  RpcError,
  SYSTEM_PROGRAM,
  TOKEN_2022_PROGRAM,
  TOKEN_PROGRAM,
  type ParsedTokenAccount,
  type RpcAccount,
} from "./rpc";
import type { Cluster } from "./clusters";

export type AccountKind = "token-account" | "mint" | "program-data" | "wallet";
export type ReclaimMethod = "token-withdraw" | "program-redeploy";

export interface ScannedAccount {
  address: string;
  kind: AccountKind;
  dataLen: number;
  /** bigint serialised as a decimal string, so it survives JSON. */
  lamports: string;
  floor: string;
  excess: string;
  method: ReclaimMethod | null;
  /**
   * Who must sign to release this account's surplus. A token account's owner,
   * or a mint's mint authority. Absent when nobody can: a mint whose authority
   * has been revoked can only be signed for by the mint account itself.
   */
  authority?: string;
  tokenProgram?: string;
  mint?: string;
  tokenAmount?: string;
  /** A token account holding no tokens can be closed for its whole deposit. */
  closable?: string;
  programId?: string;
  upgradeAuthority?: string;
  programDataAddress?: string;
}

export interface PhaseTotal {
  stage: number;
  rate: number;
  reached: boolean;
  total: string;
  claimable: string;
  program: string;
}

export interface ScanResult {
  cluster: Cluster;
  address: string;
  /** Live lamports per byte, read from the chain. */
  rate: number;
  solPrice: number | null;
  accounts: ScannedAccount[];
  totals: {
    total: string;
    claimable: string;
    program: string;
    closable: string;
    accountCount: number;
    claimableCount: number;
    emptyCount: number;
  };
  phases: PhaseTotal[];
  notes: string[];
}

const decodeAddress = getAddressDecoder();

function pubkeyAt(data: Buffer, offset: number): string {
  return decodeAddress.decode(data.subarray(offset, offset + 32));
}

/** Base58, 32-44 chars. Enough to reject typos before spending an RPC call. */
export function looksLikeAddress(value: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}

async function solPriceUsd(): Promise<number | null> {
  try {
    const res = await fetch(
      "https://lite-api.jup.ag/price/v3?ids=So11111111111111111111111111111111111111112",
      { signal: AbortSignal.timeout(6000), next: { revalidate: 60 } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as Record<string, { usdPrice?: number }>;
    const price = json["So11111111111111111111111111111111111111112"]?.usdPrice;
    return typeof price === "number" && price > 0 ? price : null;
  } catch {
    return null;
  }
}

function makeAccount(
  address: string,
  kind: AccountKind,
  dataLen: number,
  lamports: bigint,
  rate: number,
  method: ReclaimMethod | null,
  extra: Partial<ScannedAccount> = {},
): ScannedAccount {
  return {
    address,
    kind,
    dataLen,
    lamports: lamports.toString(),
    floor: rentExemptMinimum(dataLen, rate).toString(),
    excess: excessOver(lamports, dataLen, rate).toString(),
    method,
    ...extra,
  };
}

/** Token accounts and mints the wallet owns, across both token programs. */
async function scanTokenAccounts(
  cluster: Cluster,
  owner: string,
  rate: number,
): Promise<ScannedAccount[]> {
  const responses = (await rpcMany(cluster, [
    {
      method: "getTokenAccountsByOwner",
      params: [owner, { programId: TOKEN_PROGRAM }, { encoding: "jsonParsed" }],
    },
    {
      method: "getTokenAccountsByOwner",
      params: [owner, { programId: TOKEN_2022_PROGRAM }, { encoding: "jsonParsed" }],
    },
  ])) as ({ value: ParsedTokenAccount[] } | null)[];

  const out: ScannedAccount[] = [];
  for (const response of responses) {
    for (const entry of response?.value ?? []) {
      const info = entry.account.data.parsed.info;
      const lamports = BigInt(entry.account.lamports);
      const isEmpty = info.tokenAmount.amount === "0";
      out.push(
        makeAccount(entry.pubkey, "token-account", entry.account.space, lamports, rate, "token-withdraw", {
          authority: info.owner,
          tokenProgram: entry.account.owner,
          mint: info.mint,
          tokenAmount: info.tokenAmount.uiAmountString,
          ...(isEmpty ? { closable: lamports.toString() } : {}),
        }),
      );
    }
  }
  return out;
}

/**
 * Programs the wallet is upgrade authority for. This is a getProgramAccounts
 * scan over the loader, which plenty of endpoints refuse; the caller reports it
 * as a gap rather than failing the whole scan.
 */
async function scanPrograms(
  cluster: Cluster,
  authority: string,
  rate: number,
): Promise<{ accounts: ScannedAccount[]; note: string | null }> {
  try {
    const found = (await rpc<{ pubkey: string; account: RpcAccount }[]>(
      cluster,
      "getProgramAccounts",
      [
        LOADER_V3,
        {
          encoding: "base64",
          // ProgramData: u32 enum | u64 slot | u8 Option tag | 32-byte authority
          dataSlice: { offset: 0, length: 45 },
          filters: [{ memcmp: { offset: 13, bytes: authority } }],
        },
      ],
      45_000,
    )) ?? [];

    return {
      accounts: found.map((entry) =>
        makeAccount(
          entry.pubkey,
          "program-data",
          entry.account.space,
          BigInt(entry.account.lamports),
          rate,
          "program-redeploy",
          { upgradeAuthority: authority },
        ),
      ),
      note: null,
    };
  } catch (err) {
    const why = err instanceof RpcError ? err.message : "the scan failed";
    return {
      accounts: [],
      note: `Could not search for programs you can upgrade (${why}). Paste a program ID directly to see its surplus.`,
    };
  }
}

/** Resolve an executable program account to its ProgramData account. */
async function scanProgram(
  cluster: Cluster,
  programId: string,
  programAccount: RpcAccount,
  rate: number,
): Promise<ScannedAccount[]> {
  const data = Buffer.from(programAccount.data[0], "base64");
  if (data.length < 36 || data.readUInt32LE(0) !== 2) return [];
  const programDataAddress = pubkeyAt(data, 4);

  const info = await rpc<{ value: RpcAccount | null }>(cluster, "getAccountInfo", [
    programDataAddress,
    { encoding: "base64", dataSlice: { offset: 0, length: 45 }, commitment: "confirmed" },
  ]);
  if (!info.value) return [];

  const header = Buffer.from(info.value.data[0], "base64");
  const hasAuthority = header.length >= 45 && header.readUInt8(12) === 1;

  return [
    makeAccount(
      programDataAddress,
      "program-data",
      info.value.space,
      BigInt(info.value.lamports),
      rate,
      hasAuthority ? "program-redeploy" : null,
      {
        programId,
        programDataAddress,
        upgradeAuthority: hasAuthority ? pubkeyAt(header, 13) : undefined,
      },
    ),
  ];
}

function sum(values: bigint[]): bigint {
  return values.reduce((a, b) => a + b, 0n);
}

export async function scan(cluster: Cluster, address: string): Promise<ScanResult> {
  if (!looksLikeAddress(address)) {
    throw new RpcError(`"${address}" is not a Solana address.`);
  }

  const [accountInfo, zeroByteMinimum, solPrice] = await Promise.all([
    rpc<{ value: RpcAccount | null }>(cluster, "getAccountInfo", [
      address,
      { encoding: "base64", commitment: "confirmed" },
    ]),
    rpc<number>(cluster, "getMinimumBalanceForRentExemption", [0]),
    solPriceUsd(),
  ]);

  const rate = rateFromZeroByteMinimum(BigInt(zeroByteMinimum));
  const notes: string[] = [];
  let accounts: ScannedAccount[] = [];

  const account = accountInfo.value;
  const owner = account?.owner ?? SYSTEM_PROGRAM;

  if (account && owner === LOADER_V3 && account.executable) {
    accounts = await scanProgram(cluster, address, account, rate);
    if (accounts.length === 0) notes.push("That program has no ProgramData account to reclaim from.");
  } else if (account && owner === LOADER_V3) {
    accounts = [
      makeAccount(address, "program-data", account.space, BigInt(account.lamports), rate, "program-redeploy"),
    ];
  } else if (account && (owner === TOKEN_PROGRAM || owner === TOKEN_2022_PROGRAM)) {
    const parsed = await rpc<{ value: { data: { parsed: { type: string; info: Record<string, unknown> } } } }>(
      cluster,
      "getAccountInfo",
      [address, { encoding: "jsonParsed", commitment: "confirmed" }],
    );
    const type = parsed.value?.data?.parsed?.type;
    const info = parsed.value?.data?.parsed?.info ?? {};
    const lamports = BigInt(account.lamports);

    if (type === "mint") {
      const mintAuthority = typeof info.mintAuthority === "string" ? info.mintAuthority : undefined;
      if (!mintAuthority) {
        notes.push(
          "This mint's authority has been revoked, so only the mint account itself can sign for its surplus. A browser wallet cannot do that.",
        );
      }
      accounts = [
        makeAccount(address, "mint", account.space, lamports, rate, mintAuthority ? "token-withdraw" : null, {
          authority: mintAuthority,
          tokenProgram: owner,
        }),
      ];
    } else {
      const amount = (info.tokenAmount as { amount?: string; uiAmountString?: string } | undefined) ?? {};
      const isEmpty = amount.amount === "0";
      accounts = [
        makeAccount(address, "token-account", account.space, lamports, rate, "token-withdraw", {
          authority: typeof info.owner === "string" ? info.owner : undefined,
          tokenProgram: owner,
          mint: typeof info.mint === "string" ? info.mint : undefined,
          tokenAmount: amount.uiAmountString,
          ...(isEmpty ? { closable: lamports.toString() } : {}),
        }),
      ];
    }
  } else {
    const [tokens, programs] = await Promise.all([
      scanTokenAccounts(cluster, address, rate),
      scanPrograms(cluster, address, rate),
    ]);
    accounts = [...programs.accounts, ...tokens];
    if (programs.note) notes.push(programs.note);
    if (accounts.length === 0) {
      notes.push("Nothing to reclaim here. This address holds no token accounts and upgrades no programs.");
    }
  }

  accounts.sort((a, b) => (BigInt(b.excess) > BigInt(a.excess) ? 1 : BigInt(b.excess) < BigInt(a.excess) ? -1 : 0));

  const claimableAccounts = accounts.filter((a) => a.method === "token-withdraw");
  const programAccounts = accounts.filter((a) => a.method === "program-redeploy");
  const empty = accounts.filter((a) => a.closable !== undefined);

  const phases = PHASES.map((phase) => {
    const at = (list: ScannedAccount[]) =>
      sum(list.map((a) => excessOver(BigInt(a.lamports), a.dataLen, Math.min(phase.rate, rate))));
    const claimable = at(claimableAccounts);
    const program = at(programAccounts);
    return {
      stage: phase.stage,
      rate: phase.rate,
      reached: phase.rate >= rate,
      total: (claimable + program).toString(),
      claimable: claimable.toString(),
      program: program.toString(),
    };
  });

  const claimable = sum(claimableAccounts.map((a) => BigInt(a.excess)));
  const program = sum(programAccounts.map((a) => BigInt(a.excess)));

  return {
    cluster,
    address,
    rate,
    solPrice,
    accounts,
    totals: {
      total: (claimable + program).toString(),
      claimable: claimable.toString(),
      program: program.toString(),
      closable: sum(empty.map((a) => BigInt(a.closable!))).toString(),
      accountCount: accounts.length,
      claimableCount: claimableAccounts.length,
      emptyCount: empty.length,
    },
    phases,
    notes,
  };
}
