import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { DATA } from "./model";
import "./styles.css";

function setRandomImmortalFavicon() {
  const index = crypto.getRandomValues(new Uint32Array(1))[0] % DATA.immortals.length;
  const immortal = DATA.immortals[index];
  const icon = document.createElement("link");
  icon.rel = "icon";
  icon.type = "image/png";
  icon.href = immortal.boardImage;
  document.head.append(icon);
}

setRandomImmortalFavicon();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
