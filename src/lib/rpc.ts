/**
 * Minimal server-side JSON-RPC client.
 *
 * Deliberately not @solana/kit: the read paths here are a handful of methods
 * and one batch call, and keeping them plain makes the failure modes obvious
 * and the endpoint swappable per request.
 */
import "server-only";

import { type Cluster } from "./clusters";

export { CLUSTERS, isCluster, type Cluster } from "./clusters";

const PUBLIC_ENDPOINT: Record<Cluster, string> = {
  mainnet: "https://api.mainnet-beta.solana.com",
  devnet: "https://api.devnet.solana.com",
  testnet: "https://api.testnet.solana.com",
};

/**
 * A configured endpoint wins over the public one, which is rate limited hard
 * enough that it will fail under real traffic. See .env.example.
 */
export function endpointFor(cluster: Cluster): string {
  const configured = {
    mainnet: process.env.RPC_MAINNET,
    devnet: process.env.RPC_DEVNET,
    testnet: process.env.RPC_TESTNET,
  }[cluster];
  return configured?.trim() || PUBLIC_ENDPOINT[cluster];
}

/** Name of the environment variable that overrides this cluster's endpoint. */
export function envVarFor(cluster: Cluster): string {
  return `RPC_${cluster.toUpperCase()}`;
}

/** True when the cluster is served by the shared public endpoint. */
export function isPublicEndpoint(cluster: Cluster): boolean {
  return endpointFor(cluster) === PUBLIC_ENDPOINT[cluster];
}

export class RpcError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly method?: string,
  ) {
    super(message);
    this.name = "RpcError";
  }
}

export interface RpcCall {
  method: string;
  params: unknown[];
}

const RETRY_DELAYS_MS = [400, 1200];

/**
 * One POST, retrying only on rate limits. The public cluster endpoints are the
 * default path for anyone who has not configured their own, and they hand out
 * 429s freely enough that a single retry is the difference between a working
 * page and an empty one.
 */
async function post(cluster: Cluster, body: unknown, timeoutMs: number): Promise<unknown> {
  let lastError: RpcError | undefined;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await postOnce(cluster, body, timeoutMs);
    } catch (err) {
      if (!(err instanceof RpcError) || err.code !== 429) throw err;
      lastError = err;
      const delay = RETRY_DELAYS_MS[attempt];
      if (delay === undefined) break;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError ?? new RpcError("The RPC request failed.");
}

async function postOnce(cluster: Cluster, body: unknown, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(endpointFor(cluster), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      throw new RpcError(
        res.status === 429
          ? `The ${cluster} RPC endpoint is rate limiting us. Set ${envVarFor(cluster)} to your own.`
          : `RPC returned HTTP ${res.status}`,
        res.status,
      );
    }
    return await res.json();
  } catch (err) {
    if (err instanceof RpcError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new RpcError(`RPC timed out after ${timeoutMs}ms`);
    }
    throw new RpcError(err instanceof Error ? err.message : "RPC request failed");
  } finally {
    clearTimeout(timer);
  }
}

export async function rpc<T>(
  cluster: Cluster,
  method: string,
  params: unknown[],
  timeoutMs = 20_000,
): Promise<T> {
  const json = (await post(cluster, { jsonrpc: "2.0", id: 1, method, params }, timeoutMs)) as {
    result?: T;
    error?: { code: number; message: string };
  };
  if (json.error) throw new RpcError(json.error.message, json.error.code, method);
  if (json.result === undefined) throw new RpcError("RPC returned no result", undefined, method);
  return json.result;
}

/** One round trip for many calls. Results come back in the order given. */
export async function rpcBatch(
  cluster: Cluster,
  calls: RpcCall[],
  timeoutMs = 30_000,
): Promise<unknown[]> {
  if (calls.length === 0) return [];
  const body = calls.map((c, id) => ({ jsonrpc: "2.0", id, method: c.method, params: c.params }));
  const json = (await post(cluster, body, timeoutMs)) as {
    id: number;
    result?: unknown;
    error?: { code: number; message: string };
  }[];
  if (!Array.isArray(json)) throw new RpcError("Expected a batch response");
  const out = new Array<unknown>(calls.length);
  for (const entry of json) {
    if (entry.error) throw new RpcError(entry.error.message, entry.error.code, calls[entry.id]?.method);
    out[entry.id] = entry.result;
  }
  return out;
}

/**
 * Batch if the endpoint will take it, otherwise one call at a time.
 *
 * The public cluster endpoints reject batched requests outright, and they are
 * what anyone gets before configuring their own. Falling back keeps the page
 * working there instead of showing every cluster as unavailable.
 */
export async function rpcMany(
  cluster: Cluster,
  calls: RpcCall[],
  timeoutMs?: number,
): Promise<unknown[]> {
  if (calls.length === 0) return [];
  try {
    return await rpcBatch(cluster, calls, timeoutMs);
  } catch (err) {
    if (!(err instanceof RpcError)) throw err;
    const out: unknown[] = [];
    for (const call of calls) {
      out.push(await rpc(cluster, call.method, call.params, timeoutMs));
    }
    return out;
  }
}

// ---- shapes we read back -------------------------------------------------

export interface RpcAccount {
  lamports: number;
  owner: string;
  executable: boolean;
  space: number;
  data: [string, string];
}

export interface ParsedTokenAccount {
  pubkey: string;
  account: {
    lamports: number;
    owner: string;
    space: number;
    data: {
      parsed: {
        info: {
          mint: string;
          owner: string;
          tokenAmount: { amount: string; decimals: number; uiAmountString: string };
        };
        type: string;
      };
    };
  };
}

export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
export const LOADER_V3 = "BPFLoaderUpgradeab1e11111111111111111111111";
export const SYSTEM_PROGRAM = "11111111111111111111111111111111";
