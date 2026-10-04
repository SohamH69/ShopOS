// Fonts: Anek Latin (condensed display, variable width), Mukta (UI text), Spline Sans Mono (numbers).
import "@fontsource-variable/anek-latin/wdth.css";
import "@fontsource/mukta/400.css";
import "@fontsource/mukta/500.css";
import "@fontsource/mukta/600.css";
import "@fontsource/mukta/700.css";
import "@fontsource-variable/spline-sans-mono/index.css";
import "./styles/tokens.css";
import "./styles/base.css";

// Imported before the app so the install prompt is captured even before any page mounts.
import { registerServiceWorker } from "./lib/pwa";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

const container = document.getElementById("root");
if (!container) throw new Error("ShopOS could not start: the #root element is missing from index.html.");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

registerServiceWorker();
