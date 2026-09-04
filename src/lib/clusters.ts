/** Cluster names, shared by server and browser. No server-only imports here. */

export const CLUSTERS = ["mainnet", "devnet", "testnet"] as const;
export type Cluster = (typeof CLUSTERS)[number];

/**
 * Clusters worth pasting an address into. Testnet is deliberately absent: it is
 * for validator release testing, so almost nothing is deployed there and every
 * scan comes back empty. It still appears in the rollout table, where being two
 * steps ahead of mainnet is the point.
 */
export const SCAN_CLUSTERS = ["mainnet", "devnet"] as const satisfies readonly Cluster[];

export function isCluster(value: string): value is Cluster {
  return (CLUSTERS as readonly string[]).includes(value);
}

/** Explorer's spelling of each cluster. */
export function explorerCluster(cluster: Cluster): string {
  return cluster === "mainnet" ? "mainnet-beta" : cluster;
}
