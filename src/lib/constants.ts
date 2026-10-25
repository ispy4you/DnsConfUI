export const CLOUDFLARE_CLIENT_ID_LENGTH = 32;
export const NEXTDNS_CLIENT_ID_LENGTH = 6;

/** The DNS provider a CLIENT_ID belongs to, told apart by its length. */
export function detectProvider(clientId: string): "cloudflare" | "nextdns" | null {
  if (clientId.length === CLOUDFLARE_CLIENT_ID_LENGTH) return "cloudflare";
  if (clientId.length === NEXTDNS_CLIENT_ID_LENGTH) return "nextdns";
  return null;
}
