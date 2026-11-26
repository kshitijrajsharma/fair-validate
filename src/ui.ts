import { micromark } from "micromark";
import { gfm, gfmHtml } from "micromark-extension-gfm";

import { doneBits, tileList, type Project } from "./api";
import { icons } from "./icons";
import { projectAnswers, type Answer } from "./store";
import { countProgress, type Tile } from "./tiles";

export const app = document.getElementById("app") as HTMLElement;

export type Current = () => boolean;

export const session: { leave?: () => void } = {};

export const escape = (text: string) =>
  text.replace(
    /[&<>"]/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string,
  );

export function remember(key: string, value?: string): string | null {
  if (value !== undefined) localStorage.setItem(key, value);
  return localStorage.getItem(key);
}

export const offlinePill = () =>
  navigator.onLine
    ? ""
    : `<span class="pill offline">${icons.cloudDownload}Offline</span>`;

export function networkPill(extra = ""): string {
  return `<span class="bar-end"><span class="net">${offlinePill()}</span>${extra}</span>`;
}

export function bar(title: string, back: string | null, right: string): string {
  const lead = back
    ? `<a class="icon-button back" href="${back}" aria-label="Back">${icons.chevron}</a>`
    : `<img src="${import.meta.env.BASE_URL}icon.svg" alt="fAIr" />`;
  return `<header class="bar"><div class="brand">${lead}<span>${escape(title)}</span></div>${right}</header>`;
}

export async function progress(
  project: Project,
): Promise<{ list: Tile[]; bits: Uint8Array; mine: Answer[]; done: number }> {
  const [list, bits, mine] = await Promise.all([
    tileList(project.id),
    doneBits(project.id),
    projectAnswers(project.id),
  ]);
  const done = countProgress(
    bits,
    list,
    mine.map((answer) => answer.tileId),
  );
  return { list, bits, mine, done };
}

export const skeleton = (...heights: number[]) =>
  heights
    .map(
      (height) => `<span class="skeleton" style="height:${height}px"></span>`,
    )
    .join("");

export const markdown = (text: string) =>
  micromark(text, { extensions: [gfm()], htmlExtensions: [gfmHtml()] });

export const question = (description: string) =>
  description
    .trim()
    .split("\n")[0]
    .replace(/^#+\s*/, "");

export function yourAnswers(valid: Iterable<boolean>): string {
  let yes = 0;
  let no = 0;
  for (const answer of valid) answer ? yes++ : no++;
  return `Your answers: ${yes.toLocaleString()} Yes, ${no.toLocaleString()} No`;
}

export const backToProjects = (style = "secondary") =>
  `<a class="${style}-button" href="#/">Back to projects</a>`;

export const resultsLegend = (mine: boolean) =>
  `<p class="legend">${
    mine
      ? `<span class="key yes"></span>Your Yes<span class="key no"></span>Your No<span class="key others"></span>Done by others`
      : `<span class="key others"></span>Done`
  }<span class="key open"></span>Open</p>`;

export const tileCount = (count: number) =>
  `${count.toLocaleString()} tile${count === 1 ? "" : "s"}`;

export function percent(done: number, total: number): string {
  return `${total ? Math.floor((done / total) * 100) : 0}%`;
}

export const percentDone = (done: number, total: number) =>
  `${percent(done, total)} done`;

export const contributors = (count: number | undefined) =>
  count === undefined
    ? ""
    : `${count.toLocaleString()} contributor${count === 1 ? "" : "s"}`;

export function meter(done: number, total: number): string {
  return `<div class="meter"><i style="width:${total ? Math.floor((done / total) * 100) : 0}%"></i></div>`;
}

// iOS browsers without Apple's browser entitlement have no service workers (firt.dev/ios-14), so check for the API itself.
export const iosWithoutOffline = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) &&
  !("serviceWorker" in navigator);
