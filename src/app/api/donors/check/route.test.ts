import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const dohMocks = vi.hoisted(() => ({ resolveA: vi.fn(), traceCountry: vi.fn() }));

vi.mock("@/lib/dns/doh", () => dohMocks);

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

  it("rejects donors that are not presets", async () => {
    const response = await POST(checkRequest({ donor: "https://169.254.169.254/dns-query" }));

    expect(response.status).toBe(400);
    expect(dohMocks.resolveA).not.toHaveBeenCalled();
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
});
