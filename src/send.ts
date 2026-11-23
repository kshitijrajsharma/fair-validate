import type { Answer } from "./store";

export const API: string = import.meta.env.VITE_API_URL ?? "/api/v1";

export async function postAnswers(
  projectId: number,
  answers: Answer[],
  keepalive = false,
): Promise<number> {
  const response = await fetch(
    `${API}/validation/projects/${projectId}/answers/`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guest_id: answers[0].guest,
        answers: answers.map((answer) => ({
          tile_id: answer.tileId,
          valid: answer.valid,
        })),
      }),
      keepalive,
    },
  );
  return response.status;
}
