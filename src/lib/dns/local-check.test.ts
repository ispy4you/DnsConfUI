import { describe, expect, it } from "vitest";
import { encodeForShell, parseLocalResults, unixCommand, windowsCommand } from "./local-check";

const targets = [{ key: "0", ip: "83.217.211.149" }, { key: "0", ip: "193.233.112.68" }, { key: "c", ip: "104.18.32.47" }];
const url = "https://dnsconf.example/#";
const blocked = new Set(["RU", "BY"]);

describe("commands", () => {
  it("test every IP at once through curl --resolve and open the page with the results and time", () => {
    const windows = windowsCommand(targets, url);
    expect(windows).toContain("'0:83.217.211.149','0:193.233.112.68','c:104.18.32.47'");
    expect(windows).toContain('Start-Process curl.exe "-s --connect-timeout 3 -m 5 --ssl-no-revoke -w |%{time_total} --resolve chatgpt.com:443:$ip');
    expect(windows).toContain("$p|Wait-Process;");
    expect(windows).toContain("Remove-Item -Recurse $d;");
    expect(windows).toContain(`$u="${url}at=$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())&local=$($r -join ',')"`);
    expect(windows).toMatch(/Start-Process \$u$/);

    const unix = unixCommand(targets, url);
    expect(unix).toContain("for t in 0:83.217.211.149 0:193.233.112.68 c:104.18.32.47;");
    expect(unix).toContain('curl -s --connect-timeout 3 -m 5 -w \'|%{time_total}\' --resolve "chatgpt.com:443:${t#*:}"');
    expect(unix).toContain(")& done;wait);");
    expect(unix).toContain(`u="${url}at=$(date +%s)&local=\${r%,}"`);
  });

  it("drops anything that is not a plain key and IPv4 address", () => {
    const hostile = [{ key: "0", ip: "1.2.3.4;rm -rf ~" }, { key: "$(id)", ip: "1.2.3.4" }, { key: "1", ip: "5.6.7.8" }];

    for (const command of [windowsCommand(hostile, url), unixCommand(hostile, url)]) {
      expect(command).not.toContain("rm -rf");
      expect(command).not.toContain("$(id)");
      expect(command).toContain("1:5.6.7.8");
    }
  });

  it("escapes characters that interactive shells would expand", () => {
    expect(encodeForShell("https://x.example/q?a=(1)!*'")).toBe("https%3A%2F%2Fx.example%2Fq%3Fa%3D%281%29%21%2A%27");
  });
});

describe("parseLocalResults", () => {
  it("reads countries with times in ms and failures", () => {
    expect(parseLocalResults("0:NL:0.441923,1:x,c:UZ:0.4", blocked)).toEqual({
      0: { country: "NL", ms: 442 },
      1: null,
      c: { country: "UZ", ms: 400 }
    });
  });

  it("keeps the best result among a donor's IPs", () => {
    expect(parseLocalResults("0:x,0:RU:0.1,0:DE:0.5,0:NL:0.3,1:x,1:BY:0.2,2:x,2:x", blocked)).toEqual({
      0: { country: "NL", ms: 300 },
      1: { country: "BY", ms: 200 },
      2: null
    });
  });

  it("ignores malformed entries from a crafted link", () => {
    expect(parseLocalResults("<b>:NL:1,0:nl:1,1:NL:abc,2:NLX:1,,3", blocked)).toEqual({});
  });
});
