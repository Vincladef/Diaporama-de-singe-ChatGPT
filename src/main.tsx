import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AudienceWindow } from "./presenter/AudienceWindow";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {window.location.pathname==="/projection"?<AudienceWindow/>:<App />}
  </StrictMode>
);
