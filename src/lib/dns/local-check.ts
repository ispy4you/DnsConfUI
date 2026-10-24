/**
 * The browser cannot open chatgpt.com through a chosen IP, so the user runs a curl command that does it from their
 * own network and opens this page again with the results in the URL fragment (never sent to the server).
 */

/** A proxy IP to test, keyed by its index in DNS_DONORS or "c" for the custom DoH; a key may repeat for several IPs. */
export type LocalTarget = { key: string; ip: string };
/** The country chatgpt.com saw and the time it took, or null when chatgpt.com did not open. */
export type LocalResult = { country: string; ms: number } | null;

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const KEY = /^(\d{1,3}|c)$/;
const CURL_ARGS = "-s --connect-timeout 3 -m 5";

// encodeURIComponent leaves !'()* as is; "!" breaks interactive bash, so they are escaped too.
export function encodeForShell(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function entries(targets: LocalTarget[]): string[] {
  // Values end up inside a shell command, so only plain keys and IPv4 addresses get through.
  return targets.filter(({ key, ip }) => KEY.test(key) && IPV4.test(ip)).map(({ key, ip }) => `${key}:${ip}`);
}

/**
 * PowerShell 5.1 (Windows 10/11 ships curl.exe; plain "curl" there is Invoke-WebRequest). Every IP is tested at once
 * in its own curl process writing to a temporary folder, which is removed afterwards. `resultUrl` ends with "#" or "&".
 */
export function windowsCommand(targets: LocalTarget[], resultUrl: string): string {
  const list = entries(targets).map((entry) => `'${entry}'`).join(",");
  return `$d=Join-Path $env:TEMP ('dnsconf'+(Get-Random));$null=mkdir $d;$p=foreach($t in ${list}){$k,$ip=$t -split ':';Start-Process curl.exe "${CURL_ARGS} --ssl-no-revoke -w |%{time_total} --resolve chatgpt.com:443:$ip https://chatgpt.com/cdn-cgi/trace" -NoNewWindow -PassThru -RedirectStandardOutput "$d\\$k-$ip"};$p|Wait-Process;$r=foreach($f in Get-ChildItem $d){$k=$f.Name.Split('-')[0];$o=(Get-Content $f.FullName) -join ' ';if($o -match 'loc=([A-Z]{2}).*\\|([\\d.]+)'){"\${k}:$($Matches[1]):$($Matches[2])"}else{"\${k}:x"}};Remove-Item -Recurse $d;$u="${resultUrl}at=$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())&local=$($r -join ',')";$u;Start-Process $u`;
}

/** sh-compatible (bash and zsh) for macOS and Linux; each IP is tested in a background subshell. */
export function unixCommand(targets: LocalTarget[], resultUrl: string): string {
  const list = entries(targets).join(" ");
  return `r=$(for t in ${list};do (l=$(curl ${CURL_ARGS} -w '|%{time_total}' --resolve "chatgpt.com:443:\${t#*:}" https://chatgpt.com/cdn-cgi/trace|tr '\\n' ' '|sed -n 's/.*loc=\\([A-Z][A-Z]\\).*|\\([0-9.]*\\).*/\\1:\\2/p');printf '%s,' "\${t%%:*}:\${l:-x}")& done;wait);u="${resultUrl}at=$(date +%s)&local=\${r%,}";echo "$u";open "$u" 2>/dev/null||xdg-open "$u"`;
}

/**
 * Parses "key:CC:seconds" or "key:x" entries and keeps the best result per key: an allowed country (fastest first),
 * then a blocked one, then a failure. Anything malformed is ignored, since the fragment can come from any link.
 */
export function parseLocalResults(value: string, blocked: ReadonlySet<string>): Record<string, LocalResult> {
  const rank = (result: LocalResult) => (result === null ? 0 : blocked.has(result.country) ? 1 : 2);
  const isBetter = (next: LocalResult, current: LocalResult | undefined) => {
    if (current === undefined || rank(next) !== rank(current)) return current === undefined || rank(next) > rank(current);
    return next !== null && current !== null && next.ms < current.ms;
  };
  const results: Record<string, LocalResult> = {};
  for (const entry of value.split(",")) {
    const [key = "", country = "", seconds = ""] = entry.split(":");
    if (!KEY.test(key)) continue;
    let result: LocalResult;
    if (country === "x") result = null;
    else if (/^[A-Z]{2}$/.test(country) && /^\d+(\.\d+)?$/.test(seconds)) result = { country, ms: Math.round(Number(seconds) * 1000) };
    else continue;
    if (isBetter(result, results[key])) results[key] = result;
  }
  return results;
}
