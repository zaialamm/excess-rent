import { NextResponse } from "next/server";
import { readGates, type GateState } from "@/lib/gates";
import { rpc, RpcError } from "@/lib/rpc";
import { CLUSTERS, type Cluster } from "@/lib/clusters";
import { rateFromZeroByteMinimum } from "@/lib/rent";

export const runtime = "nodejs";
export const revalidate = 30;

export interface ClusterState {
  cluster: Cluster;
  rate: number | null;
  gates: GateState[];
  error?: string;
}

async function readCluster(cluster: Cluster): Promise<ClusterState> {
  try {
    const [gates, zeroByteMinimum] = await Promise.all([
      readGates(cluster),
      rpc<number>(cluster, "getMinimumBalanceForRentExemption", [0]),
    ]);
    return { cluster, rate: rateFromZeroByteMinimum(BigInt(zeroByteMinimum)), gates };
  } catch (err) {
    return {
      cluster,
      rate: null,
      gates: [],
      error: err instanceof RpcError ? err.message : "Could not read this cluster.",
    };
  }
}

export async function GET() {
  const clusters = await Promise.all(CLUSTERS.map(readCluster));
  return NextResponse.json(
    { clusters, readAt: new Date().toISOString() },
    { headers: { "cache-control": "public, max-age=30, stale-while-revalidate=120" } },
  );
}
