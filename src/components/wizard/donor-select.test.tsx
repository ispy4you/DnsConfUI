import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DNS_DONORS } from "@/domain/dns-donors";
import { LocaleProvider } from "@/lib/i18n/context";
import { DonorSelect } from "./donor-select";

const checks = vi.hoisted(() => ({
  "https://geohide.ru/dns-query": { dnsMs: 120, chatgptMs: null, country: null },
  "https://eu.geohide.ru/dns-query": { dnsMs: 80, chatgptMs: 45, country: "DE" },
  "https://us.geohide.ru/dns-query": { dnsMs: null, chatgptMs: null, country: null },
  "https://dns.dns-ai.ru/dns-query": { dnsMs: 60, chatgptMs: null, country: "RU" }
} as Record<string, { dnsMs: number | null; chatgptMs: number | null; country: string | null }>));

const checkDonor = vi.hoisted(() => vi.fn());

vi.mock("@/lib/dns/donor-check", () => ({ checkDonor }));

function renderSelect(value: string = DNS_DONORS[0].value) {
  const onChange = vi.fn();
  render(
    <LocaleProvider>
      <DonorSelect value={value} onChange={onChange} label="DNS-донор" />
    </LocaleProvider>
  );
  return { onChange, combobox: screen.getByRole("combobox", { name: "DNS-донор" }) };
}

describe("DonorSelect", () => {
  beforeEach(() => {
    checkDonor.mockReset();
    checkDonor.mockImplementation((donor: string) => (checks[donor] ? Promise.resolve(checks[donor]) : new Promise(() => {})));
  });

  it("shows the result and timing of both checks for every preset", async () => {
    const { combobox } = renderSelect();
    fireEvent.click(combobox);

    expect(await screen.findByRole("option", { name: "GeoHide RU. DNS: отвечает, 120 мс. chatgpt.com: не открывается" }))
      .toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: "GeoHide EU. DNS: отвечает, 80 мс. chatgpt.com: открывается через DE, 45 мс" }))
      .toHaveTextContent("80 мсDE45 мс");
    expect(screen.getByRole("option", { name: "DNS-AI. DNS: отвечает, 60 мс. chatgpt.com: подключение через RU, ChatGPT там не работает" }))
      .toHaveTextContent("60 мсRU");
    expect(screen.getByRole("option", { name: "GeoHide US. DNS: не отвечает. chatgpt.com: не открывается" })).toBeVisible();
    expect(screen.getByRole("option", { name: "Comss. DNS: проверяется. chatgpt.com: проверяется" })).toBeVisible();
    expect(screen.getAllByRole("option")).toHaveLength(DNS_DONORS.length);
    expect(screen.getByRole("note")).toHaveAccessibleName("Проверка доступности донора и chatgpt.com");
  });

  it("runs the checks again every time the list opens", async () => {
    const { combobox } = renderSelect();
    expect(checkDonor).toHaveBeenCalledTimes(DNS_DONORS.length);

    fireEvent.click(combobox);
    fireEvent.click(combobox);
    fireEvent.click(combobox);

    expect(checkDonor).toHaveBeenCalledTimes(DNS_DONORS.length * 3);
  });

  it("selects with the keyboard and closes on Escape", () => {
    const { combobox, onChange } = renderSelect();

    fireEvent.keyDown(combobox, { key: "ArrowDown" });
    expect(combobox).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(combobox, { key: "ArrowDown" });
    fireEvent.keyDown(combobox, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith(DNS_DONORS[1].value);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    fireEvent.keyDown(combobox, { key: "Enter" });
    fireEvent.keyDown(combobox, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("lists a custom donor first without checking it", () => {
    const { combobox } = renderSelect("https://custom.test/dns-query");
    fireEvent.click(combobox);

    expect(screen.getAllByRole("option")[0]).toHaveAccessibleName("Свой адрес: https://custom.test/dns-query");
    expect(screen.getAllByRole("option")).toHaveLength(DNS_DONORS.length + 1);
  });

  it("closes when clicking outside", () => {
    const { combobox } = renderSelect();
    fireEvent.click(combobox);

    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
