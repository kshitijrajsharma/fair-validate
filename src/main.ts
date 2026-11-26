import { MissingError, saveListForOffline } from "./api";
import { listScreen } from "./list-screen";
import { projectScreen } from "./project-screen";
import { startSync } from "./sync";
import { app, bar, escape, networkPill, offlinePill, session } from "./ui";
import { validateScreen } from "./validate-screen";
import "./styles.css";

let generation = 0;

async function route(): Promise<void> {
  session.leave?.();
  session.leave = undefined;
  const [, kind, id, action] = location.hash.split("/");
  const mine = ++generation;
  const current = () => mine === generation;
  try {
    if (kind === "p" && action === "go") await validateScreen(id, current);
    else if (kind === "p") await projectScreen(id, current);
    else await listScreen(current);
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    if (!current()) return;
    const home = !kind;
    const action =
      error instanceof MissingError
        ? `<a class="primary-button" href="#/">Back to projects</a>`
        : `<button class="primary-button" id="retry">Try again</button>`;
    app.innerHTML = `${bar("Validate", home ? null : "#/", networkPill())}<section class="scroll"><p class="empty">${escape(error.message)}</p></section><footer class="footer">${action}</footer>`;
    app.querySelector("#retry")?.addEventListener("click", () => void route());
  }
}

window.addEventListener("hashchange", () => void route());
const refreshPills = () =>
  document
    .querySelectorAll(".net")
    .forEach((slot) => (slot.innerHTML = offlinePill()));
window.addEventListener("online", refreshPills);
window.addEventListener("offline", refreshPills);
if (import.meta.env.PROD && "serviceWorker" in navigator)
  void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
startSync();
void route();
if (navigator.onLine) void saveListForOffline();
