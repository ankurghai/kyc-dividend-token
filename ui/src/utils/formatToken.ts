import { formatUnits, parseUnits } from "viem";

export function formatTokenAmount(
  value: bigint,
  decimals: number,
  symbol?: string
): string {
  const formatted = formatUnits(value, decimals);
  return symbol ? `${formatted} ${symbol}` : formatted;
}

export function parseTokenAmount(value: string, decimals: number): bigint {
  return parseUnits(value || "0", decimals);
}
