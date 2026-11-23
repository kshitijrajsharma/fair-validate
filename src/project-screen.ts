import { fileUrl, getProject, type Project } from "./api";
import { icons } from "./icons";
import { drawResults } from "./results";
import { tileKeys } from "./store";
import { onSync } from "./sync";
import { isDone, ProjectTiles, unreachable, type Tile } from "./tiles";
import {
  app,
  backToProjects,
  bar,
  escape,
  iosWithoutOffline,
  markdown,
  meter,
  networkPill,
  progress,
  remember,
  resultsLegend,
  session,
  skeleton,
  tileCount,
  yourAnswers,
  type Current,
} from "./ui";

async function saveAll(
  project: Project,
  tiles: ProjectTiles,
  list: Tile[],
  bits: Uint8Array,
  current: Current,
  onStep: (n: number) => void,
): Promise<string | undefined> {
  let saved = 0;
  for (const tile of list) {
    if (!current() || remember(`offline-${project.id}`) !== "on") break;
    if (isDone(bits, tile)) continue;
    try {
      await tiles.save(tile);
      onStep(++saved);
    } catch (error) {
      if (unreachable(error))
        return `Saved ${tileCount(saved)} more. Saving goes on when you are back online.`;
      if (
        !(error instanceof DOMException && error.name === "QuotaExceededError")
      )
        throw error;
      return `Storage is full after ${tileCount(saved)} more. Free some space to save the rest.`;
    }
  }
  return undefined;
}

export async function projectScreen(
  id: number,
  current: Current,
): Promise<void> {
  app.innerHTML = `${bar("", "#/", networkPill())}<section class="scroll" aria-busy="true">${skeleton(28, 6, 26, 120, 120)}</section>`;
  const project = await getProject(id);
  const tiles = new ProjectTiles(project.id, fileUrl(project.id));
  const { list, bits, mine, done } = await progress(project);
  if (!current()) return;
  const finished = project.status === "finished";
  const answered = new Map(mine.map((answer) => [answer.tileId, answer.valid]));
  const leftForMe = list.filter(
    (tile) => !isDone(bits, tile) && !answered.has(tile.id),
  ).length;
  const doneForMe = finished || leftForMe === 0;
  const left = list.length - done;
  const results = doneForMe
    ? `<div class="results-block">${mine.length ? `<p class="note">${yourAnswers(answered.values())}</p>` : ""}<canvas class="results" id="results" aria-label="Map of the project's tiles"></canvas>${resultsLegend(mine.length > 0)}</div>`
    : mine.length
      ? `<p class="note">${yourAnswers(answered.values())}</p>`
      : "";
  app.innerHTML = `${bar(project.title, "#/", networkPill())}
    <section class="scroll">
      <h2 class="title">${escape(project.title)}</h2>
      ${meter(done, list.length)}
      <div class="meta"><span>${finished ? `${done.toLocaleString()} of ${tileCount(list.length)} done` : `${tileCount(left)} left`}</span>${
        finished
          ? `<span class="status done">${icons.check}Finished</span>`
          : `<span>${list.length ? Math.round((done / list.length) * 100) : 0}%</span>`
      }</div>
      ${results}
      ${
        doneForMe
          ? ""
          : `<div class="row"><span class="label" title="Available offline">${icons.cloudDownload}<span id="saved"></span></span><button class="toggle" id="offline" aria-pressed="${remember(`offline-${id}`) === "on"}" aria-label="Available offline"></button></div>
      <div class="saving" id="saving" hidden><i></i></div>
      ${iosWithoutOffline() ? `<p class="note">Saved tiles work while this page stays open. To open the app offline, open it in Safari and add it to your Home Screen.</p>` : ""}`
      }
      ${finished ? "" : `<p class="status" id="pending"></p>`}
      <div class="description">${markdown(project.description)}</div>
    </section>
    <footer class="footer">${
      finished
        ? `<a class="primary-button" href="${fileUrl(id)("results.parquet")}">Download results</a>${backToProjects()}`
        : doneForMe
          ? backToProjects("primary")
          : `<button class="primary-button" id="start">${mine.length ? `Continue (${leftForMe.toLocaleString()} left)` : "Start"}</button>`
    }</footer>`;
  const resultsCanvas = app.querySelector<HTMLCanvasElement>("#results");
  if (resultsCanvas)
    drawResults(resultsCanvas, list, answered, (tile) => isDone(bits, tile));
  if (finished) return;
  const pendingLabel = app.querySelector("#pending") as HTMLElement;
  const stopSync = onSync((pending) => {
    pendingLabel.hidden = pending === 0 && mine.length === 0;
    pendingLabel.classList.toggle("done", pending === 0);
    pendingLabel.innerHTML = pending
      ? `${icons.refresh}${pending} answer${pending === 1 ? "" : "s"} to send`
      : `${icons.check}All answers sent`;
  });
  session.leave = stopSync;
  if (doneForMe) return;
  const savedLabel = app.querySelector("#saved") as HTMLElement;
  const showSaved = async () => {
    const count = (await tileKeys(`${id}/imagery/`)).length;
    savedLabel.textContent = count
      ? `${tileCount(count)} saved`
      : "Save for offline";
  };
  await showSaved();
  if (!current()) return;
  const toggle = app.querySelector("#offline") as HTMLButtonElement;
  toggle.closest(".row")?.addEventListener("click", (event) => {
    if (!toggle.contains(event.target as Node)) toggle.click();
  });
  let saving = false;
  const savingBar = app.querySelector("#saving") as HTMLElement;
  const startSaving = () => {
    if (saving || remember(`offline-${id}`) !== "on") return;
    saving = true;
    const total = list.filter((tile) => !isDone(bits, tile)).length;
    savingBar.hidden = false;
    void saveAll(project, tiles, list, bits, current, (n) => {
      savedLabel.textContent = `Saving ${n.toLocaleString()} of ${tileCount(total)}`;
      savingBar.style.setProperty("--progress", String(n / Math.max(total, 1)));
    })
      .then(async (problem) => {
        await showSaved();
        if (problem) savedLabel.textContent = problem;
      })
      .catch((error: Error) => {
        savedLabel.textContent = error.message;
      })
      .finally(() => {
        saving = false;
        savingBar.hidden = true;
      });
  };
  toggle.addEventListener("click", () => {
    const on = toggle.getAttribute("aria-pressed") !== "true";
    toggle.setAttribute("aria-pressed", String(on));
    remember(`offline-${id}`, on ? "on" : "off");
    startSaving();
  });
  window.addEventListener("online", startSaving);
  startSaving();
  session.leave = () => {
    stopSync();
    window.removeEventListener("online", startSaving);
  };
  (app.querySelector("#start") as HTMLButtonElement).addEventListener(
    "click",
    () => {
      location.hash = `#/p/${id}/go`;
    },
  );
}
