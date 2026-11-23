import type { Answer } from "./store";

export const BATCH_SIZE = 50;

export type FlushDeps = {
  pending: () => Promise<Answer[]>;
  removeSent: (answer: Answer) => Promise<void>;
  post: (projectId: number, answers: Answer[]) => Promise<number>;
};

export type FlushResult = {
  sent: number;
  rejected: number;
  finished: number[];
  retry: boolean;
};

function byProject(answers: Answer[]): Map<number, Answer[]> {
  const groups = new Map<number, Answer[]>();
  for (const answer of answers) {
    const group = groups.get(answer.projectId) ?? [];
    group.push(answer);
    groups.set(answer.projectId, group);
  }
  return groups;
}

export async function flush(deps: FlushDeps): Promise<FlushResult> {
  const result: FlushResult = {
    sent: 0,
    rejected: 0,
    finished: [],
    retry: false,
  };
  for (const [projectId, answers] of byProject(await deps.pending())) {
    for (let start = 0; start < answers.length; start += BATCH_SIZE) {
      const batch = answers.slice(start, start + BATCH_SIZE);
      let status: number;
      try {
        status = await deps.post(projectId, batch);
      } catch (error) {
        if (!(error instanceof TypeError)) throw error;
        return { ...result, retry: true };
      }
      if (status === 404 || status === 410) {
        const rest = answers.slice(start);
        await Promise.all(rest.map(deps.removeSent));
        result.rejected += rest.length;
        if (status === 410) result.finished.push(projectId);
        break;
      }
      if (status === 204 || status === 400) {
        await Promise.all(batch.map(deps.removeSent));
        if (status === 204) result.sent += batch.length;
        else result.rejected += batch.length;
      } else {
        return { ...result, retry: true };
      }
    }
  }
  return result;
}

export function backoff(failures: number): number {
  return Math.min(5_000 * 2 ** failures, 300_000);
}
