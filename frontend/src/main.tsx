// Fonts: Baloo 2 (display: titles and big numbers) and Figtree (everything you read, with tabular figures).
// The full index.css files carry the extended subsets, which is where the ₹ sign lives.
import "@fontsource-variable/baloo-2/index.css";
import "@fontsource-variable/figtree/index.css";
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
