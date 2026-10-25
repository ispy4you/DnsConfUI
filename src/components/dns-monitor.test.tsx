import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DNS_DONORS } from "@/domain/dns-donors";
import { LocaleProvider } from "@/lib/i18n/context";
import { DnsMonitor } from "./dns-monitor";

const checkDonor = vi.hoisted(() => vi.fn());
const visitorCountry = vi.hoisted(() => vi.fn());

vi.mock("@/lib/dns/donor-check", () => ({ checkDonor, visitorCountry }));

function renderMonitor() {
  render(
    <LocaleProvider>
      <DnsMonitor />
    </LocaleProvider>
  );
}

describe("DnsMonitor", () => {
  beforeEach(() => {
    checkDonor.mockReset();
    checkDonor.mockResolvedValue({ dnsMs: 90, chatgptMs: 300, country: "NL", direct: false, ips: ["203.0.113.10", "203.0.113.11"] });
    visitorCountry.mockReset();
    visitorCountry.mockResolvedValue("UZ");
    window.location.hash = "";
  });

  it("offers a command that tests every checked proxy IP from the user's computer", async () => {
    renderMonitor();
    await screen.findAllByText("DNS: отвечает, 90 мс");

    fireEvent.click(screen.getByText("Проверить с вашего компьютера"));
    fireEvent.click(screen.getByRole("button", { name: "macOS и Linux" }));

    const command = (await screen.findByText(/--resolve/)).textContent ?? "";
    expect(command).toContain(`for t in ${DNS_DONORS.map((_, index) => `${index}:203.0.113.10 ${index}:203.0.113.11`).join(" ")};`);
    expect(command).toContain(`u="${window.location.origin}/#at=$(date +%s)&local=\${r%,}"`);
    fireEvent.click(screen.getByRole("button", { name: "Windows" }));
    expect(screen.getByText(/curl\.exe/)).toBeInTheDocument();
  });

  it("shows the results the command brought back in the URL fragment", async () => {
    window.location.hash = `#at=${Math.floor(Date.now() / 1000) - 300}&local=0:DE:0.4,1:RU:0.5,2:x`;
    renderMonitor();

    expect(await screen.findByRole("columnheader", { name: /У вас/ })).toBeInTheDocument();
    expect(screen.getByText("У вас: открывается через DE, 400 мс")).toBeInTheDocument();
    expect(screen.getByText("У вас: подключение через RU, ChatGPT там не работает")).toBeInTheDocument();
    expect(screen.getByText("У вас: не открывается")).toBeInTheDocument();
    expect(screen.getAllByText("У вас: не проверялось")).toHaveLength(DNS_DONORS.length - 3);
    expect(screen.getByRole("columnheader", { name: /У вас.*5 мин\. назад/ })).toBeInTheDocument();
  });

  it("marks a DNS that gave no address as failed in the local column", async () => {
    checkDonor.mockImplementation(async (donor: string) => (donor === DNS_DONORS[1].value
      ? { dnsMs: null, chatgptMs: null, country: null, direct: false, ips: [] }
      : { dnsMs: 90, chatgptMs: 300, country: "NL", direct: false, ips: ["203.0.113.10"] }));
    window.location.hash = "#local=0:DE:0.4";
    renderMonitor();

    const row = await screen.findByRole("row", { name: new RegExp(DNS_DONORS[1].label) });
    expect(await within(row).findByText("У вас: не проверялось — DNS не ответил")).toBeInTheDocument();
  });

  it("reads results from a link pasted into a tab that already shows the page", async () => {
    renderMonitor();
    expect(screen.queryByRole("columnheader", { name: /У вас/ })).not.toBeInTheDocument();

    window.location.hash = "#local=0:NL:0.2";
    window.dispatchEvent(new HashChangeEvent("hashchange"));

    expect(await screen.findByText("У вас: открывается через NL, 200 мс")).toBeInTheDocument();
  });

  it("restores the custom DoH that the command tested", async () => {
    window.location.hash = `#doh=${encodeURIComponent("https://dns.example/dns-query")}&local=c:NL:0.3`;
    renderMonitor();

    expect(checkDonor).toHaveBeenCalledWith("https://dns.example/dns-query");
    const row = await screen.findByRole("row", { name: /dns\.example/ });
    expect(within(row).getByText("У вас: открывается через NL, 300 мс")).toBeInTheDocument();
  });

  it.each([
    ["UZ", "ChatGPT: без прокси, напрямую из UZ, 60 мс"],
    ["RU", "ChatGPT: без прокси, а из RU он не работает"]
  ])("shows the visitor's own country %s for a DNS without a proxy", async (country, text) => {
    visitorCountry.mockResolvedValue(country);
    checkDonor.mockImplementation(async (donor: string) => (donor === DNS_DONORS[0].value
      ? { dnsMs: 50, chatgptMs: 60, country: null, direct: true }
      : { dnsMs: 90, chatgptMs: 300, country: "NL", direct: false }));
    renderMonitor();

    const row = await screen.findByRole("row", { name: new RegExp(DNS_DONORS[0].label) });
    expect(await within(row).findByText(text)).toBeInTheDocument();
  });

  it("checks every donor and links each one to its site", async () => {
    renderMonitor();

    const row = (await screen.findAllByRole("row", { name: /ChatGPT: открывается через NL, 300 мс/ }))[0];
    expect(within(row).getByRole("link", { name: "GeoHide RU" })).toHaveAttribute("href", "https://geohide.ru");
    expect(within(row).getByText("DNS: отвечает, 90 мс")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(DNS_DONORS.length + 1);
    expect(screen.getByRole("link", { name: "Zapret" })).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: "Comss" })).toHaveAttribute("href", "https://www.comss.ru/page.php?id=7315");
  });

  it("checks again on request and blocks the button while checking", async () => {
    renderMonitor();
    const button = screen.getByRole("button", { name: "Проверить снова" });
    expect(button).toBeDisabled();

    await screen.findAllByText("DNS: отвечает, 90 мс");
    expect(button).toBeEnabled();
    fireEvent.click(button);

    expect(checkDonor).toHaveBeenCalledTimes(DNS_DONORS.length * 2);
  });

  it("explains an address that is not an HTTPS URL", () => {
    renderMonitor();
    const input = screen.getByRole("textbox", { name: "Проверить свой DoH" });

    fireEvent.change(input, { target: { value: "http://dns.example/dns-query" } });
    fireEvent.click(screen.getByRole("button", { name: "Проверить" }));

    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Введите адрес DoH вида https://example.com/dns-query");
    expect(checkDonor).toHaveBeenCalledTimes(DNS_DONORS.length);
  });

  it("checks a custom DoH, rechecks it with the presets and removes it", async () => {
    const custom = "https://dns.example/dns-query";
    renderMonitor();

    fireEvent.change(screen.getByRole("textbox", { name: "Проверить свой DoH" }), { target: { value: ` ${custom} ` } });
    fireEvent.click(screen.getByRole("button", { name: "Проверить" }));

    expect(checkDonor).toHaveBeenLastCalledWith(custom);
    const row = await screen.findByRole("row", { name: /dns\.example/ });
    expect(within(row).getByText("ChatGPT: открывается через NL, 300 мс")).toBeInTheDocument();

    await screen.findAllByText("DNS: отвечает, 90 мс");
    fireEvent.click(screen.getByRole("button", { name: "Проверить снова" }));
    expect(checkDonor).toHaveBeenCalledTimes(DNS_DONORS.length * 2 + 2);

    fireEvent.click(within(row).getByRole("button", { name: "Убрать свой DoH" }));
    expect(screen.queryByRole("row", { name: /dns\.example/ })).not.toBeInTheDocument();
  });

  it("treats an address without a scheme as HTTPS", () => {
    renderMonitor();

    fireEvent.change(screen.getByRole("textbox", { name: "Проверить свой DoH" }), { target: { value: "dns.example/dns-query" } });
    fireEvent.click(screen.getByRole("button", { name: "Проверить" }));

    expect(checkDonor).toHaveBeenLastCalledWith("https://dns.example/dns-query");
  });

  it("rechecks a preset in place instead of adding it twice", async () => {
    renderMonitor();
    // A preset that is still being checked is not checked again, so the first round has to finish.
    await screen.findAllByText("DNS: отвечает, 90 мс");
    checkDonor.mockClear();

    fireEvent.change(screen.getByRole("textbox", { name: "Проверить свой DoH" }), { target: { value: DNS_DONORS[0].value } });
    fireEvent.click(screen.getByRole("button", { name: "Проверить" }));

    expect(screen.getAllByRole("row")).toHaveLength(DNS_DONORS.length + 1);
    expect(checkDonor).toHaveBeenCalledTimes(1);
    expect(checkDonor).toHaveBeenLastCalledWith(DNS_DONORS[0].value);
  });
});
