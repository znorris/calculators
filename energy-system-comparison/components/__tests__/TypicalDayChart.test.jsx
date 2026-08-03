import { describe, it, expect } from "vitest";
import { typicalDayTooltipRows } from "../TypicalDayChart.jsx";

describe("typicalDayTooltipRows", () => {
  it("keeps series order (Production, Load, Grid import, Grid export) rather than re-ranking by value", () => {
    const payload = [
      { dataKey: "production", name: "Production", value: 1.6, color: "#b45309" },
      { dataKey: "load", name: "Load", value: 0.8, color: "#0f172a" },
      { dataKey: "gridImport", name: "Grid import", value: 0, color: "#dc2626" },
      { dataKey: "gridExport", name: "Grid export", value: 0, color: "#0284c7" },
    ];
    expect(typicalDayTooltipRows(payload).map((r) => r.name)).toEqual([
      "Production",
      "Load",
      "Grid import",
      "Grid export",
    ]);
  });

  it("formats each row's value with a kWh unit", () => {
    const payload = [{ dataKey: "production", name: "Production", value: 3.5, color: "#b45309" }];
    expect(typicalDayTooltipRows(payload)[0].value).toBe("3.5 kWh");
  });

  it("colors a charging (non-negative) battery row with the charge color, overriding recharts' own series color", () => {
    const payload = [
      { dataKey: "batteryFlow", name: "Battery (+charge / -discharge)", value: 0.8, color: "#000000" },
    ];
    expect(typicalDayTooltipRows(payload)[0].color).toBe("#7c3aed");
  });

  it("colors a discharging (negative) battery row with the discharge color", () => {
    const payload = [
      { dataKey: "batteryFlow", name: "Battery (+charge / -discharge)", value: -1.2, color: "#000000" },
    ];
    expect(typicalDayTooltipRows(payload)[0].color).toBe("#047857");
  });

  it("leaves a non-battery row's color untouched", () => {
    const payload = [{ dataKey: "production", name: "Production", value: 1, color: "#b45309" }];
    expect(typicalDayTooltipRows(payload)[0].color).toBe("#b45309");
  });

  it("drops a null-value row instead of rendering it blank", () => {
    const payload = [
      { dataKey: "production", name: "Production", value: 1, color: "#b45309" },
      { dataKey: "load", name: "Load", value: null, color: "#0f172a" },
    ];
    expect(typicalDayTooltipRows(payload)).toHaveLength(1);
  });
});
