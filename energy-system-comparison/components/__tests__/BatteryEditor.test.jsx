import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BatteryEditor } from "../BatteryEditor.jsx";
import { batteryFromPreset, BATTERY_PRESETS } from "../../model/schema.js";

describe("BatteryEditor: dodFrac removed", () => {
  it("never renders a Depth of discharge control", () => {
    const battery = batteryFromPreset(BATTERY_PRESETS[0].id);
    const html = renderToStaticMarkup(<BatteryEditor battery={battery} onChange={() => {}} />);
    expect(html).not.toMatch(/Depth of discharge/);
  });
});

describe("BatteryEditor: battery-only constraint note", () => {
  const battery = batteryFromPreset(BATTERY_PRESETS[0].id);

  it("shows the no-generation note when hasGeneration is false", () => {
    const html = renderToStaticMarkup(<BatteryEditor battery={battery} hasGeneration={false} onChange={() => {}} />);
    expect(html).toMatch(/battery only charges from on-site solar or wind surplus/);
  });

  it("omits the note when the config has generation", () => {
    const html = renderToStaticMarkup(<BatteryEditor battery={battery} hasGeneration onChange={() => {}} />);
    expect(html).not.toMatch(/battery only charges from on-site solar or wind surplus/);
  });

  it("defaults hasGeneration to true (no note) when a caller doesn't pass it", () => {
    const html = renderToStaticMarkup(<BatteryEditor battery={battery} onChange={() => {}} />);
    expect(html).not.toMatch(/battery only charges from on-site solar or wind surplus/);
  });

  it("omits the no-generation note when grid charging is enabled instead", () => {
    // Grid charging still changes the bill without any solar/wind, so the
    // "does not change the bill" claim would be false here.
    const withGridCharge = { ...battery, gridCharge: { enabled: true, windowStartHour: 22, windowEndHour: 6, targetSocFrac: 1 } };
    const html = renderToStaticMarkup(<BatteryEditor battery={withGridCharge} hasGeneration={false} onChange={() => {}} />);
    expect(html).not.toMatch(/battery only charges from on-site solar or wind surplus/);
  });
});

describe("BatteryEditor: grid charging group", () => {
  const battery = batteryFromPreset(BATTERY_PRESETS[0].id);

  it("shows an enable toggle but no window/target controls when disabled", () => {
    const html = renderToStaticMarkup(<BatteryEditor battery={battery} onChange={() => {}} />);
    expect(html).toMatch(/Enable grid charging/);
    expect(html).not.toMatch(/Window start/);
    expect(html).not.toMatch(/Target state of charge/);
  });

  it("shows window start/end and target SoC controls once enabled", () => {
    const enabled = { ...battery, gridCharge: { enabled: true, windowStartHour: 22, windowEndHour: 6, targetSocFrac: 1 } };
    const html = renderToStaticMarkup(<BatteryEditor battery={enabled} onChange={() => {}} />);
    expect(html).toMatch(/Window start/);
    expect(html).toMatch(/Window end/);
    // "state of charge" renders as a Term (see glossary.js's "soc" entry), so
    // a tag can sit between "Target" and "state of charge" in the markup.
    expect(html).toMatch(/Target\s*(?:<[^>]+>)?state of charge/);
    expect(html).toMatch(/10:00 pm/); // hour 22 labeled with am/pm
    expect(html).toMatch(/6:00 am/); // hour 6 labeled with am/pm
  });

  it("states the retail-rate and round-trip-efficiency mechanism in the helper text", () => {
    const html = renderToStaticMarkup(<BatteryEditor battery={battery} onChange={() => {}} />);
    expect(html).toMatch(/retail rate/);
    expect(html).toMatch(/round-trip efficiency/);
  });
});
