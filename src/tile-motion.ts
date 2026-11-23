import { icons } from "./icons";

type TileParts = {
  tileBox: HTMLElement;
  tint: HTMLElement;
  stamp: HTMLElement;
  yes: HTMLButtonElement;
  no: HTMLButtonElement;
};

const OUT = "cubic-bezier(0.55, 0, 0.75, 0.3)";
const IN = "cubic-bezier(0.2, 0.8, 0.2, 1)";
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function tileMotion({ tileBox, tint, stamp, yes, no }: TileParts) {
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let leanOffset = { dx: 0, dy: 0 };

  const resetButtons = () => {
    for (const button of [yes, no]) {
      button.style.transform = "";
      button.classList.remove("leaning");
    }
  };

  const lean = (dx: number, dy: number) => {
    leanOffset = { dx, dy };
    tileBox.style.transform =
      dx || dy ? `translate(${dx}px, ${dy}px) rotate(${dx / 25}deg)` : "";
    const sideways = Math.abs(dx) > Math.abs(dy);
    const pull = sideways ? Math.min(Math.abs(dx) / 120, 1) : 0;
    tint.style.background = dx > 0 ? "var(--green)" : "var(--primary)";
    tint.style.opacity = String(pull * 0.45);
    const active = dx > 0 ? yes : no;
    const other = dx > 0 ? no : yes;
    active.style.transform =
      pull && !reducedMotion ? `scale(${1 + pull * 0.06})` : "";
    active.classList.toggle("leaning", pull > 0.5);
    other.style.transform = "";
    other.classList.remove("leaning");
  };

  const leave = async (to: string, duration: number) => {
    const from = tileBox.style.transform || "none";
    tileBox.style.transition = "none";
    lean(0, 0);
    tileBox.style.opacity = "0";
    await tileBox.animate(
      [
        { transform: from, opacity: 1 },
        { transform: reducedMotion ? from : to, opacity: 0 },
      ],
      { duration, easing: OUT },
    ).finished;
  };

  const enter = async (from: string) => {
    tileBox.style.opacity = "";
    await tileBox.animate(
      [
        { transform: reducedMotion ? "none" : from, opacity: 0 },
        { transform: "none", opacity: 1 },
      ],
      { duration: 160, easing: IN },
    ).finished;
    tileBox.style.transition = "";
  };

  const page = async (step: 1 | -1, change: () => Promise<void>) => {
    await leave(`translateY(${-40 * step}%)`, 120);
    try {
      await change();
    } finally {
      await enter(`translateY(${40 * step}%)`);
    }
  };

  const fly = async (valid: boolean) => {
    const button = valid ? yes : no;
    stamp.innerHTML = valid ? icons.check : icons.close;
    stamp.className = `stamp show ${valid ? "yes" : "no"}`;
    button.classList.add("leaning");
    await wait(60);
    const from = tileBox.getBoundingClientRect();
    const to = button.getBoundingClientRect();
    const dx =
      leanOffset.dx + to.left + to.width / 2 - (from.left + from.width / 2);
    const dy =
      leanOffset.dy + to.top + to.height / 2 - (from.top + from.height / 2);
    await leave(
      `translate(${dx}px, ${dy}px) scale(0.1) rotate(${valid ? 10 : -10}deg)`,
      180,
    );
    stamp.className = "stamp";
    button.classList.remove("leaning");
  };

  const arrive = () => enter("scale(0.94)");

  return { lean, page, fly, arrive, resetButtons };
}
