import http2 from "node:http2";
import tls from "node:tls";

const TYPE_A = 1;
const MAX_RESPONSE_BYTES = 64 * 1024;

export function encodeAQuery(name: string): Buffer {
  const labels = name.split(".").flatMap((label) => [label.length, ...Buffer.from(label)]);
  // ID 0 is recommended for DoH (RFC 8484), RD flag set, one question.
  return Buffer.from([0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, ...labels, 0, 0, TYPE_A, 0, 1]);
}

function skipName(packet: Buffer, offset: number): number {
  while (offset < packet.length) {
    const length = packet[offset];
    if (length === 0) return offset + 1;
    if ((length & 0xc0) === 0xc0) return offset + 2;
    offset += length + 1;
  }
  throw new Error("Truncated DNS name.");
}

/** Returns IPv4 addresses from the answer section; throws on malformed or error responses. */
export function parseARecords(packet: Buffer): string[] {
  if (packet.length < 12) throw new Error("DNS response is too short.");
  if ((packet[3] & 0x0f) !== 0) throw new Error(`DNS error code ${packet[3] & 0x0f}.`);

  const questions = packet.readUInt16BE(4);
  const answers = packet.readUInt16BE(6);
  let offset = 12;
  for (let i = 0; i < questions; i++) offset = skipName(packet, offset) + 4;

  const addresses: string[] = [];
  for (let i = 0; i < answers; i++) {
    offset = skipName(packet, offset);
    if (offset + 10 > packet.length) throw new Error("Truncated DNS record.");
    const type = packet.readUInt16BE(offset);
    const dataLength = packet.readUInt16BE(offset + 8);
    const dataStart = offset + 10;
    if (dataStart + dataLength > packet.length) throw new Error("Truncated DNS record.");
    if (type === TYPE_A && dataLength === 4) addresses.push([...packet.subarray(dataStart, dataStart + 4)].join("."));
    offset = dataStart + dataLength;
  }
  return addresses;
}

// Some donors only accept DoH over HTTP/2 and answer HTTP/1.1 with 505, so fetch() is not enough.
export function resolveA(dohUrl: string, name: string, timeoutMs: number): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const url = new URL(dohUrl);
    const session = http2.connect(url.origin);
    const fail = (error: Error) => {
      clearTimeout(timer);
      session.destroy();
      reject(error);
    };
    const timer = setTimeout(() => fail(new Error("DoH request timed out.")), timeoutMs);
    session.on("error", fail);

    const request = session.request({
      ":path": `${url.pathname}?dns=${encodeAQuery(name).toString("base64url")}`,
      accept: "application/dns-message"
    });
    const chunks: Buffer[] = [];
    let size = 0;
    let status = 0;
    request.on("response", (headers) => { status = Number(headers[":status"]); });
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_RESPONSE_BYTES) fail(new Error("DoH response is too large."));
      else chunks.push(chunk);
    });
    request.on("error", fail);
    request.on("end", () => {
      clearTimeout(timer);
      session.close();
      if (status !== 200) return reject(new Error(`DoH responded with ${status}.`));
      try {
        resolve(parseARecords(Buffer.concat(chunks)));
      } catch (error) {
        reject(error);
      }
    });
  });
}

/** Extracts the visitor country from a raw Cloudflare /cdn-cgi/trace HTTP response. */
export function parseTraceCountry(response: string): string | null {
  if (!/^HTTP\/1\.[01] 200 /.test(response)) return null;
  return /^loc=([A-Z]{2})\r?$/m.exec(response)?.[1] ?? null;
}

/**
 * Requests https://{host}/cdn-cgi/trace from `ip` (valid certificate required) and returns the country
 * Cloudflare sees the connection coming from, which is the proxy exit when the donor proxies the host.
 */
export function traceCountry(ip: string, host: string, timeoutMs: number): Promise<{ country: string; ms: number } | null> {
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = tls.connect({ host: ip, port: 443, servername: host, ALPNProtocols: ["http/1.1"] });
    // The socket idle timeout does not always fire while connecting, so a hard deadline is used.
    const timer = setTimeout(() => finish(null), timeoutMs);
    let response = "";
    function finish(result: { country: string; ms: number } | null) {
      clearTimeout(timer);
      socket.destroy();
      resolve(result);
    }
    socket.setEncoding("utf8");
    socket.once("secureConnect", () => {
      socket.write(`GET /cdn-cgi/trace HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`);
    });
    socket.on("data", (chunk: string) => {
      response += chunk;
      if (response.length > MAX_RESPONSE_BYTES) finish(null);
    });
    socket.once("end", () => {
      const country = parseTraceCountry(response);
      finish(country ? { country, ms: Date.now() - started } : null);
    });
    socket.once("error", () => finish(null));
  });
}
