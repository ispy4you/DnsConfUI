"use client";

import { Check, CheckCircle2, ChevronDown, Loader2, XCircle } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { DNS_DONORS, isDnsDonorPreset } from "@/domain/dns-donors";
import { checkDonor, type DonorCheck } from "@/lib/dns/donor-check";
import { useLocale } from "@/lib/i18n/context";
import { cn } from "@/components/ui";
import { Tooltip } from "@/components/ui/tooltip";

type Status = "checking" | "ok" | "fail";

// Selected mark, donor name, DNS check, chatgpt.com check (right-aligned).
const ROW_GRID = "grid grid-cols-[0.875rem_minmax(0,1fr)_4.5rem_5.5rem] items-center gap-1.5";

function toStatus(ms: number | null | undefined): Status {
  return ms === undefined ? "checking" : ms === null ? "fail" : "ok";
}

function StatusIcon({ status, label }: { status: Status; label: string }) {
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

export function DonorSelect({
  value,
  onChange,
  label
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const { t } = useLocale();
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const run = useRef(0);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [checks, setChecks] = useState<Record<string, DonorCheck>>({});

  function runChecks() {
    // Results of an earlier run that arrive late are dropped.
    const current = ++run.current;
    setChecks({});
    DNS_DONORS.forEach((donor) => {
      checkDonor(donor.value).then((result) => {
        if (run.current === current) setChecks((prev) => ({ ...prev, [donor.value]: result }));
      });
    });
  }

  useEffect(() => {
    runChecks();
    return () => { run.current++; };
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const options = [
    ...(isDnsDonorPreset(value) ? [] : [{ label: `${t("profiles.donorCustom")}: ${value}`, value, preset: false }]),
    ...DNS_DONORS.map((donor) => ({ label: donor.label, value: donor.value, preset: true }))
  ];
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const optionId = (index: number) => `${id}-option-${index}`;

  useEffect(() => {
    if (open) document.getElementById(optionId(active))?.scrollIntoView?.({ block: "nearest" });
  }, [open, active]);

  function statusOf(donor: string) {
    const check = checks[donor];
    const dns = toStatus(check?.dnsMs);
    const chatgpt = toStatus(check?.chatgptMs);
    const dnsKey = { checking: "profiles.donorCheckDnsChecking", ok: "profiles.donorCheckDnsOk", fail: "profiles.donorCheckDnsFail" } as const;
    const country = check?.country ?? null;
    const chatgptKey = {
      checking: "profiles.donorCheckChatgptChecking",
      ok: "profiles.donorCheckChatgptOk",
      fail: country ? "profiles.donorCheckChatgptBlocked" : "profiles.donorCheckChatgptFail"
    } as const;
    return {
      dns,
      chatgpt,
      country,
      dnsMs: check?.dnsMs ?? null,
      chatgptMs: check?.chatgptMs ?? null,
      dnsText: t(dnsKey[dns], { ms: check?.dnsMs ?? 0 }),
      chatgptText: t(chatgptKey[chatgpt], { ms: check?.chatgptMs ?? 0, country: country ?? "" })
    };
  }

  function openList() {
    setActive(selectedIndex);
    setOpen(true);
    runChecks();
  }

  function choose(index: number) {
    onChange(options[index].value);
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const last = options.length - 1;
    const keys: Record<string, () => void> = open
      ? {
          ArrowDown: () => setActive((i) => Math.min(last, i + 1)),
          ArrowUp: () => setActive((i) => Math.max(0, i - 1)),
          Home: () => setActive(0),
          End: () => setActive(last),
          Enter: () => choose(active),
          " ": () => choose(active),
          Escape: () => setOpen(false)
        }
      : { ArrowDown: openList, ArrowUp: openList, Enter: openList, " ": openList };
    if (event.key === "Tab") return setOpen(false);
    const handler = keys[event.key];
    if (!handler) return;
    event.preventDefault();
    handler();
  }

  const selected = options[selectedIndex];
  const selectedStatus = selected.preset ? statusOf(selected.value) : null;

  return (
    <div ref={rootRef} className="relative w-56 min-w-0 max-w-full">
      <button
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        aria-activedescendant={open ? optionId(active) : undefined}
        title={value}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        className="flex h-5 w-full items-center gap-1.5 rounded-md border border-line bg-white px-2 text-left text-xs text-ink outline-none focus:border-steel focus:ring-2 focus:ring-steel/20"
      >
        <span className="min-w-0 flex-1 truncate">{selected.label}</span>
        {selectedStatus ? (
          <>
            <StatusIcon status={selectedStatus.dns} label={selectedStatus.dnsText} />
            <StatusIcon status={selectedStatus.chatgpt} label={selectedStatus.chatgptText} />
          </>
        ) : null}
        <ChevronDown aria-hidden="true" className={cn("size-3.5 shrink-0 text-ink/50 transition", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-20 mt-1 w-[21rem] max-w-[calc(100vw-2rem)] rounded-md border border-line bg-white text-xs text-ink shadow-soft">
          <div className={cn(ROW_GRID, "border-b border-line px-2 py-1.5 text-[11px] text-ink/50")}>
            <span />
            <span className="flex items-center gap-1">
              {t("profiles.donorCheckHeader")}
              <Tooltip text={t("profiles.donorCheckTooltip")} className="size-3" />
            </span>
            <span aria-hidden="true">DNS</span>
            <span aria-hidden="true" className="text-right">chatgpt.com</span>
          </div>
          <ul id={`${id}-listbox`} role="listbox" aria-label={label} className="max-h-72 overflow-y-auto py-1">
            {options.map((option, index) => {
              const status = option.preset ? statusOf(option.value) : null;
              const isSelected = option.value === value;
              return (
                <li
                  key={option.value}
                  id={optionId(index)}
                  role="option"
                  aria-selected={isSelected}
                  aria-label={status ? `${option.label}. ${status.dnsText}. ${status.chatgptText}` : option.label}
                  title={option.value}
                  onMouseEnter={() => setActive(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(index)}
                  className={cn(
                    ROW_GRID,
                    "cursor-pointer px-2 py-1.5",
                    index === active && "bg-mint",
                    isSelected && "font-medium"
                  )}
                >
                  <Check aria-hidden="true" className={cn("size-3.5 text-moss", !isSelected && "invisible")} />
                  <span className="truncate">{option.label}</span>
                  {status ? (
                    <>
                      <span className="flex items-center gap-1">
                        <StatusIcon status={status.dns} label={status.dnsText} />
                        {status.dnsMs !== null ? (
                          <span aria-hidden="true" className="text-[11px] font-normal tabular-nums text-ink/50">{t("profiles.donorCheckMs", { ms: status.dnsMs })}</span>
                        ) : null}
                      </span>
                      <span className="flex items-center justify-end gap-1">
                        {status.country ? (
                          <span aria-hidden="true" className={cn("text-[11px] font-medium", status.chatgpt === "fail" ? "text-coral" : "text-ink/60")}>{status.country}</span>
                        ) : null}
                        {status.chatgptMs !== null ? (
                          <span aria-hidden="true" className="text-[11px] font-normal tabular-nums text-ink/50">{t("profiles.donorCheckMs", { ms: status.chatgptMs })}</span>
                        ) : null}
                        <StatusIcon status={status.chatgpt} label={status.chatgptText} />
                      </span>
                    </>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
