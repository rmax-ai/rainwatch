import * as domain from "@rainwatch/domain";
import * as contract from "@rainwatch/forecast-contract";
import { describe, expect, it } from "vitest";

describe("workspace resolution smoke test", () => {
  it("resolves @rainwatch/domain", () => {
    expect(domain).toBeDefined();
  });

  it("resolves @rainwatch/forecast-contract", () => {
    expect(contract).toBeDefined();
  });
});
