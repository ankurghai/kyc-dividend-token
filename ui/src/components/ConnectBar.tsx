import { useEffect } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { LAST_CONNECTOR_KEY } from "../wagmi";
import { useKycPermission } from "../hooks/useKycPermission";

export function ConnectBar() {
  const { address, isConnected, chain } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { isPermitted, isLoading, error, refetch } = useKycPermission(address);

  useEffect(() => {
    const lastId = localStorage.getItem(LAST_CONNECTOR_KEY);
    if (lastId && !isConnected) {
      const connector = connectors.find((c) => c.id === lastId);
      if (connector) connect({ connector });
    }
  }, [connect, connectors, isConnected]);

  const onConnect = (connectorId: string) => {
    const connector = connectors.find((c) => c.id === connectorId);
    if (!connector) return;
    localStorage.setItem(LAST_CONNECTOR_KEY, connector.id);
    connect({ connector });
  };

  if (!isConnected) {
    return (
      <div className="card row">
        <span className="muted">Connect a wallet on Redbelly to begin.</span>
        <div>
          {connectors.map((c) => (
            <button
              key={c.id}
              onClick={() => onConnect(c.id)}
              disabled={isPending}
              style={{ marginLeft: 8 }}
            >
              {isPending ? "Connecting…" : c.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="card row">
      <div>
        <div>
          <strong>
            {address?.slice(0, 6)}…{address?.slice(-4)}
          </strong>{" "}
          <span className="muted">({chain?.name ?? "unknown network"})</span>
        </div>
        <div style={{ marginTop: 6 }}>
          KYC status:{" "}
          {isLoading ? (
            <span className="badge neutral">checking…</span>
          ) : error ? (
            <span className="badge warn" title={error.message}>
              check failed
            </span>
          ) : isPermitted ? (
            <span className="badge ok">verified (hasChainPermission)</span>
          ) : (
            <span className="badge warn">not verified</span>
          )}{" "}
          <button className="secondary" onClick={() => refetch()}>
            Refresh
          </button>
        </div>
      </div>
      <button className="secondary" onClick={() => disconnect()}>
        Disconnect
      </button>
    </div>
  );
}
