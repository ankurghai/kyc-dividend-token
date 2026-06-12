import { useReadContracts } from "wagmi";
import { erc20Abi } from "../abi";
import { PAYMENT_TOKEN_ADDRESS, PAYMENT_TOKEN_DECIMALS, isConfigured } from "../config";

export function usePaymentToken() {
  const enabled = isConfigured(PAYMENT_TOKEN_ADDRESS);

  const { data, isLoading } = useReadContracts({
    contracts: [
      {
        address: PAYMENT_TOKEN_ADDRESS,
        abi: erc20Abi,
        functionName: "decimals",
      },
      {
        address: PAYMENT_TOKEN_ADDRESS,
        abi: erc20Abi,
        functionName: "symbol",
      },
    ],
    query: { enabled },
  });

  const decimals =
    data?.[0]?.status === "success"
      ? Number(data[0].result)
      : PAYMENT_TOKEN_DECIMALS;
  const symbol =
    data?.[1]?.status === "success" ? data[1].result : "TOKEN";

  return { decimals, symbol, isLoading };
}
