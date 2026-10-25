"use client";

import { Check, ChevronDown, Copy, RefreshCw, X } from "lucide-react";
import { useEffect, useId, useState, type FormEvent } from "react";
import { BLOCKED_COUNTRIES, DNS_DONORS, isDnsDonorPreset } from "@/domain/dns-donors";
import { encodeForShell, parseLocalResults, unixCommand, windowsCommand, type LocalResult, type LocalTarget } from "@/lib/dns/local-check";
import { useLocale } from "@/lib/i18n/context";
import { cn } from "@/components/ui";
import { Tooltip } from "@/components/ui/tooltip";
import { ChatgptCheck, DnsCheck, StatusIcon, useDonorChecks } from "@/components/wizard/donor-checks";

const BUTTON_CLASS = "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-line bg-white px-2.5 py-1 text-xs font-medium text-ink/60 transition-colors hover:border-ink/30 hover:text-ink disabled:cursor-not-allowed disabled:opacity-60";
const CUSTOM_KEY = "c";

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function timeAgo(unixSeconds: number, locale: string): string {
  const minutes = Math.round((unixSeconds * 1000 - Date.now()) / 60_000);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" });
  if (Math.abs(minutes) < 60) return format.format(minutes, "minute");
  if (Math.abs(minutes) < 24 * 60) return format.format(Math.round(minutes / 60), "hour");
  return format.format(Math.round(minutes / 1440), "day");
}

function LocalCheck({ result, dnsFailed }: { result: LocalResult | undefined; dnsFailed: boolean }) {
  const { t } = useLocale();
  if (result === undefined && !dnsFailed) {
    return <span title={t("monitor.local.none")} className="text-ink/30"><span className="sr-only">{t("monitor.local.none")}</span><span aria-hidden="true">—</span></span>;
  }
  const blocked = !!result && BLOCKED_COUNTRIES.has(result.country);
  // A DNS that gave the server no address has nothing to test from the user's computer, which is a failure too.
  const text = result === undefined
    ? t("monitor.local.noAddress")
    : result === null
      ? t("monitor.local.fail")
      : t(blocked ? "monitor.local.blocked" : "monitor.local.ok", { country: result.country, ms: result.ms });
  return (
    <span className="flex items-center gap-1">
      <span className="sr-only">{text}</span>
      {/* The slots stay even when empty, so the icon keeps its place at the right like in the ChatGPT column. */}
      <span aria-hidden="true" className={cn("w-5 text-center text-[11px] font-medium", blocked ? "text-coral" : "text-ink/60")}>{result?.country}</span>
      <span aria-hidden="true" className="min-w-[2.75rem] text-right text-[11px] tabular-nums text-ink/50">{result ? t("profiles.donorCheckMs", { ms: result.ms }) : null}</span>
      <StatusIcon status={result && !blocked ? "ok" : "fail"} label={text} />
    </span>
  );
}

function LocalCheckPanel({ targets, resultUrl, ready }: { targets: LocalTarget[]; resultUrl: () => string; ready: boolean }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [os, setOs] = useState<"windows" | "unix">("windows");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!/Windows/i.test(navigator.userAgent)) setOs("unix");
  }, []);

  // Built only once the panel is open: it needs window.location, which does not exist during server rendering.
  const command = open && ready ? (os === "windows" ? windowsCommand : unixCommand)(targets, resultUrl()) : "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)} className="group mt-4 border-t border-line pt-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-medium text-ink/70">
        {t("monitor.local.title")}
        <ChevronDown className="size-3.5 text-ink/40 transition group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="mt-2 space-y-2 text-xs leading-5 text-ink/70">
        <p>{t("monitor.local.intro")}</p>
        <div role="group" aria-label={t("monitor.local.os")} className="inline-flex rounded-md border border-line p-0.5">
          {(["windows", "unix"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={os === value}
              onClick={() => { setOs(value); setCopied(false); }}
              className={cn("rounded px-2 py-0.5 transition-colors", os === value ? "bg-mint font-medium text-ink" : "text-ink/60 hover:text-ink")}
            >
              {t(value === "windows" ? "monitor.local.windows" : "monitor.local.unix")}
            </button>
          ))}
        </div>
        <p>{t(os === "windows" ? "monitor.local.stepsWindows" : "monitor.local.stepsUnix")}</p>
        {ready ? (
          <>
            <pre className="max-h-28 overflow-auto whitespace-pre-wrap break-all rounded-md border border-line bg-paper p-2 font-mono text-[11px] text-ink/80">{command}</pre>
            <div className="flex items-center gap-2">
              <button type="button" onClick={copy} className={BUTTON_CLASS}>
                {copied ? <Check className="size-3.5 text-moss" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
                {t("monitor.local.copy")}
              </button>
              <span role="status" className="text-moss">{copied ? t("monitor.local.copied") : null}</span>
            </div>
            <p>{t("monitor.local.after")}</p>
          </>
        ) : (
          <p className="text-ink/50">{t("monitor.local.wait")}</p>
        )}
      </div>
    </details>
  );
}

