import { useMemo, useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { ConnectBar } from "./components/ConnectBar";
import { EpochCard } from "./components/EpochCard";
import { OperatorPanel } from "./components/OperatorPanel";
import { AdminPanel } from "./components/AdminPanel";
import { WrongNetworkBanner } from "./components/WrongNetworkBanner";
import { distributorAbi } from "./abi";
import { APP_NAME, DISTRIBUTOR_ADDRESS, EPOCHS_PER_PAGE, isConfigured } from "./config";
import { useIsOperator } from "./hooks/useIsOperator";
import { useIsAdmin } from "./hooks/useIsAdmin";

export default function App() {
  const { isConnected, address } = useAccount();
  const { isOperator } = useIsOperator(address);
  const { isAdmin } = useIsAdmin(address);
  const [showOperator, setShowOperator] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [page, setPage] = useState(0);

  const { data: epochCount } = useReadContract({
    address: DISTRIBUTOR_ADDRESS,
    abi: distributorAbi,
    functionName: "epochCount",
    query: { enabled: isConfigured(DISTRIBUTOR_ADDRESS) },
  });

  const epochIds = useMemo(() => {
    if (!epochCount) return [];
    return Array.from({ length: Number(epochCount) }, (_, i) => BigInt(i)).reverse();
  }, [epochCount]);

  const totalPages = Math.max(1, Math.ceil(epochIds.length / EPOCHS_PER_PAGE));
  const pageEpochs = epochIds.slice(page * EPOCHS_PER_PAGE, (page + 1) * EPOCHS_PER_PAGE);

  return (
    <div className="container">
      <h1>{APP_NAME}</h1>
      <p className="muted">
        Dividends for snapshot holders on Redbelly. Eligibility is verified on-chain at payment
        time; this UI pre-checks your status with the Redbelly eligibility SDK before sending
        transactions.
      </p>

      <WrongNetworkBanner />
      <ConnectBar />

      {!isConfigured(DISTRIBUTOR_ADDRESS) ? (
        <div className="card">
          <span className="error">
            Distributor address not configured. Run <code>npm run deploy:testnet</code> then{" "}
            <code>npm run gen:ui-env</code>, or set VITE_DISTRIBUTOR_ADDRESS in ui/.env.
          </span>
        </div>
      ) : !isConnected ? null : (
        <>
          <div className="row" style={{ margin: "1rem 0" }}>
            <h2 style={{ margin: 0 }}>Distribution epochs</h2>
            <div>
              {isOperator ? (
                <button className="secondary" onClick={() => setShowOperator((s) => !s)}>
                  {showOperator ? "Hide operator panel" : "Operator panel"}
                </button>
              ) : null}{" "}
              {isAdmin ? (
                <button className="secondary" onClick={() => setShowAdmin((s) => !s)}>
                  {showAdmin ? "Hide admin panel" : "Admin panel"}
                </button>
              ) : null}
            </div>
          </div>

          {isOperator && showOperator ? <OperatorPanel /> : null}
          {isAdmin && showAdmin ? <AdminPanel /> : null}

          {epochIds.length === 0 ? (
            <div className="card muted">No epochs yet.</div>
          ) : (
            <>
              {pageEpochs.map((id) => (
                <EpochCard key={id.toString()} epochId={id} />
              ))}
              {epochIds.length > EPOCHS_PER_PAGE ? (
                <div className="row">
                  <button
                    className="secondary"
                    disabled={page === 0}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </button>
                  <span className="muted">
                    Page {page + 1} of {totalPages}
                  </span>
                  <button
                    className="secondary"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  );
}
