import { describe, expect, it } from "vitest";
import { encodeAQuery, parseARecords, parseTraceCountry } from "./doh";

function answer(type: number, data: number[]) {
  // Name as a compression pointer to the question at offset 12, class IN, TTL 60.
  return [0xc0, 12, 0, type, 0, 1, 0, 0, 0, 60, 0, data.length, ...data];
}

function response(answers: number[][], rcode = 0) {
  const question = [...encodeAQuery("chatgpt.com").subarray(12)];
  return Buffer.from([0, 0, 0x81, 0x80 | rcode, 0, 1, 0, answers.length, 0, 0, 0, 0, ...question, ...answers.flat()]);
}

describe("encodeAQuery", () => {
  it("encodes the name as length-prefixed labels with an A/IN question", () => {
    expect([...encodeAQuery("chatgpt.com").subarray(12)]).toEqual([
      7, ...Buffer.from("chatgpt"), 3, ...Buffer.from("com"), 0, 0, 1, 0, 1
    ]);
  });
});

describe("parseARecords", () => {
  it("returns IPv4 addresses and skips other record types", () => {
    const cname = answer(5, [0xc0, 12]);
    expect(parseARecords(response([cname, answer(1, [1, 2, 3, 4]), answer(1, [5, 6, 7, 8])])))
      .toEqual(["1.2.3.4", "5.6.7.8"]);
  });

  it("returns no addresses for an empty answer", () => {
    expect(parseARecords(response([]))).toEqual([]);
  });

  it("rejects DNS error codes", () => {
    expect(() => parseARecords(response([], 3))).toThrow("DNS error code 3");
  });

  it("rejects truncated and non-DNS payloads instead of looping", () => {
    const full = response([answer(1, [1, 2, 3, 4])]);
    expect(() => parseARecords(full.subarray(0, full.length - 2))).toThrow("Truncated");
    expect(() => parseARecords(Buffer.from("<html><body>505</body></html>"))).toThrow();
    expect(() => parseARecords(Buffer.alloc(4))).toThrow("too short");
  });
});

describe("parseTraceCountry", () => {
  const trace = (status: string, body: string) => `HTTP/1.1 ${status}\r\nContent-Type: text/plain\r\n\r\n${body}`;

  it("returns the visitor country from a successful trace", () => {
    expect(parseTraceCountry(trace("200 OK", "fl=1\nip=203.0.113.7\nloc=NL\ntls=TLSv1.3\n"))).toBe("NL");
  });

  it("ignores failed responses and bodies without a country", () => {
    expect(parseTraceCountry(trace("403 Forbidden", "loc=NL\n"))).toBeNull();
    expect(parseTraceCountry(trace("200 OK", "fl=1\nip=203.0.113.7\n"))).toBeNull();
    expect(parseTraceCountry("")).toBeNull();
  });
});
