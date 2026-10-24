import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const dohMocks = vi.hoisted(() => ({ resolveA: vi.fn(), traceCountry: vi.fn() }));

// The address filter stays real so the route test covers which IPs are contacted.
vi.mock("@/lib/dns/doh", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/dns/doh")>()), ...dohMocks }));

function checkRequest(body: unknown) {
  return new Request("http://localhost/api/donors/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("POST /api/donors/check", () => {
  beforeEach(() => {
    dohMocks.resolveA.mockReset();
    dohMocks.traceCountry.mockReset();
  });

  it.each(["http://dns.example/dns-query", "https://user:pass@dns.example/dns-query", "not a url", `https://dns.example/${"a".repeat(2048)}`])(
    "rejects %s",
    async (donor) => {
      const response = await POST(checkRequest({ donor }));

      expect(response.status).toBe(400);
      expect(dohMocks.resolveA).not.toHaveBeenCalled();
    }
  );

  it("checks a custom HTTPS DoH URL and never contacts internal addresses it returns", async () => {
    dohMocks.resolveA.mockResolvedValue(["10.0.0.5", "169.254.169.254", "203.0.113.9"]);
    dohMocks.traceCountry.mockResolvedValue({ country: "NL", ms: 70 });

    const response = await POST(checkRequest({ donor: "https://dns.example/dns-query" }));

    expect(await response.json()).toEqual({ dnsMs: expect.any(Number), chatgptMs: 70, country: "NL" });
    expect(dohMocks.traceCountry).toHaveBeenCalledTimes(1);
    expect(dohMocks.traceCountry).toHaveBeenCalledWith("203.0.113.9", "chatgpt.com", 5000);
  });

  it("passes with the exit country and timing of the first usable address", async () => {
    dohMocks.resolveA.mockResolvedValue(["1.1.1.1", "2.2.2.2"]);
    dohMocks.traceCountry.mockImplementation(async (ip: string) => (ip === "2.2.2.2" ? { country: "NL", ms: 42 } : null));

    const response = await POST(checkRequest({ donor: "https://dns.magicdns.ru/dns-query" }));

    expect(await response.json()).toEqual({ dnsMs: expect.any(Number), chatgptMs: 42, country: "NL" });
    expect(dohMocks.resolveA).toHaveBeenCalledWith("https://dns.magicdns.ru/dns-query", "chatgpt.com", 5000);
    expect(dohMocks.traceCountry).toHaveBeenCalledWith("2.2.2.2", "chatgpt.com", 5000);
  });

  it.each(["RU", "BY"])("fails when chatgpt.com sees the connection exit in %s", async (country) => {
    dohMocks.resolveA.mockResolvedValue(["1.1.1.1"]);
    dohMocks.traceCountry.mockResolvedValue({ country, ms: 30 });

    const response = await POST(checkRequest({ donor: "https://dns.dns-ai.ru/dns-query" }));

    expect(await response.json()).toEqual({ dnsMs: expect.any(Number), chatgptMs: null, country });
  });

  it("prefers an address that exits in an allowed country", async () => {
    dohMocks.resolveA.mockResolvedValue(["1.1.1.1", "2.2.2.2"]);
    dohMocks.traceCountry.mockImplementation(async (ip: string) => ({ country: ip === "1.1.1.1" ? "RU" : "DE", ms: 50 }));

    const response = await POST(checkRequest({ donor: "https://geohide.ru/dns-query" }));

    expect(await response.json()).toEqual({ dnsMs: expect.any(Number), chatgptMs: 50, country: "DE" });
  });

  it("fails the chatgpt.com check when no address answers", async () => {
    dohMocks.resolveA.mockResolvedValue(["1.1.1.1"]);
    dohMocks.traceCountry.mockResolvedValue(null);

    const response = await POST(checkRequest({ donor: "https://dns.zapret.moe/dns-query" }));

    expect(await response.json()).toEqual({ dnsMs: expect.any(Number), chatgptMs: null, country: null });
  });

  it("fails both checks when the donor does not resolve", async () => {
    dohMocks.resolveA.mockRejectedValue(new Error("timeout"));

    const response = await POST(checkRequest({ donor: "https://dns.dagami.ru/dns-query" }));

    expect(await response.json()).toEqual({ dnsMs: null, chatgptMs: null, country: null });
    expect(dohMocks.traceCountry).not.toHaveBeenCalled();
  });

  it("shares one check between concurrent requests but runs a fresh one afterwards", async () => {
    dohMocks.resolveA.mockResolvedValue([]);
    const donor = { donor: "https://dns.wlrus.cfd/dns-query" };

    await Promise.all([POST(checkRequest(donor)), POST(checkRequest(donor))]);
    expect(dohMocks.resolveA).toHaveBeenCalledTimes(1);

    await POST(checkRequest(donor));
    expect(dohMocks.resolveA).toHaveBeenCalledTimes(2);
  });

  // Runs last: the checks it leaves hanging stay in flight for the rest of this file.
  it("refuses new checks while too many are running", async () => {
    dohMocks.resolveA.mockReturnValue(new Promise(() => {}));
    for (let i = 0; i < 50; i++) void POST(checkRequest({ donor: `https://dns${i}.example/dns-query` }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const response = await POST(checkRequest({ donor: "https://one-more.example/dns-query" }));

    expect(response.status).toBe(429);
  });
});
