import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DNS_DONORS } from "@/domain/dns-donors";
import { LocaleProvider } from "@/lib/i18n/context";
import { DnsMonitor } from "./dns-monitor";

const checkDonor = vi.hoisted(() => vi.fn());

vi.mock("@/lib/dns/donor-check", () => ({ checkDonor }));

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
    checkDonor.mockResolvedValue({ dnsMs: 90, chatgptMs: 300, country: "NL" });
  });

  it("checks every donor and links each one to its site", async () => {
    renderMonitor();

    const row = (await screen.findAllByRole("row", { name: /chatgpt.com: открывается через NL, 300 мс/ }))[0];
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
});
