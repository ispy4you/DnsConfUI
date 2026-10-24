/** Elapsed milliseconds for each passed check (null when failed) and the exit country chatgpt.com saw. */
export type DonorCheck = { dnsMs: number | null; chatgptMs: number | null; country: string | null };

const FAILED: DonorCheck = { dnsMs: null, chatgptMs: null, country: null };

export function checkDonor(donor: string): Promise<DonorCheck> {
  return fetch("/api/donors/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ donor })
  })
    .then((res) => (res.ok ? (res.json() as Promise<DonorCheck>) : FAILED))
    .catch(() => FAILED);
}
