"use client";

import type { ClusterState } from "@/app/api/gates/route";
import type { GateStatus } from "@/lib/gates";
import { PHASES } from "@/lib/rent";
import { commas } from "@/lib/format";

const STATUS_LABEL: Record<GateStatus, string> = {
  active: "Active",
  pending: "Pending",
  inactive: "Inactive",
};

const STATUS_CLASS: Record<GateStatus, string> = {
  active: "bg-brand-bg text-brand",
  pending: "bg-warn-bg text-warn",
  inactive: "bg-rule-soft text-muted-2",
};

function Pill({ status }: { status: GateStatus | null }) {
  if (status === null) {
    return <span className="text-muted-2 text-xs">—</span>;
  }
  return (
    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_CLASS[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Rollout({
  clusters,
  selectedStage,
  onSelectStage,
}: {
  clusters: ClusterState[];
  selectedStage: number;
  onSelectStage: (stage: number) => void;
}) {
  const statusFor = (cluster: ClusterState, stage: number): GateStatus | null =>
    cluster.gates.find((g) => g.stage === stage)?.status ?? null;

  return (
    <section id="rollout" className="w-full">
      <h2 className="font-display text-xl font-bold tracking-tight sm:text-2xl">The rollout</h2>
      <p className="text-muted mt-2 text-sm leading-relaxed">
        Five feature gates, each switched on separately once core developers judge the state growth safe.
        Nothing after the live step has a date. Read from the gate accounts on every cluster.
      </p>

      <div className="border-rule mt-5 flex flex-col border-t border-b sm:flex-row">
        {clusters.map((cluster, i) => (
          <div
            key={cluster.cluster}
            className={`min-w-0 flex-1 basis-0 py-3 sm:py-4 ${i > 0 ? "border-rule border-t sm:border-t-0 sm:border-l sm:pl-5" : ""}`}
          >
            <div className="label uppercase">{cluster.cluster}</div>
            <div className="tnum mt-1.5 text-xl">
              {cluster.rate === null ? (
                <span className="text-muted-2 text-base">unavailable</span>
              ) : (
                <>
                  {commas(cluster.rate)} <span className="text-muted-2 text-sm">per byte</span>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-raised border-rule mt-5 overflow-x-auto rounded-xl border p-5">
        <div className="min-w-[620px]">
        <div className="border-rule label flex border-b pb-3 pl-3.5 uppercase">
          <div className="w-64">Stage</div>
          <div className="w-40">Rate change</div>
          {clusters.map((c) => (
            <div key={c.cluster} className="w-24">
              {c.cluster}
            </div>
          ))}
        </div>

        {PHASES.map((phase) => {
          const selected = phase.stage === selectedStage;
          return (
            <button
              key={phase.stage}
              type="button"
              onClick={() => onSelectStage(phase.stage)}
              aria-pressed={selected}
              className={`border-rule-soft block w-full cursor-pointer border-b py-3.5 pl-3 text-left last:border-b-0 ${
                selected ? "border-l-brand border-l-2" : "border-l-2 border-l-transparent"
              }`}
            >
              <div className="flex items-center">
                <div className="w-64 text-sm font-semibold">SIMD-0437-{phase.stage}</div>
                <div className="tnum text-ink-2 w-40 text-sm">
                  6,960 → {commas(phase.rate)}{" "}
                  <span className="text-muted-2">
                    (−{Math.round(((6960 - phase.rate) / 6960) * 100)}%)
                  </span>
                </div>
                {clusters.map((c) => (
                  <div key={c.cluster} className="w-24">
                    <Pill status={statusFor(c, phase.stage)} />
                  </div>
                ))}
              </div>
              <div className="text-muted-2 mt-1.5 font-mono text-[11px] break-all">{phase.gate}</div>
            </button>
          );
        })}
        </div>
      </div>
      <p className="text-muted-2 mt-3 text-xs sm:hidden">Scroll the table sideways to see every cluster.</p>
    </section>
  );
}
