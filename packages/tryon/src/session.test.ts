import { describe, expect, it } from "vitest";
import { assertTransition, canTransition, isTerminal } from "./session";

describe("TryOnSession lifecycle", () => {
  it("allows the happy path", () => {
    expect(canTransition("CREATED", "UPLOADING")).toBe(true);
    expect(canTransition("UPLOADING", "PROCESSING")).toBe(true);
    expect(canTransition("PROCESSING", "COMPLETED")).toBe(true);
  });

  it("allows failure from UPLOADING and PROCESSING", () => {
    expect(canTransition("UPLOADING", "FAILED")).toBe(true);
    expect(canTransition("PROCESSING", "FAILED")).toBe(true);
  });

  it("allows expiry from any non-terminal state", () => {
    expect(canTransition("CREATED", "EXPIRED")).toBe(true);
    expect(canTransition("UPLOADING", "EXPIRED")).toBe(true);
    expect(canTransition("PROCESSING", "EXPIRED")).toBe(true);
  });

  it("rejects skipping states", () => {
    expect(canTransition("CREATED", "PROCESSING")).toBe(false);
    expect(canTransition("CREATED", "COMPLETED")).toBe(false);
  });

  it("rejects any transition out of a terminal state", () => {
    for (const terminal of ["COMPLETED", "FAILED", "EXPIRED"] as const) {
      expect(isTerminal(terminal)).toBe(true);
      expect(canTransition(terminal, "PROCESSING")).toBe(false);
    }
  });

  it("assertTransition throws on illegal transitions", () => {
    expect(() => assertTransition("COMPLETED", "PROCESSING")).toThrow();
    expect(() => assertTransition("CREATED", "UPLOADING")).not.toThrow();
  });
});
