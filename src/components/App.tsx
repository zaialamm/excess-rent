"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ClusterState } from "@/app/api/gates/route";
import { SCAN_CLUSTERS, type Cluster } from "@/lib/clusters";
import type { ScanResult } from "@/lib/scan";
import { AUTHOR, REPO_URL, SIMD_URL, SITE_NAME, X_URL } from "@/lib/site";
import { GitHubMark, XMark } from "./Icons";
import { Results } from "./Results";
import { Rollout } from "./Rollout";

const ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function App({ clusters }: { clusters: ClusterState[] }) {
  const [cluster, setCluster] = useState<Cluster>("mainnet");
  const [address, setAddress] = useState("");
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState(1);

  // Open on whatever step the selected cluster has actually reached.
  const liveStage = useMemo(() => {
    const active = clusters.find((c) => c.cluster === cluster)?.gates.filter((g) => g.status === "active");
    return active && active.length > 0 ? Math.max(...active.map((g) => g.stage)) : 1;
  }, [clusters, cluster]);

  useEffect(() => setStage(liveStage), [liveStage]);

  const runScan = useCallback(async (target: string, on: Cluster) => {
    const trimmed = target.trim();
    if (!ADDRESS_PATTERN.test(trimmed)) {
      setError("That is not a Solana address.");
      return;
    }
    setScanning(true);
    setError(null);
    try {
      const res = await fetch(`/api/scan?address=${trimmed}&cluster=${on}`);
      const json = (await res.json()) as ScanResult | { error: string };
      if ("error" in json) {
        setError(json.error);
        setScan(null);
      } else {
        setScan(json);
      }
    } catch {
      setError("The scan could not reach the network.");
      setScan(null);
    } finally {
      setScanning(false);
    }
  }, []);

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void runScan(address, cluster);
  };

  const switchCluster = (next: Cluster) => {
    setCluster(next);
    if (scan) void runScan(scan.address, next);
  };

  const activeCluster = clusters.find((c) => c.cluster === cluster);

  return (
    <main className="min-h-screen pb-16">
      <header className="flex items-center justify-between px-5 py-5 sm:px-14 sm:py-6">
        <span className="font-display text-xl font-extrabold tracking-tight">{SITE_NAME}</span>
        <nav className="flex items-center gap-6 text-sm">
          <a href={SIMD_URL} target="_blank" rel="noreferrer" className="text-ink-2 hover:text-brand">
            SIMD-0437
          </a>
        </nav>
      </header>

      <div className="flex flex-col items-center px-4 pt-6 sm:px-6 sm:pt-7">
        <div className="bg-brand-bg text-brand flex items-center gap-2.5 rounded-full px-4 py-1.5 text-center text-xs font-semibold">
          <span className="bg-brand h-1.5 w-1.5 rounded-full" />
          {activeCluster?.rate
            ? `The floor on ${cluster} is ${activeCluster.rate.toLocaleString("en-US")} lamports per byte`
            : `Reading the ${cluster} floor`}
        </div>

        <form onSubmit={onSubmit} className="mt-6 w-full max-w-[760px]">
          <div className="bg-raised border-dot flex items-center gap-2 rounded-full border py-1.5 pr-1.5 pl-4 sm:gap-2.5 sm:pl-6">
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Paste a wallet, token account, mint or program address"
              spellCheck={false}
              aria-label="Solana address"
              className="text-ink-2 placeholder:text-muted-2 min-w-0 flex-1 basis-0 bg-transparent py-3 font-mono text-xs outline-none sm:text-sm"
            />
            <button
              type="submit"
              disabled={scanning}
              className="bg-ink text-ground shrink-0 cursor-pointer rounded-full px-5 py-3 text-sm font-semibold disabled:opacity-60 sm:px-7"
            >
              {scanning ? "Scanning" : "Check"}
            </button>
          </div>
        </form>

        <div className="mt-3 flex gap-2">
          {SCAN_CLUSTERS.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => switchCluster(name)}
              className={`cursor-pointer rounded-full px-3 py-1 text-xs font-semibold ${
                cluster === name ? "bg-rule text-ink" : "text-muted-2 hover:text-ink-2"
              }`}
            >
              {name}
            </button>
          ))}
        </div>

        {error && <p className="text-warn mt-6 text-sm">{error}</p>}

        {!scan && !error && (
          <p className="text-muted mt-10 max-w-lg text-center text-[15px] leading-relaxed text-pretty">
            SIMD-0437 is lowering the rent floor on Solana in five steps. Balances did not move when the
            first one landed, so every account funded before it is holding a surplus. Paste an address to
            see yours.
          </p>
        )}

        <div className="flex w-full max-w-[760px] flex-col items-center">
          {scan && (
            <Results scan={scan} stage={stage} onSelectStage={setStage} />
          )}

          {scan?.notes.map((note) => (
            <p key={note} className="text-muted-2 mt-4 w-full text-sm leading-relaxed">
              {note}
            </p>
          ))}

          <div className="mt-11 w-full">
            <Rollout clusters={clusters} selectedStage={stage} onSelectStage={setStage} />
          </div>

          <footer className="border-rule mt-9 w-full border-t pt-6">
            <p className="text-muted-2 text-sm leading-relaxed">
              Nothing is lost by waiting. The surplus stays in your accounts until you take it and it grows
              at every step, so an address holding only token accounts is better off coming back later.
              <br />
              This page only reads. It never asks for a wallet and never builds a transaction. Floors come
              from the chain rather than a constant, so the figures follow the rollout on their own. MIT
              licensed.
            </p>
            <div className="mt-6 flex items-center justify-center gap-5">
              <a
                href={REPO_URL}
                target="_blank"
                rel="noreferrer"
                aria-label={`${AUTHOR} on GitHub`}
                className="text-muted-2 hover:text-brand"
              >
                <GitHubMark className="h-[18px] w-[18px]" />
              </a>
              <a
                href={X_URL}
                target="_blank"
                rel="noreferrer"
                aria-label={`${AUTHOR} on X`}
                className="text-muted-2 hover:text-brand"
              >
                <XMark className="h-[17px] w-[17px]" />
              </a>
            </div>
          </footer>
        </div>
      </div>
    </main>
  );
}
