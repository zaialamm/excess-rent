/** Cluster names, shared by server and browser. No server-only imports here. */

export const CLUSTERS = ["mainnet", "devnet", "testnet"] as const;
export type Cluster = (typeof CLUSTERS)[number];

export function isCluster(value: string): value is Cluster {
  return (CLUSTERS as readonly string[]).includes(value);
}

/** Explorer's spelling of each cluster. */
export function explorerCluster(cluster: Cluster): string {
  return cluster === "mainnet" ? "mainnet-beta" : cluster;
}
