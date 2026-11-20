import { describe, expect, it } from "vitest";
import { parseChannel } from "./channel";

describe("parseChannel", () => {
  it("recognises the released channels", () => {
    expect(parseChannel("production")).toBe("production");
    expect(parseChannel("staging")).toBe("staging");
    expect(parseChannel("dev")).toBe("dev");
  });

  it("never treats an unknown or missing value as production", () => {
    for (const v of [undefined, null, "", "prod", "Production", 1, {}]) {
      expect(parseChannel(v)).toBe("dev");
    }
  });
});
