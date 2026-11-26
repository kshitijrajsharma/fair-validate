import { API } from "./send";
import { getFile, putFile } from "./store";
import { readTileList, unreachable, type Tile } from "./tiles";

export type Project = {
  id: number;
  slug: string;
  type: "training" | "prediction";
  title: string;
  description: string;
  answers_needed: number;
  status: "draft" | "published" | "finished";
  respondent_count?: number;
};

export class ReadError extends Error {}
export class MissingError extends ReadError {}

function statusMessage(response: Response): string {
  if (response.status === 429) {
    const minutes = Math.ceil(
      Number(response.headers.get("Retry-After") ?? 60) / 60,
    );
    return `Too many requests. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
  }
  return `fAIr could not load this (error ${response.status}). Try again in a moment.`;
}

const READ_TIMEOUT_MS = 10_000;
const MARKDOWN_IMAGE = /!\[[^\]]*\]\((\S+?)(?:\s+"[^"]*")?\)/g;

const notHtml = (response: Response) =>
  !(response.headers.get("Content-Type")?.includes("text/html") ?? false);

async function readSaved(
  url: string,
  accept = notHtml,
): Promise<ArrayBuffer | null> {
  let response: Response;
  let data: ArrayBuffer | undefined;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(READ_TIMEOUT_MS),
    });
    if (response.ok && accept(response)) data = await response.arrayBuffer();
  } catch (error) {
    // fetch rejects with TypeError without a network and TimeoutError on a dead one.
    if (!unreachable(error)) throw error;
    const saved = await getFile(url);
    if (saved) return saved;
    throw new ReadError(
      "You are offline and this page is not saved yet. Open it once while online.",
    );
  }
  if (response.status === 404) return null;
  if (!response.ok || !accept(response)) {
    const saved = await getFile(url);
    if (saved) return saved;
    throw new ReadError(
      response.ok
        ? "The network answered with a sign-in page. Sign in to the Wi-Fi, then try again."
        : statusMessage(response),
    );
  }
  if (!data) throw new ReadError(statusMessage(response));
  try {
    await putFile(url, data);
  } catch (error) {
    // A full device still shows what the network returned; only the offline copy is skipped.
    if (!(error instanceof DOMException && error.name === "QuotaExceededError"))
      throw error;
  }
  return data;
}

const isJson = (response: Response) =>
  response.headers.get("Content-Type")?.includes("json") ?? false;

async function readJson<T>(url: string): Promise<T> {
  const data = await readSaved(url, isJson);
  if (!data)
    throw new MissingError("This project does not exist or is not open.");
  return JSON.parse(new TextDecoder().decode(data)) as T;
}

export async function listProjects(): Promise<Project[]> {
  const page = await readJson<{ results: Project[] }>(
    `${API}/validation/projects/?limit=100`,
  );
  return page.results.filter((project) => project.status !== "draft");
}

export const getProject = (slug: string) =>
  readJson<Project>(`${API}/validation/projects/${slug}/`);

export const fileUrl = (projectSlug: string) => (name: string) =>
  `${API}/validation/projects/${projectSlug}/files/${name}/`;

export async function tileList(projectSlug: string): Promise<Tile[]> {
  const data = await readSaved(fileUrl(projectSlug)("tiles.bin"));
  if (!data) throw new ReadError("This project's tiles are not ready yet.");
  return readTileList(data);
}

export async function doneBits(projectSlug: string): Promise<Uint8Array> {
  const data = await readSaved(fileUrl(projectSlug)("done.bin"));
  return new Uint8Array(data ?? new ArrayBuffer(0));
}

export async function saveListForOffline(): Promise<void> {
  try {
    const projects = await listProjects();
    for (const project of projects)
      for (const [, url] of project.description.matchAll(MARKDOWN_IMAGE))
        new Image().src = url;
    await Promise.all(
      projects.flatMap((project) => [
        getProject(project.slug),
        tileList(project.slug),
        doneBits(project.slug),
      ]),
    );
  } catch (error) {
    // Saving ahead is best effort; a failed read is shown when that screen is opened.
    if (!(error instanceof ReadError)) throw error;
  }
}

export function guestId(): string {
  let id = localStorage.getItem("fair-validate-guest");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("fair-validate-guest", id);
  }
  return id;
}
