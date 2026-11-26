import { listProjects, ReadError } from "./api";
import { icons } from "./icons";
import { tileKeys } from "./store";
import {
  app,
  bar,
  escape,
  meter,
  networkPill,
  contributors,
  percentDone,
  progress,
  question,
  remember,
  skeleton,
  type Current,
} from "./ui";

export async function listScreen(current: Current): Promise<void> {
  app.innerHTML = `${bar("Validate", null, networkPill())}<section class="scroll" id="list" aria-busy="true">${skeleton(96, 96)}</section>`;
  const list = app.querySelector("#list") as HTMLElement;
  const projects = await listProjects();
  if (!current()) return;
  list.removeAttribute("aria-busy");
  if (!projects.length) {
    list.innerHTML = `<p class="empty">Nothing to check right now. Come back later.</p>`;
    return;
  }
  list.innerHTML = projects
    .map(
      (project) => `<a class="card" href="#/p/${project.id}">
        <h2>${project.type === "prediction" ? icons.category : icons.building}${escape(project.title)}</h2>
        <p class="summary">${escape(question(project.description))}</p>
        <div data-progress="${project.id}">${skeleton(6)}<div class="meta"><span>&nbsp;</span></div></div></a>`,
    )
    .join("");
  for (const project of projects) {
    const slot = list.querySelector(
      `[data-progress="${project.id}"]`,
    ) as HTMLElement;
    const saved = (await tileKeys(`${project.id}/imagery/`)).length;
    progress(project).then(
      ({ list, done }) => {
        const status =
          project.status === "finished"
            ? `<span class="status done">${icons.check}Finished</span>`
            : saved && remember(`offline-${project.id}`) === "on"
              ? `<span class="status">${icons.cloudDownload}Saved offline</span>`
              : "";
        slot.innerHTML = `${meter(done, list.length)}<div class="meta"><span class="meta-start">${percentDone(done, list.length)}${status}</span><span>${contributors(project.respondent_count)}</span></div>`;
      },
      (error: unknown) => {
        if (!(error instanceof ReadError)) throw error;
        if (navigator.onLine) {
          slot.innerHTML = `<p class="note">${escape(error.message)}</p>`;
          return;
        }
        slot.parentElement?.classList.add("unavailable");
        slot.remove();
      },
    );
  }
}
