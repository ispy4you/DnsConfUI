"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useId } from "react";
import { DNS_DONORS } from "@/domain/dns-donors";
import { useLocale } from "@/lib/i18n/context";
import { cn } from "@/components/ui";
import { Tooltip } from "@/components/ui/tooltip";
import { ChatgptCheck, DnsCheck, useDonorChecks } from "@/components/wizard/donor-checks";

export function DnsMonitor() {
  const { t } = useLocale();
  const headingId = useId();
  const { runChecks, statusOf } = useDonorChecks();
  const statuses = DNS_DONORS.map((donor) => ({ donor, status: statusOf(donor.value) }));
  const checking = statuses.some(({ status }) => status.chatgpt === "checking");

  useEffect(() => runChecks(), [runChecks]);

  return (
    <section aria-labelledby={headingId} className="w-full rounded-lg border border-line bg-white p-4 shadow-soft md:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <h2 id={headingId} className="whitespace-nowrap text-base font-semibold text-ink">{t("monitor.title")}</h2>
          <Tooltip text={t("profiles.donorCheckTooltip")} />
        </div>
        <button
          type="button"
          onClick={runChecks}
          disabled={checking}
          className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-line bg-white px-2.5 py-1 text-xs font-medium text-ink/60 transition-colors hover:border-ink/30 hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={cn("size-3.5", checking && "animate-spin")} aria-hidden="true" />
          {t("monitor.refresh")}
        </button>
      </div>
      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="text-[11px] text-ink/50">
            <th scope="col" className="w-full pb-1.5 text-left font-normal"><span className="sr-only">{t("monitor.server")}</span></th>
            <th scope="col" className="whitespace-nowrap pb-1.5 pr-4 text-left font-normal"><span className="inline-flex items-center gap-1">DNS<Tooltip text={t("profiles.donorCheckDnsHint")} className="size-3" /></span></th>
            <th scope="col" className="whitespace-nowrap border-l border-line pb-1.5 pl-4 text-left font-normal"><span className="inline-flex items-center gap-1">chatgpt.com<Tooltip text={t("profiles.donorCheckChatgptHint")} className="size-3" align="end" /></span></th>
          </tr>
        </thead>
        <tbody>
          {statuses.map(({ donor, status }) => (
            <tr key={donor.value} className="border-t border-line">
              <th scope="row" className="whitespace-nowrap py-1.5 pr-4 text-left font-normal">
                {donor.site ? (
                  <a href={donor.site} target="_blank" rel="noreferrer" className="text-ink underline decoration-ink/25 underline-offset-2 transition-colors hover:text-steel hover:decoration-steel">
                    {donor.label}
                  </a>
                ) : donor.label}
              </th>
              <td className="whitespace-nowrap py-1.5 pr-4"><DnsCheck status={status} /></td>
              <td className="whitespace-nowrap border-l border-line py-1.5 pl-4"><ChatgptCheck status={status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
