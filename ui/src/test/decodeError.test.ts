import { describe, expect, it } from "vitest";
import { decodeContractError } from "../utils/decodeError";

describe("decodeContractError", () => {
  it("maps known custom error names in messages", () => {
    expect(decodeContractError({ message: "NotKycAllowed()" })).toMatch(/KYC/i);
    expect(decodeContractError({ message: "AlreadyClaimed()" })).toMatch(/already claimed/i);
  });

  it("handles pause revert strings", () => {
    expect(decodeContractError({ message: "Pausable: paused" })).toMatch(/paused/i);
  });
});
