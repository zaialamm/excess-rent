/**
 * Feature gate status for the SIMD-0437 steps.
 *
 * A feature account is 9 bytes: a 1-byte Option tag followed by the u64 slot it
 * activated at. Tag 0 means the gate exists but has not switched on yet
 * ("pending" in the tracker's language). No account at all means the step has
 * not even been queued on that cluster.
 */
import "server-only";
import { PHASES } from "./rent";
import { rpcMany, type RpcAccount } from "./rpc";
import type { Cluster } from "./clusters";

export type GateStatus = "active" | "pending" | "inactive";

export interface GateState {
  stage: number;
  rate: number;
  gate: string;
  status: GateStatus;
  /** Slot it activated at, when active. */
  activatedAt: number | null;
}

function decode(account: RpcAccount | null): { status: GateStatus; activatedAt: number | null } {
  if (!account) return { status: "inactive", activatedAt: null };
  const bytes = Buffer.from(account.data[0], "base64");
  if (bytes.length === 0 || bytes[0] === 0) return { status: "pending", activatedAt: null };
  if (bytes.length < 9) return { status: "active", activatedAt: null };
  return { status: "active", activatedAt: Number(bytes.readBigUInt64LE(1)) };
}

export async function readGates(cluster: Cluster): Promise<GateState[]> {
  const results = (await rpcMany(
    cluster,
    PHASES.map((p) => ({
      method: "getAccountInfo",
      params: [p.gate, { encoding: "base64", commitment: "confirmed" }],
    })),
  )) as ({ value: RpcAccount | null } | null)[];

  return PHASES.map((phase, i) => ({
    stage: phase.stage,
    rate: phase.rate,
    gate: phase.gate,
    ...decode(results[i]?.value ?? null),
  }));
}
