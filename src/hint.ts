import { remember } from "./ui";

const STEPS: [string, string, string][] = [
  ["translateX(70px)", "Yes", "var(--green)"],
  ["translateX(-70px)", "No", "var(--primary)"],
  ["translateY(-70px)", "Next", ""],
  ["translateY(70px)", "Previous", ""],
  ["scale(1.35)", "Hold: imagery only", ""],
];

export function gestureHint(hint: HTMLElement) {
  const finger = hint.querySelector(".finger") as HTMLElement;
  const label = hint.querySelector(".finger-label") as HTMLElement;
  let demo: ReturnType<typeof setInterval> | undefined;

  const show = () => {
    hint.hidden = false;
    let step = 0;
    clearInterval(demo);
    demo = setInterval(() => {
      const [transform, text, color] = STEPS[step++ % STEPS.length];
      finger.style.transform = transform;
      label.textContent = text;
      label.style.background = color || "var(--surface)";
      label.style.color = color ? "var(--surface)" : "var(--dark)";
      label.classList.toggle("above", text === "Previous");
      setTimeout(() => (finger.style.transform = "none"), 900);
    }, 1600);
  };

  const hide = () => {
    if (hint.hidden) return;
    hint.hidden = true;
    clearInterval(demo);
    remember("hint-seen", "yes");
  };

  return {
    show,
    hide,
    toggle: () => (hint.hidden ? show() : hide()),
    stop: () => clearInterval(demo),
    showOnFirstVisit: () => {
      if (remember("hint-seen") !== "yes") show();
    },
  };
}
