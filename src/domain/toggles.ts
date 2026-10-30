export const GEOHIDE_HOSTS_LIST =
  "https://raw.githubusercontent.com/Internet-Helper/GeoHideDNS/refs/heads/main/hosts/hosts";

export const MALW_HOSTS_LIST =
  "https://raw.githubusercontent.com/ImMALWARE/dns.malw.link/refs/heads/master/hosts";

export const OISD_SMALL_BLOCK_LIST =
  "https://raw.githubusercontent.com/sjhgvr/oisd/refs/heads/main/domainswild2_small.txt";

/**
 * The same domains in "*.domain" form, which Cloudflare refuses item by item. Quick mode used to add it next to the
 * plain list, so it is still recognised to take it out of a setup made back then.
 */
export const OISD_SMALL_BLOCK_LIST_WILDCARDS =
  "https://raw.githubusercontent.com/sjhgvr/oisd/refs/heads/main/domainswild_small.txt";

export const ADS_BLOCKLIST_IDS = [
  "nextdns-recommended",
  "oisd",
  "adguard-russian-filter",
  "adguard-dns-filter"
];

export const NATIVE_TRACKING_IDS = [
  "apple",
  "windows",
  "samsung",
  "huawei",
  "xiaomi",
  "roku",
  "alexa",
  "sonos"
];
