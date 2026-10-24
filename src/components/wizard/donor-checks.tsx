"use client";

import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { BLOCKED_COUNTRIES, DNS_DONORS } from "@/domain/dns-donors";
import { checkDonor, visitorCountry, type DonorCheck } from "@/lib/dns/donor-check";
import { useLocale } from "@/lib/i18n/context";
import { cn } from "@/components/ui";

type Status = "checking" | "ok" | "fail";

function toStatus(ms: number | null | undefined): Status {
  return ms === undefined ? "checking" : ms === null ? "fail" : "ok";
}

const PRESETS = DNS_DONORS.map((donor) => donor.value);

/** Runs availability checks: `check` for the given DoH URLs, `runChecks` for every preset (plus `extra`). */
export function useDonorChecks() {
  const { t } = useLocale();
  const counter = useRef(0);
  const latest = useRef<Record<string, number>>({});
  const [checks, setChecks] = useState<Record<string, DonorCheck>>({});

  const check = useCallback((donors: string[]) => {
    setChecks((prev) => {
      const next = { ...prev };
      donors.forEach((donor) => delete next[donor]);
      return next;
    });
    donors.forEach((donor) => {
      // A late result from an earlier check of the same donor is dropped.
      const id = ++counter.current;
      latest.current[donor] = id;
      checkDonor(donor).then((result) => {
        if (latest.current[donor] === id) setChecks((prev) => ({ ...prev, [donor]: result }));
      });
    });
  }, []);

  const runChecks = useCallback((extra: string[] = []) => check([...PRESETS, ...extra]), [check]);

  const [visitor, setVisitor] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    visitorCountry().then((country) => { if (mounted) setVisitor(country); });
    return () => {
      mounted = false;
      latest.current = {};
    };
  }, []);

  function statusOf(donor: string) {
    const check = checks[donor];
    const direct = check?.direct ?? false;
    // Without a proxy, chatgpt.com sees the visitor's own country, so the blocked-country rule applies to it.
    const country = direct ? visitor : check?.country ?? null;
    const chatgptMs = check ? (direct && country && BLOCKED_COUNTRIES.has(country) ? null : check.chatgptMs) : undefined;
    const dns = toStatus(check?.dnsMs);
    const chatgpt = toStatus(chatgptMs);
    const dnsKey = { checking: "profiles.donorCheckDnsChecking", ok: "profiles.donorCheckDnsOk", fail: "profiles.donorCheckDnsFail" } as const;
    const chatgptKey = {
      checking: "profiles.donorCheckChatgptChecking",
      ok: direct ? (country ? "profiles.donorCheckChatgptDirect" : "profiles.donorCheckChatgptDirectUnknown") : "profiles.donorCheckChatgptOk",
      fail: direct && country ? "profiles.donorCheckChatgptDirectBlocked" : country ? "profiles.donorCheckChatgptBlocked" : "profiles.donorCheckChatgptFail"
    } as const;
    return {
      dns,
      chatgpt,
      country,
      direct,
      ips: check?.ips ?? [],
      dnsMs: check?.dnsMs ?? null,
      chatgptMs: chatgptMs ?? null,
      dnsText: t(dnsKey[dns], { ms: check?.dnsMs ?? 0 }),
      chatgptText: t(chatgptKey[chatgpt], { ms: chatgptMs ?? 0, country: country ?? "" })
    };
  }

  return { check, runChecks, statusOf };
}

export type DonorStatus = ReturnType<ReturnType<typeof useDonorChecks>["statusOf"]>;

export function StatusIcon({ status, label }: { status: Status; label: string }) {
  const Icon = status === "checking" ? Loader2 : status === "ok" ? CheckCircle2 : XCircle;
  return (
    <span title={label} className="inline-flex shrink-0">
      <Icon
        aria-hidden="true"
        className={cn(
          "size-3.5",
          status === "checking" && "animate-spin text-ink/40",
          status === "ok" && "text-moss",
          status === "fail" && "text-coral"
        )}
      />
    </span>
  );
}

function Detail({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span aria-hidden="true" className={cn("text-[11px] font-normal tabular-nums text-ink/50", className)}>{children}</span>;
}

export function DnsCheck({ status }: { status: DonorStatus }) {
  const { t } = useLocale();
  return (
    <span className="flex items-center gap-1">
      <span className="sr-only">{status.dnsText}</span>
      <StatusIcon status={status.dns} label={status.dnsText} />
      {status.dnsMs !== null ? <Detail>{t("profiles.donorCheckMs", { ms: status.dnsMs })}</Detail> : null}
    </span>
  );
}

export function ChatgptCheck({ status, className, compact = false }: { status: DonorStatus; className?: string; compact?: boolean }) {
  const { t } = useLocale();
  return (
    <span className={cn("flex items-center gap-1", className)}>
      <span className="sr-only">{status.chatgptText}</span>
      {/* Fixed slots keep the country codes lined up in one column across rows. */}
      <Detail className={cn("w-5 text-center font-medium", status.chatgpt === "fail" ? "text-coral" : "text-ink/60")}>{status.country}</Detail>
      <Detail className={cn("min-w-[2.75rem] text-right", compact && "hidden sm:inline")}>
        {status.chatgptMs !== null ? t("profiles.donorCheckMs", { ms: status.chatgptMs }) : null}
      </Detail>
      <StatusIcon status={status.chatgpt} label={status.chatgptText} />
    </span>
  );
}
