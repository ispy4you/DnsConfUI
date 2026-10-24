export const DNS_DONORS = [
  { label: "GeoHide RU", value: "https://geohide.ru/dns-query" },
  { label: "GeoHide EU", value: "https://eu.geohide.ru/dns-query" },
  { label: "GeoHide US", value: "https://us.geohide.ru/dns-query" },
  { label: "Comss", value: "https://dns.comss.one/dns-query" },
  { label: "MagicDNS", value: "https://dns.magicdns.ru/dns-query" },
  { label: "Bezmezhau", value: "https://dns.bezmezhau.com/dns-query" },
  { label: "WLRUS", value: "https://dns.wlrus.cfd/dns-query" },
  { label: "Malw", value: "https://dns.malw.link/dns-query" },
  { label: "Dagami", value: "https://dns.dagami.ru/dns-query" },
  { label: "DNS-AI", value: "https://dns.dns-ai.ru/dns-query" },
  { label: "Zapret", value: "https://dns.zapret.moe/dns-query" }
] as const;

export const DEFAULT_DNS_DONOR = DNS_DONORS[0].value;
export const DISABLED_DNS_DONOR = "-";

export function isDnsDonorPreset(value: string): boolean {
  return DNS_DONORS.some((donor) => donor.value === value);
}

export function getDnsDonorLabel(value: string): string | undefined {
  return DNS_DONORS.find((donor) => donor.value === value)?.label;
}
