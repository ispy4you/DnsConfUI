"use client";

import { CheckCircle2, ChevronDown, Loader2, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { UseFormSetValue } from "react-hook-form";
import type { DnsConfConfig, Profile } from "@/domain/dnsconf-config";
import { DEFAULT_DNS_DONOR } from "@/domain/dns-donors";
import { validateCredentials } from "@/lib/nextdns/api";
import { useLocale } from "@/lib/i18n/context";
import { Field, inputClass } from "@/components/ui";
import { detectProvider } from "@/lib/constants";
import { translatedError } from "./utils";
import { ScriptBehaviour } from "./script-behaviour";
import { ToggleSwitch } from "./toggle-switch";
import { DonorSelect } from "./donor-select";
import { Tooltip } from "@/components/ui/tooltip";

function credentialsKey(profile: Profile): string {
  return JSON.stringify([profile.clientId, profile.authSecret]);
}

export function ProfilesSection({
  profiles,
  setValue,
  profileClientIdErrors,
  profileSecretErrors,
  profileDonorErrors,
  mixedProviderIndices,
  simplified,
  onValidChange,
  retainCredentials = false
}: {
  profiles: DnsConfConfig["profiles"];
  setValue: UseFormSetValue<DnsConfConfig>;
  profileClientIdErrors?: Array<{ index: number; message: string }>;
  profileSecretErrors?: Array<{ index: number; message: string }>;
  profileDonorErrors?: Array<{ index: number; message: string }>;
  mixedProviderIndices?: Set<number>;
  simplified?: boolean;
  onValidChange?: (v: boolean) => void;
  retainCredentials?: boolean;
}) {
  const { t } = useLocale();
  const [selected, setSelected] = useState(0);
  // Keyed by the credentials, not the profile position: removing a profile cannot hand its result to another one,
  // and a late answer for credentials that were since changed does not touch the new ones.
  const [credStatus, setCredStatus] = useState<Record<string, { status: "validating" | "valid" | "invalid"; message?: string }>>({});
  const validateTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const enabledDonors = useRef<Record<number, string>>(
    Object.fromEntries(profiles.flatMap((profile, index) => profile.donorDns ? [[index, profile.donorDns]] : [])),
  );
  useEffect(() => () => { Object.values(validateTimers.current).forEach(clearTimeout); }, []);

  useEffect(() => {
    profiles.forEach((profile, index) => {
      if (profile.donorDns) enabledDonors.current[index] = profile.donorDns;
    });
  }, [profiles]);

  useEffect(() => {
    const profile = profiles[selected];
    if (profile && !credStatus[credentialsKey(profile)]) validate(selected, profile);
  }, [selected, simplified]);

  useEffect(() => {
    if (!onValidChange) return;
    const allValid = profiles.every((p) => {
      if (!p.clientId?.trim() || !p.authSecret?.trim()) return true;
      return credStatus[credentialsKey(p)]?.status === "valid";
    });
    onValidChange(allValid);
  }, [credStatus, profiles, onValidChange]);

  function validate(index: number, profile: Profile) {
    clearTimeout(validateTimers.current[index]);
    const provider = detectProvider(profile.clientId ?? "");
    if (!provider || !profile.authSecret?.trim()) return;

    const key = credentialsKey(profile);
    validateTimers.current[index] = setTimeout(async () => {
      setCredStatus(prev => ({ ...prev, [key]: { status: "validating" } }));
      const result = await validateCredentials(profile.clientId, profile.authSecret, provider);
      setCredStatus(prev => ({
        ...prev,
        [key]: result.valid
          ? { status: "valid" }
          : { status: "invalid", message: result.error }
      }));
    }, 1000);
  }

  function update(index: number, field: "clientId" | "authSecret" | "provider" | "donorDns", value: string) {
    const next = profiles.map((p, i) =>
      i === index ? { ...p, [field]: value } : p
    ) as DnsConfConfig["profiles"];
    setValue("profiles", next, { shouldDirty: true, shouldValidate: true });

    if (field === "clientId" || field === "authSecret") validate(index, next[index]);
  }

  function remove(index: number) {
    const next = profiles.filter((_, i) => i !== index);
    setValue("profiles", next.length ? (next as DnsConfConfig["profiles"]) : [{ clientId: "", authSecret: "", provider: "", donorDns: DEFAULT_DNS_DONOR }], { shouldDirty: true, shouldValidate: true });
    // Remembered donors follow their profiles to the new positions.
    enabledDonors.current = Object.fromEntries(Object.entries(enabledDonors.current).flatMap(([key, donor]) => {
      const position = Number(key);
      return position === index ? [] : [[position > index ? position - 1 : position, donor]];
    }));
    if (selected >= next.length) {
      setSelected(Math.max(0, next.length - 1));
    }
  }

  function add() {
    setValue("profiles", [...profiles, { clientId: "", authSecret: "", provider: "", donorDns: DEFAULT_DNS_DONOR }] as DnsConfConfig["profiles"], { shouldDirty: true, shouldValidate: true });
    setSelected(profiles.length);
  }

  function toggleDonor(index: number, checked: boolean) {
    if (!checked) {
      if (profiles[index].donorDns) enabledDonors.current[index] = profiles[index].donorDns;
      update(index, "donorDns", "");
      return;
    }

    update(index, "donorDns", enabledDonors.current[index] ?? DEFAULT_DNS_DONOR);
  }

  const selectedStatus = profiles[selected] ? credStatus[credentialsKey(profiles[selected])] : undefined;

  return (
    <section className="space-y-4 rounded-lg border border-line bg-paper p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-ink">{t('profiles.title')}</span>
          <select
            className="rounded-md border border-line bg-white px-2 py-1 text-sm text-ink"
            value={selected}
            onChange={(e) => setSelected(Number(e.target.value))}
            aria-label={t('profiles.select')}
          >
            {profiles.map((_, i) => (
              <option key={i} value={i}>Profile {i + 1}</option>
            ))}
          </select>
        </div>
        {!retainCredentials ? (
          <button
            type="button"
            onClick={add}
            className="inline-flex items-center gap-0.5 text-xs text-steel transition hover:text-ink"
          >
            <Plus className="size-3.5" />
            {t('profiles.add')}
          </button>
        ) : null}
      </div>

      {profiles[selected] ? (
        <div className="space-y-3 rounded-md border border-line bg-white p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-sm font-medium text-ink/60">Profile {selected + 1}</div>
              {retainCredentials && profiles[selected].provider ? (
                <div className="mt-1 text-sm font-medium text-moss">
                  {t('profiles.dns', { provider: t(profiles[selected].provider === "cloudflare" ? 'profiles.providerCloudflare' : 'profiles.providerNextDNS') })}
                </div>
              ) : null}
            </div>
            {!retainCredentials ? (
              <button
                type="button"
                onClick={() => remove(selected)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line text-ink/40 transition hover:border-coral hover:text-coral"
                aria-label={t('profiles.remove')}
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>
          {retainCredentials ? (
            <p className="text-sm leading-6 text-ink/65">{t('profiles.credentialsRetained')}</p>
          ) : (
            <>
              <Field label={<span>{t('profiles.clientId')} <span className="text-coral">*</span></span>} error={translatedError(profileClientIdErrors?.find(e => e.index === selected)?.message, t)}>
                <input className={inputClass} autoComplete="off" value={profiles[selected].clientId} onChange={(e) => update(selected, "clientId", e.target.value)} />
              </Field>
              <Field label={<span>{t('profiles.authSecret')} <span className="text-coral">*</span></span>} error={translatedError(profileSecretErrors?.find(e => e.index === selected)?.message, t)}>
                <input className={inputClass} type="password" autoComplete="off" value={profiles[selected].authSecret} onChange={(e) => update(selected, "authSecret", e.target.value)} />
              </Field>
            </>
          )}
          {!retainCredentials && simplified && selectedStatus ? (
            <div className="flex items-start gap-2 text-sm">
              {selectedStatus.status === "validating" ? (
                <Loader2 className="mt-0.5 size-4 animate-spin text-moss shrink-0" aria-hidden="true" />
              ) : selectedStatus.status === "valid" ? (
                <CheckCircle2 className="mt-0.5 size-4 text-moss shrink-0" aria-hidden="true" />
              ) : (
                <X className="mt-0.5 size-4 text-coral shrink-0" aria-hidden="true" />
              )}
              <span className={
                selectedStatus.status === "invalid" ? "text-coral" : "text-moss"
              }>
                {selectedStatus.status === "validating" ? t('profiles.checking') :
                 selectedStatus.status === "valid" ? t('profiles.verified') :
                 selectedStatus.message ?? t('profiles.invalid')}
              </span>
            </div>
          ) : null}
          {!retainCredentials && profiles[selected].provider ? (
            <div>
              {simplified ? (
                <div className="text-sm font-medium text-moss">
                  {t('profiles.dns', { provider: t(profiles[selected].provider === "cloudflare" ? 'profiles.providerCloudflare' : 'profiles.providerNextDNS') })}
                </div>
              ) : (
                <>
                  <div className="text-sm text-moss">{t('profiles.dns', { provider: t(profiles[selected].provider === "cloudflare" ? 'profiles.providerCloudflare' : 'profiles.providerNextDNS') })}</div>
                  <ScriptBehaviour provider={profiles[selected].provider as "cloudflare" | "nextdns"} />
                </>
              )}
            </div>
          ) : null}
          {!retainCredentials && simplified && mixedProviderIndices?.has(selected) ? (
            <div className="mt-2 rounded-md border border-coral/30 bg-coral/10 px-3 py-2 text-sm text-coral">
              {t('wizard.mixedProvider')}
            </div>
          ) : null}
          {simplified ? (
            <ToggleSwitch
              checked={Boolean(profiles[selected].donorDns)}
              onChange={(checked) => toggleDonor(selected, checked)}
              label={t('profiles.donor')}
              tooltip={t('profiles.donorTooltip')}
              labelNowrap
            >
              {profiles[selected].donorDns ? (
                <DonorSelect
                  value={profiles[selected].donorDns}
                  onChange={(value) => update(selected, "donorDns", value)}
                  label={t('profiles.donor')}
                />
              ) : null}
            </ToggleSwitch>
          ) : (
            <Field
              label={(
                <span className="inline-flex items-center gap-1.5">
                  DONOR_DNS
                  <Tooltip text={t('profiles.donorTooltip')} />
                </span>
              )}
              error={profileDonorErrors?.find(e => e.index === selected) ? t('profiles.donorInvalid') : undefined}
            >
              <input
                className={inputClass}
                autoComplete="off"
                value={profiles[selected].donorDns}
                onChange={(e) => update(selected, "donorDns", e.target.value)}
                placeholder={t('profiles.donorPlaceholder')}
              />
            </Field>
          )}
        </div>
      ) : null}
      {!simplified ? (
        <p className="text-sm leading-6 text-ink/70">
          {t('profiles.hint')}
        </p>
      ) : null}
    </section>
  );
}
