import "./index.css";

import { createRoot } from "react-dom/client";
import { AppReadyBeacon, ISPOProvider } from "@ispo/sdk/react";

import { CadApp } from "./app";

function App() {
  return (
    <ISPOProvider>
      <AppReadyBeacon />
      <CadApp />
    </ISPOProvider>
  );
}

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(<App />);
}
