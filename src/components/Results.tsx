"use client";

import { useMemo } from "react";
import { commas, LAMPORT_GLYPH, shortAddress, sol, sumForDisplay, toSol, usd } from "@/lib/format";
import { BASE_LAMPORTS_PER_BYTE, PHASES } from "@/lib/rent";
import type { ScanResult, ScannedAccount } from "@/lib/scan";
import { ARTICLE_URL } from "@/lib/site";

const KIND_LABEL: Record<ScannedAccount["kind"], string> = {
  "token-account": "token account",
  mint: "mint",
  "program-data": "program data",
  wallet: "wallet",
};

/** The glyph rendered from a stack that actually has it, sized to the number. */
function Lamports({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`mr-1.5 font-normal ${className}`}
      style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
    >
      {LAMPORT_GLYPH}
    </span>
  );
}

function Figure({ lamports, price }: { lamports: bigint; price: number | null }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span className="tnum text-xl font-semibold">{sol(lamports)}</span>
      {usd(lamports, price) && <span className="tnum text-brand text-sm">{usd(lamports, price)}</span>}
    </div>
  );
}

export function Results({
  scan,
  stage,
  onSelectStage,
}: {
  scan: ScanResult;
  stage: number;
  onSelectStage: (stage: number) => void;
}) {
  const phase = scan.phases.find((p) => p.stage === stage) ?? scan.phases[0];
  const total = BigInt(phase.total);
  const claimable = BigInt(phase.claimable);
  const program = BigInt(phase.program);
  const closable = BigInt(scan.totals.closable);
  const live = phase.reached;

  const programAccounts = useMemo(
    () => scan.accounts.filter((a) => a.method === "program-redeploy"),
    [scan.accounts],
  );
  const tokenAccounts = useMemo(
    () => scan.accounts.filter((a) => a.kind === "token-account"),
    [scan.accounts],
  );
  const mints = useMemo(() => scan.accounts.filter((a) => a.kind === "mint"), [scan.accounts]);

  const lineFor = (accounts: ScannedAccount[]) =>
    sumForDisplay(
      accounts.map((a) => {
        const rate = Math.min(phase.rate, scan.rate);
        const floor = BigInt(a.dataLen + 128) * BigInt(rate);
        const held = BigInt(a.lamports);
        return held > floor ? held - floor : 0n;
      }),
    );

  const lines = [
    { name: `${programAccounts.length} program${programAccounts.length === 1 ? "" : "s"}`, accounts: programAccounts },
    { name: `${tokenAccounts.length} token account${tokenAccounts.length === 1 ? "" : "s"}`, accounts: tokenAccounts },
    { name: `${mints.length} token mint${mints.length === 1 ? "" : "s"}`, accounts: mints },
  ].filter((l) => l.accounts.length > 0);

  const biggest = scan.accounts.slice(0, 3);
  const rest = scan.accounts.length - biggest.length;

  return (
    <>
      <p className="text-muted-2 mt-8 text-sm tracking-wide">
        {live ? "This address can reclaim right now" : "This address will be able to reclaim"}
      </p>
      <p className="font-display tnum mt-2 text-5xl font-bold tracking-tighter sm:text-7xl">
        <Lamports className="text-muted-2 text-3xl sm:text-5xl" />
        {toSol(total, 4)}
      </p>
      {usd(total, scan.solPrice) && (
        <p className="font-display tnum text-brand mt-2.5 text-2xl font-medium sm:text-3xl">
          {usd(total, scan.solPrice)}
        </p>
      )}
      <p className="text-muted mt-3.5 max-w-xl text-center text-[15px] leading-relaxed text-pretty">
        {claimable > 0n && program > 0n
          ? `${sol(claimable)} of that is one click away. The other ${sol(program)} sits in a program until you redeploy it.`
          : program > 0n
            ? `All of it sits in a program. Releasing it means redeploying the same binary.`
            : `${scan.totals.claimableCount} account${scan.totals.claimableCount === 1 ? "" : "s"} can hand it back without closing anything.`}
      </p>

      <div className="border-rule mt-8 flex w-full flex-col border-t border-b sm:flex-row">
        {[
          { label: "Accounts were funded at", value: BASE_LAMPORTS_PER_BYTE },
          { label: "The floor is now", value: scan.rate },
          { label: "And will reach", value: 696 },
        ].map((cell, i) => (
          <div
            key={cell.label}
            className={`min-w-0 flex-1 basis-0 py-3 sm:py-4 ${i > 0 ? "border-rule border-t sm:border-t-0 sm:border-l sm:pl-5" : ""}`}
          >
            <div className="label uppercase">{cell.label}</div>
            <div className="tnum mt-1.5 text-xl">
              {commas(cell.value)} <span className="text-muted-2 text-sm">per byte</span>
            </div>
          </div>
        ))}
      </div>
      <p className="text-muted-2 mt-3 w-full text-sm">
        Balances never moved when the floor dropped. Everything between those numbers is yours to take back.
      </p>

      <div className="mt-10 w-full">
        <div className="mb-3.5 flex items-end justify-between">
          <span className="label">WALK THROUGH THE ROLLOUT</span>
          <span className="text-muted text-sm">
            {live
              ? `Live now at ${commas(scan.rate)} lamports per byte`
              : `Once step ${phase.stage} activates at ${commas(phase.rate)}`}
          </span>
        </div>
        <div className="relative flex h-12 items-center justify-between [--stop:3.75rem] sm:[--stop:6rem]">
          <div className="bg-rule absolute top-[10px] right-[calc(var(--stop)/2)] left-[calc(var(--stop)/2)] h-[3px]" />
          <div
            className="bg-brand absolute top-[10px] left-[calc(var(--stop)/2)] h-[3px] transition-[width] duration-200"
            style={{ width: `calc(${(stage - 1) / (PHASES.length - 1)} * (100% - var(--stop)))` }}
          />
          {scan.phases.map((p) => {
            const on = p.stage === stage;
            const past = p.stage < stage;
            return (
              <button
                key={p.stage}
                type="button"
                onClick={() => onSelectStage(p.stage)}
                aria-pressed={on}
                className="relative z-10 flex w-(--stop) cursor-pointer flex-col items-center gap-2.5"
              >
                <span className="flex h-5 items-center justify-center">
                  <span
                    className={`rounded-full border-2 transition-all ${
                      on ? "h-[17px] w-[17px]" : "h-[11px] w-[11px]"
                    } ${on || past ? "border-brand bg-brand" : "border-dot bg-raised"}`}
                  />
                </span>
                <span className={`text-[11px] whitespace-nowrap sm:text-xs ${on ? "text-ink font-semibold" : "text-muted-2"}`}>
                  {p.reached && p.stage === 1 ? "Now" : `Phase ${p.stage}`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-raised border-rule mt-10 w-full rounded-xl border p-5 sm:p-7">
        <div className="label mb-4">WHERE IT SITS</div>
        {lines.map((line) => (
          <div key={line.name} className="mb-3 flex items-baseline">
            <span className="text-[15px]">{line.name}</span>
            <span className="leader" />
            <span className="tnum text-ink-2 text-[15px]">{sol(lineFor(line.accounts))}</span>
          </div>
        ))}
        <div className="border-rule mt-4 flex items-baseline border-t pt-4">
          <span className="text-[15px] font-semibold">Total</span>
          <span className="leader" />
          <span className="tnum text-[17px] font-semibold">
            {sol(sumForDisplay(lines.map((l) => lineFor(l.accounts))))}
          </span>
        </div>

        {biggest.length > 0 && (
          <div className="border-rule-soft mt-6 border-t pt-5">
            <div className="label mb-3">BIGGEST ACCOUNTS</div>
            {biggest.map((account) => (
              <div key={account.address} className="mb-2.5 flex items-baseline">
                <span className="text-ink-2 w-32 font-mono text-[13px] sm:w-60">
                  {shortAddress(account.address)}
                </span>
                <span className="text-muted-2 hidden flex-grow text-[13px] sm:block">
                  {KIND_LABEL[account.kind]}
                </span>
                <span className="flex-grow sm:hidden" />
                <span className="tnum text-ink-2 text-[13px]">{sol(lineFor([account]))}</span>
              </div>
            ))}
            {rest > 0 && (
              <div className="mt-3 flex items-baseline">
                <span className="text-muted-2 w-32 text-[13px] sm:w-60">+ {rest} more accounts</span>
                <span className="flex-grow" />
                <span className="tnum text-muted-2 text-[13px]">
                  {sol(lineFor(scan.accounts.slice(3)))}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-raised border-rule mt-8 w-full rounded-xl border p-5 sm:p-7">
        <h3 className="text-base font-semibold">How to take it</h3>
        <dl className="mt-4 space-y-3.5 text-sm leading-relaxed">
          {claimable > 0n && (
            <div>
              <dt className="text-ink-2 font-medium">Token accounts and mints</dt>
              <dd className="text-muted mt-1">
                One Token program instruction, WithdrawExcessLamports, moves everything above the floor
                and leaves the account open and funded. A token account is signed for by its owner, a
                mint by its mint authority.
              </dd>
            </div>
          )}
          {program > 0n && (
            <div>
              <dt className="text-ink-2 font-medium">Programs</dt>
              <dd className="text-muted mt-1">
                Redeploy the same binary. The loader drops ProgramData to the new floor and pays the
                difference to the fee payer. The program ID, the code and the accounts are untouched.
              </dd>
            </div>
          )}
        </dl>
        <a
          href={ARTICLE_URL}
          target="_blank"
          rel="noreferrer"
          className="text-brand mt-5 inline-block text-sm font-medium hover:underline"
        >
          The full walkthrough, with code, by @a_milz
        </a>
      </div>

      <div className="mt-8 flex w-full flex-col gap-4 sm:flex-row sm:gap-6">
        {closable > 0n && (
          <div className="bg-raised border-rule min-w-0 flex-1 basis-0 rounded-xl border p-6">
            <h3 className="text-base font-semibold">{scan.totals.emptyCount} of them are empty</h3>
            <p className="text-muted mt-2 text-sm leading-relaxed">
              Those token accounts hold no tokens. Closing one returns its whole deposit, not just the
              surplus.
            </p>
            <div className="mt-4">
              <Figure lamports={closable} price={scan.solPrice} />
            </div>
            <p className="text-muted-2 mt-3 text-xs">
              Closing is permanent. The account has to be recreated to be used again.
            </p>
          </div>
        )}

        {programAccounts.length > 0 && (
          <div className="bg-raised border-rule min-w-0 flex-1 basis-0 rounded-xl border p-6">
            <h3 className="text-base font-semibold">
              {programAccounts.length === 1 ? "Your program" : "Your programs"}
            </h3>
            <p className="text-muted mt-2 text-sm leading-relaxed">
              The loader has no withdraw instruction. Redeploying the same binary drops it to the floor
              and pays you the difference.
            </p>
            <div className="mt-4">
              <Figure lamports={program} price={scan.solPrice} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
