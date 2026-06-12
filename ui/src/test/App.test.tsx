import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { keccak256, toBytes } from "viem";
import { DEFAULT_ADMIN_ROLE } from "../hooks/useIsAdmin";
import { OPERATOR_ROLE } from "../hooks/useIsOperator";
import { ErrorBoundary } from "../components/ErrorBoundary";

describe("role constants", () => {
  it("uses zero bytes32 for DEFAULT_ADMIN_ROLE", () => {
    expect(DEFAULT_ADMIN_ROLE).toBe(
      "0x0000000000000000000000000000000000000000000000000000000000000000"
    );
  });

  it("derives OPERATOR_ROLE from keccak256", () => {
    expect(OPERATOR_ROLE).toBe(keccak256(toBytes("OPERATOR_ROLE")));
  });
});

describe("ErrorBoundary", () => {
  it("renders children when no error occurs", () => {
    render(
      <ErrorBoundary>
        <p>healthy content</p>
      </ErrorBoundary>
    );
    expect(screen.getByText("healthy content")).toBeInTheDocument();
  });

  it("catches render errors and shows fallback instead of a blank page", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const Boom = () => {
      throw new Error("EligibilitySDKProvider config.network is required");
    };

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(
      screen.getByText(/EligibilitySDKProvider config.network is required/)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    spy.mockRestore();
  });
});
