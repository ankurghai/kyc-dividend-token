import { useAccount, useSwitchChain } from "wagmi";
import { redbellyMainnet, redbellyTestnet } from "../wagmi";
import { EXPECTED_CHAIN_ID } from "../config";

export function WrongNetworkBanner() {
  const { chain, isConnected } = useAccount();
  const { switchChain, isPending } = useSwitchChain();

  if (!isConnected || chain?.id === EXPECTED_CHAIN_ID) return null;

  const target =
    EXPECTED_CHAIN_ID === redbellyMainnet.id ? redbellyMainnet : redbellyTestnet;

  return (
    <div className="card row" style={{ borderColor: "#c0392b" }}>
      <span className="error">
        Wrong network: connected to {chain?.name ?? "unknown"}. Switch to {target.name}.
      </span>
      <button
        onClick={() => switchChain({ chainId: target.id })}
        disabled={isPending}
      >
        {isPending ? "Switching…" : `Switch to ${target.name}`}
      </button>
    </div>
  );
}