export function DnsMonitor() {
  const { t, locale } = useLocale();
  const headingId = useId();
  const inputId = useId();
  const errorId = useId();
  const { check, runChecks, statusOf } = useDonorChecks();
  const [custom, setCustom] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [local, setLocal] = useState<Record<string, LocalResult> | null>(null);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const statuses = DNS_DONORS.map((donor) => ({ donor, status: statusOf(donor.value) }));
  const customStatus = custom ? statusOf(custom) : null;
  const checking = [...statuses.map(({ status }) => status), ...(customStatus ? [customStatus] : [])]
    .some((status) => status.chatgpt === "checking");
  const targets: LocalTarget[] = [
    ...statuses.flatMap(({ status }, index) => status.ips.map((ip) => ({ key: String(index), ip }))),
    ...(customStatus?.ips ?? []).map((ip) => ({ key: CUSTOM_KEY, ip }))
  ];

  useEffect(() => runChecks(), [runChecks]);

  // The command reopens this page with its results (and the custom DoH it tested) in the fragment.
  useEffect(() => {
    function readFragment() {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const doh = params.get("doh");
      const results = params.get("local");
      if (doh && isHttpsUrl(doh) && !isDnsDonorPreset(doh)) {
        setCustom(doh);
        check([doh]);
      }
      if (results !== null) setLocal(parseLocalResults(results, BLOCKED_COUNTRIES));
      setCheckedAt(Number(params.get("at")) || null);
    }
    readFragment();
    // The link may also be pasted into a tab that already shows this page.
    window.addEventListener("hashchange", readFragment);
    return () => window.removeEventListener("hashchange", readFragment);
  }, [check]);

  function resultUrl() {
    return `${window.location.origin}${window.location.pathname}#${custom ? `doh=${encodeForShell(custom)}&` : ""}`;
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const typed = input.trim();
    // People often paste a bare host, so a missing scheme means HTTPS.
    const value = /^[a-z][a-z\d+.-]*:\/\//i.test(typed) || !typed ? typed : `https://${typed}`;
    setInvalid(!isHttpsUrl(value));
    if (!isHttpsUrl(value)) return;
    // A preset is already listed, so it is rechecked in place instead of being added twice.
    setCustom(isDnsDonorPreset(value) ? null : value);
    check([value]);
  }

  const localHeader = local ? (
    <th scope="col" className="whitespace-nowrap border-l border-line pb-1.5 pl-2 text-left font-normal sm:pl-3">
      <span className="inline-flex items-center gap-1">{t("monitor.local.column")}<Tooltip text={t("monitor.local.columnHint")} className="size-3" align="end" /></span>
      {checkedAt ? <span className="block text-[10px] leading-tight text-ink/40">{timeAgo(checkedAt, locale)}</span> : null}
    </th>
  ) : null;

  return (
    <section aria-labelledby={headingId} className="w-full rounded-lg border border-line bg-white p-4 shadow-soft md:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <h2 id={headingId} className="whitespace-nowrap text-base font-semibold text-ink">{t("monitor.title")}</h2>
          <Tooltip text={t("profiles.donorCheckTooltip")} />
        </div>
        <button type="button" onClick={() => runChecks(custom ? [custom] : [])} disabled={checking} className={BUTTON_CLASS}>
          <RefreshCw className={cn("size-3.5", checking && "animate-spin")} aria-hidden="true" />
          {t("monitor.refresh")}
        </button>
      </div>
      {/* No overflow scrolling here: it would clip the header tooltips, so the columns are sized to fit phones instead. */}
      <div className="mt-3">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-ink/50 *:align-bottom">
              <th scope="col" className="w-full pb-1.5 text-left font-normal"><span className="sr-only">{t("monitor.server")}</span></th>
              <th scope="col" className={cn("whitespace-nowrap pb-1.5 pr-2 text-left font-normal sm:pr-4", local && "hidden sm:table-cell")}><span className="inline-flex items-center gap-1">DNS<Tooltip text={t("profiles.donorCheckDnsHint")} className="size-3" /></span></th>
              <th scope="col" className="whitespace-nowrap border-l border-line pb-1.5 pl-2 pr-2 text-left font-normal sm:pl-4 sm:pr-3"><span className="inline-flex items-center gap-1">ChatGPT<Tooltip text={t("profiles.donorCheckChatgptHint")} className="size-3" align="end" /></span></th>
              {localHeader}
            </tr>
          </thead>
          <tbody>
            {statuses.map(({ donor, status }, index) => (
              <tr key={donor.value} className="border-t border-line">
                <th scope="row" className="whitespace-nowrap py-1.5 pr-2 text-left font-normal sm:pr-4">
                  {donor.site ? (
                    <a href={donor.site} target="_blank" rel="noreferrer" className="text-ink underline decoration-ink/25 underline-offset-2 transition-colors hover:text-steel hover:decoration-steel">
                      {donor.label}
                    </a>
                  ) : donor.label}
                </th>
                <td className={cn("whitespace-nowrap py-1.5 pr-2 sm:pr-4", local && "hidden sm:table-cell")}><DnsCheck status={status} /></td>
                <td className="whitespace-nowrap border-l border-line py-1.5 pl-2 pr-2 sm:pl-4 sm:pr-3"><ChatgptCheck status={status} compact={local !== null} /></td>
                {local ? <td className="whitespace-nowrap border-l border-line py-1.5 pl-2 sm:pl-3"><LocalCheck result={local[String(index)]} dnsFailed={status.dns === "fail"} /></td> : null}
              </tr>
            ))}
            {custom && customStatus ? (
              <tr className="border-t border-line bg-mint/40">
                <th scope="row" className="whitespace-nowrap py-1.5 pr-2 text-left font-normal sm:pr-4">
                  <span className="flex items-center gap-1.5">
                    <span title={custom} className="max-w-[9rem] truncate">{new URL(custom).host}</span>
                    <span className="text-[11px] text-ink/50">{t("monitor.custom.tag")}</span>
                    <button
                      type="button"
                      onClick={() => setCustom(null)}
                      aria-label={t("monitor.custom.remove")}
                      className="rounded text-ink/40 transition-colors hover:text-coral"
                    >
                      <X className="size-3.5" aria-hidden="true" />
                    </button>
                  </span>
                </th>
                <td className={cn("whitespace-nowrap py-1.5 pr-2 sm:pr-4", local && "hidden sm:table-cell")}><DnsCheck status={customStatus} /></td>
                <td className="whitespace-nowrap border-l border-line py-1.5 pl-2 pr-2 sm:pl-4 sm:pr-3"><ChatgptCheck status={customStatus} compact={local !== null} /></td>
                {local ? <td className="whitespace-nowrap border-l border-line py-1.5 pl-2 sm:pl-3"><LocalCheck result={local[CUSTOM_KEY]} dnsFailed={customStatus.dns === "fail"} /></td> : null}
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <LocalCheckPanel targets={targets} resultUrl={resultUrl} ready={!checking && targets.length > 0} />
      <form onSubmit={submit} noValidate className="mt-4 border-t border-line pt-3">
        <label htmlFor={inputId} className="text-xs font-medium text-ink/70">{t("monitor.custom.label")}</label>
        <div className="mt-1.5 flex gap-2">
          <input
            id={inputId}
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={input}
            onChange={(event) => { setInput(event.target.value); setInvalid(false); }}
            placeholder="https://example.com/dns-query"
            aria-invalid={invalid}
            aria-describedby={invalid ? errorId : undefined}
            className={cn(
              "h-8 min-w-0 flex-1 rounded-md border border-line bg-white px-2 text-xs text-ink outline-none placeholder:text-ink/35 focus:border-steel focus:ring-2 focus:ring-steel/20",
              invalid && "border-coral"
            )}
          />
          <button type="submit" className={BUTTON_CLASS}>{t("monitor.custom.check")}</button>
        </div>
        {invalid ? <p id={errorId} className="mt-1.5 text-xs text-coral">{t("monitor.custom.invalid")}</p> : null}
      </form>
    </section>
  );
}
