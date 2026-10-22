import React from "react";
import ReactDOM from "react-dom/client";

// Fonts ship inside the app, so they look the same offline and on any system.
import "@fontsource-variable/manrope";
import "@fontsource-variable/vazirmatn"; // for Persian file names, which Manrope has no letters for
import "@fontsource/yeseva-one/latin-400.css"; // the name in the logo only
// Before the first paint, so it starts in the chosen language and theme.
import "./lib/i18n";
import "./lib/theme";
import { App } from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
