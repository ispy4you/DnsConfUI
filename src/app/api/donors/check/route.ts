import { NextResponse } from "next/server";
import { z } from "zod";
import { isDnsDonorPreset } from "@/domain/dns-donors";
import { isPublicAddress, resolveA, traceCountry } from "@/lib/dns/doh";

const CHECK_HOST = "chatgpt.com";
const TIMEOUT_MS = 5000;
const MAX_IN_FLIGHT = 50;
// ChatGPT is not available from these countries, so a donor exiting there does not help.
const BLOCKED_COUNTRIES = new Set(["RU", "BY"]);

// Presets, or any HTTPS DoH URL a user wants to try; resolveA refuses servers on non-public addresses.
function isCheckableDonor(value: string): boolean {
  if (isDnsDonorPreset(value)) return true;
  if (value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

const requestSchema = z.object({ donor: z.string().refine(isCheckableDonor) });

/** Elapsed milliseconds for each passed check (null when failed) and the exit country chatgpt.com saw. */
type CheckResult = { dnsMs: number | null; chatgptMs: number | null; country: string | null };

// Concurrent requests for a donor share one check, so repeated calls cannot multiply outbound connections.
const inFlight = new Map<string, Promise<CheckResult>>();

async function check(donor: string): Promise<CheckResult> {
  const started = Date.now();
  let addresses: string[];
  try {
    addresses = await resolveA(donor, CHECK_HOST, TIMEOUT_MS);
  } catch {
    return { dnsMs: null, chatgptMs: null, country: null };
  }
  const dnsMs = Date.now() - started;

  // A custom DoH server can answer with any address, so internal ones are never contacted.
  const traces = addresses.filter(isPublicAddress).slice(0, 4).map((ip) => traceCountry(ip, CHECK_HOST, TIMEOUT_MS));
  // Settle on the first usable address instead of waiting for dead ones to time out.
  const passed = await Promise.any(traces.map(async (trace) => {
    const result = await trace;
    if (!result || BLOCKED_COUNTRIES.has(result.country)) throw new Error("Unusable address.");
    return result;
  })).catch(() => null);
  if (passed) return { dnsMs, chatgptMs: passed.ms, country: passed.country };

  const blocked = (await Promise.all(traces)).find(Boolean);
  return { dnsMs, chatgptMs: null, country: blocked?.country ?? null };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Enter an HTTPS DoH URL." }, { status: 400 });
  }

  const { donor } = parsed.data;
  let result = inFlight.get(donor);
  if (!result) {
    if (inFlight.size >= MAX_IN_FLIGHT) {
      return NextResponse.json({ error: "Too many checks at once. Try again shortly." }, { status: 429 });
    }
    result = check(donor).finally(() => inFlight.delete(donor));
    inFlight.set(donor, result);
  }

  return NextResponse.json(await result);
}
