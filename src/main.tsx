import React from "react";
import ReactDOM from "react-dom/client";

// Fonts ship inside the app, so they look the same offline and on any system.
import "@fontsource-variable/manrope";
import "@fontsource-variable/vazirmatn"; // for Persian file names, which Manrope has no letters for
import { App } from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
