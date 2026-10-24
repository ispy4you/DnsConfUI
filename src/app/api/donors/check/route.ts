import { NextResponse } from "next/server";
import { z } from "zod";
import { isDnsDonorPreset } from "@/domain/dns-donors";
import { resolveA, traceCountry } from "@/lib/dns/doh";

const CHECK_HOST = "chatgpt.com";
const TIMEOUT_MS = 5000;
// ChatGPT is not available from these countries, so a donor exiting there does not help.
const BLOCKED_COUNTRIES = new Set(["RU", "BY"]);

// Only presets are accepted so the route cannot be used to probe arbitrary hosts.
const requestSchema = z.object({ donor: z.string().refine(isDnsDonorPreset) });

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

  const traces = addresses.slice(0, 4).map((ip) => traceCountry(ip, CHECK_HOST, TIMEOUT_MS));
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
    return NextResponse.json({ error: "Unknown DNS donor." }, { status: 400 });
  }

  const { donor } = parsed.data;
  let result = inFlight.get(donor);
  if (!result) {
    result = check(donor).finally(() => inFlight.delete(donor));
    inFlight.set(donor, result);
  }

  return NextResponse.json(await result);
}
