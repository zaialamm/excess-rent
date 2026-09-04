import { App } from "@/components/App";
import { readGates } from "@/lib/gates";
import { rpc } from "@/lib/rpc";
import { CLUSTERS, type Cluster } from "@/lib/clusters";
import { rateFromZeroByteMinimum } from "@/lib/rent";
import type { ClusterState } from "@/app/api/gates/route";

// The rollout table is the same for every visitor; rebuild it periodically
// rather than on every request.
export const revalidate = 30;

async function readCluster(cluster: Cluster): Promise<ClusterState> {
  try {
    const [gates, zeroByteMinimum] = await Promise.all([
      readGates(cluster),
      rpc<number>(cluster, "getMinimumBalanceForRentExemption", [0]),
    ]);
    return { cluster, rate: rateFromZeroByteMinimum(BigInt(zeroByteMinimum)), gates };
  } catch {
    return { cluster, rate: null, gates: [], error: "Could not reach this cluster." };
  }
}

export default async function Page() {
  const clusters = await Promise.all(CLUSTERS.map(readCluster));
  return <App clusters={clusters} />;
}
