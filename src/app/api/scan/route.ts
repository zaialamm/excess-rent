import { NextResponse } from "next/server";
import { scan } from "@/lib/scan";
import { envVarFor, isPublicEndpoint, RpcError } from "@/lib/rpc";
import { isCluster } from "@/lib/clusters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const address = params.get("address")?.trim() ?? "";
  const cluster = params.get("cluster") ?? "mainnet";

  if (!isCluster(cluster)) {
    return NextResponse.json({ error: `Unknown cluster "${cluster}".` }, { status: 400 });
  }
  if (!address) {
    return NextResponse.json({ error: "Pass an address to scan." }, { status: 400 });
  }

  try {
    const result = await scan(cluster, address);
    if (isPublicEndpoint(cluster)) {
      result.notes.push(
        `Running against the shared public ${cluster} endpoint, which is rate limited. Set ${envVarFor(cluster)} to your own for anything beyond a look.`,
      );
    }
    return NextResponse.json(result, {
      headers: { "cache-control": "public, max-age=15, stale-while-revalidate=60" },
    });
  } catch (err) {
    const message = err instanceof RpcError ? err.message : "The scan failed.";
    const status = err instanceof RpcError && err.code === 429 ? 429 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
