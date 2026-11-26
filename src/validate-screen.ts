import { fileUrl, getProject, guestId } from "./api";
import { bindGestures } from "./gestures";
import { gestureHint } from "./hint";
import { icons } from "./icons";
import { drawTile } from "./render";
import { drawResults } from "./results";
import { saveAnswer, type Answer } from "./store";
import { answered } from "./sync";
import { tileMotion } from "./tile-motion";
import {
  countProgress,
  isDone,
  ProjectTiles,
  tileOrder,
  unreachable,
  type Tile,
} from "./tiles";
import {
  app,
  backToProjects,
  bar,
  escape,
  networkPill,
  progress,
  question,
  resultsLegend,
  session,
  skeleton,
  tileCount,
  yourAnswers,
  type Current,
} from "./ui";

const FIRST_TILES = 10;
const BUFFER = 100;

function seedFor(id: number): number {
  let hash = id;
  for (const char of guestId())
    hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0;
  return hash;
}

export async function validateScreen(
  id: number,
  current: Current,
): Promise<void> {
  app.innerHTML = `${bar("", `#/p/${id}`, "")}<section id="screen" aria-busy="true"><div class="stage">${skeleton(25)}<span class="skeleton tile"></span><div class="nav">${skeleton(44)}</div></div><div class="answers">${skeleton(58, 58)}</div></section>`;
  const project = await getProject(id);
  const tiles = new ProjectTiles(project.id, fileUrl(project.id));
  const [{ list, bits, mine }, found] = await Promise.all([
    progress(project),
    project.type === "training"
      ? tiles.classes().catch((error: unknown) => {
          // Offline before the classes were ever fetched, outlines stay red.
          if (!unreachable(error)) throw error;
          return undefined;
        })
      : undefined,
  ]);
  if (!current()) return;
  const classes = found && found.values.length > 1 ? found : undefined;
  const legend = classes ? `<ul class="classes" id="classes"></ul>` : "";
  const byId = new Map(list.map((tile) => [tile.id, tile]));
  const answers = new Map<number, boolean>(
    mine.map((a) => [a.tileId, a.valid]),
  );
  const queue = tileOrder(list, seedFor(id)).filter(
    (t) => !isDone(bits, t) && !answers.has(t.id),
  );
  const missing = new Set<number>();
  const history: Tile[] = [...mine]
    .sort((a, b) => a.at - b.at)
    .flatMap((answer) => byId.get(answer.tileId) ?? []);
  let position = history.length - 1;

  app.innerHTML = `${bar(project.title, `#/p/${id}`, networkPill(`<span class="counter" id="counter"></span>`))}
    <section id="screen" aria-label="Swipe right for Yes, left for No, up for the next tile, down for the previous one. Arrow keys work too.">
      <div class="stage">
        <p class="question">${escape(question(project.description))}</p>
        <div class="tile loading" id="tile"><canvas id="canvas" width="512" height="512"></canvas><div class="tint" id="tint"></div><div class="stamp" id="stamp" aria-hidden="true"></div>
          <div class="coach" id="hint" hidden>
            <span class="pill yes" data-step="right">Yes ${icons.chevron}</span><span class="pill no" data-step="left">${icons.chevron} No</span>
            <span class="pill next" data-step="up">${icons.chevron} Next</span><span class="pill back" data-step="down">${icons.chevron} Back</span>
            <span class="finger" id="finger"></span>
            <span class="coach-text" data-step="hold">Hold to hide the outlines</span><button class="hint-done" id="hint-done">Got it</button></div>
          <div class="message" id="message" hidden></div>
        </div>
        ${legend}
        <div class="nav">
          <button id="previous" aria-label="Previous tile">${icons.chevron}</button>
          <button id="help" aria-label="Show how to answer">${icons.info}</button>
          <button class="next" id="next" aria-label="Next tile">${icons.chevron}</button>
        </div>
      </div>
      <div class="answers"><button class="no" id="no">No</button><button class="yes" id="yes">Yes</button></div>
      <div class="end" id="end" hidden></div>
    </section>`;
  const $ = <T extends HTMLElement>(selector: string) =>
    app.querySelector(selector) as T;
  const canvas = $<HTMLCanvasElement>("#canvas");
  const tileBox = $("#tile");
  const yes = $<HTMLButtonElement>("#yes");
  const no = $<HTMLButtonElement>("#no");
  const message = $("#message");
  const motion = tileMotion({
    tileBox,
    tint: $("#tint"),
    stamp: $("#stamp"),
    yes,
    no,
  });
  const hint = gestureHint($("#hint"));

  const updateCounter = () => {
    const done = countProgress(bits, list, answers.keys());
    $("#counter").textContent =
      `${done.toLocaleString()} / ${list.length.toLocaleString()}`;
  };

  const load = async (tile: Tile): Promise<"saved" | "absent" | "offline"> => {
    try {
      return (await tiles.save(tile)) ? "saved" : "absent";
    } catch (error) {
      if (!unreachable(error)) throw error;
      return "offline";
    }
  };

  const nextAvailable = async (): Promise<Tile | undefined> => {
    const later: Tile[] = [];
    let tile: Tile | undefined;
    while (!tile && queue.length) {
      const candidate = queue.shift() as Tile;
      if (missing.has(candidate.id)) continue;
      const result = await load(candidate);
      if (result === "saved") tile = candidate;
      else if (result === "absent") missing.add(candidate.id);
      else later.push(candidate);
    }
    queue.push(...later);
    return tile;
  };

  let prefetching = false;
  const prefetch = async () => {
    if (prefetching) return;
    prefetching = true;
    try {
      for (const tile of queue.slice(0, BUFFER)) {
        if (!current()) break;
        const result = await load(tile);
        if (result === "absent") missing.add(tile.id);
        if (result === "offline") break;
      }
    } catch (error) {
      // Prefetch is best effort; the tile is fetched again, and any error shown, when it is answered.
      if (!(error instanceof Error)) throw error;
    } finally {
      prefetching = false;
    }
  };

  const showEnd = () => {
    const end = $("#end");
    const skipped = history.filter(
      (tile) => !answers.has(tile.id) && !isDone(bits, tile),
    ).length;
    const offlineLeft = queue.length > 0;
    end.innerHTML = `<div class="end-body">
        <span class="end-mark">${icons.check}</span>
        <h2>${offlineLeft ? "Every saved tile is answered" : answers.size ? "All done. Thank you!" : "Every tile has been checked"}</h2>
        ${answers.size ? `<p>${yourAnswers(answers.values())}</p>` : ""}
        ${skipped ? `<p class="note">${tileCount(skipped)} skipped; others will answer them.</p>` : ""}
        ${offlineLeft ? `<p class="note">More tiles load when you are back online.</p>` : ""}
        <canvas class="results" id="results" aria-label="Map of the project's tiles"></canvas>
        ${resultsLegend}
      </div>
      <div class="end-actions">${
        offlineLeft
          ? `<button class="primary-button" id="more">Load more tiles</button>${backToProjects()}`
          : backToProjects("primary")
      }</div>`;
    end.querySelector("#more")?.addEventListener("click", () => void move(1));
    drawResults(
      end.querySelector("#results") as HTMLCanvasElement,
      list,
      (tile) => isDone(bits, tile) || answers.has(tile.id),
      280,
    );
  };

  const show = async (labels = true) => {
    const tile = history[position];
    message.hidden = true;
    $("#screen").classList.toggle("ended", !tile);
    $("#end").hidden = !!tile;
    if (!tile) {
      showEnd();
      return;
    }
    const [imagery, vectors] = await Promise.all([
      tiles.get("imagery", tile),
      tiles.get("labels", tile),
    ]);
    if (!imagery) throw new Error("This tile has no imagery");
    const colors = await drawTile(canvas, imagery, vectors, labels, classes);
    if (classes && labels)
      $("#classes").innerHTML = [...colors]
        .map(
          ([value, color]) =>
            `<li><i style="background:${color}"></i>${escape(value.replaceAll("_", " ").replaceAll(";", " + "))}</li>`,
        )
        .join("");
    tileBox.classList.remove("loading");
    const prior = answers.get(tile.id);
    yes.setAttribute("aria-pressed", String(prior === true));
    no.setAttribute("aria-pressed", String(prior === false));
  };

  const forward = async () => {
    if (position < history.length - 1) position++;
    else {
      const tile = await nextAvailable();
      if (tile) history.push(tile);
      position = history.length - (tile ? 1 : 0);
    }
    await show();
    void prefetch();
  };

  const back = async () => {
    if (position <= 0) return;
    position = Math.min(position, history.length) - 1;
    await show();
  };

  const showError = (error: Error) => {
    message.hidden = false;
    message.textContent = `${error.message}. Swipe up to try another.`;
  };

  let busy = false;
  const answer = async (valid: boolean) => {
    const tile = history[position];
    if (!tile || busy) return;
    busy = true;
    try {
      await saveAndAdvance(tile, valid);
    } finally {
      busy = false;
    }
  };

  const saveAndAdvance = async (tile: Tile, valid: boolean) => {
    hint.hide();
    const entry: Answer = {
      projectId: id,
      tileId: tile.id,
      valid,
      at: Date.now(),
      guest: guestId(),
    };
    try {
      await saveAnswer(entry);
    } catch (error) {
      if (
        !(error instanceof DOMException && error.name === "QuotaExceededError")
      )
        throw error;
      message.hidden = false;
      message.textContent =
        "Storage is full; this answer was not saved. Free some space, then answer again.";
      motion.lean(0, 0);
      return;
    }
    answers.set(tile.id, valid);
    updateCounter();
    void answered();
    motion.resetButtons();
    await motion.fly(valid);
    try {
      await forward();
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      showError(error);
    } finally {
      await motion.arrive();
    }
  };

  const move = async (step: 1 | -1) => {
    if (busy) return;
    busy = true;
    try {
      hint.hide();
      motion.resetButtons();
      if (step === -1 && position <= 0) {
        motion.lean(0, 0);
        return;
      }
      const change = step === 1 ? forward : back;
      if ($("#screen").classList.contains("ended")) await change();
      else await motion.page(step, change);
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      showError(error);
    } finally {
      busy = false;
    }
  };

  yes.addEventListener("click", () => void answer(true));
  no.addEventListener("click", () => void answer(false));
  $("#next").addEventListener("click", () => void move(1));
  $("#previous").addEventListener("click", () => void move(-1));
  $("#help").addEventListener("click", hint.toggle);

  const unbind = bindGestures($("#screen"), tileBox, {
    busy: () => busy,
    lean: motion.lean,
    settle: () => motion.lean(0, 0),
    hold: (holding) => void show(!holding),
    answer: (valid) => void answer(valid),
    move: (step) => void move(step),
  });
  session.leave = () => {
    unbind();
    hint.stop();
  };

  updateCounter();
  hint.showOnFirstVisit();
  const firstTiles = queue.slice(0, FIRST_TILES);
  await Promise.all(
    firstTiles.map(
      async (tile) => (await load(tile)) === "absent" && missing.add(tile.id),
    ),
  );
  await forward();
}
