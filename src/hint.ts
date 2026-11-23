import { remember } from "./ui";

const STEPS: [string, (reach: number) => string][] = [
  ["right", (reach) => `translateX(${reach}px)`],
  ["left", (reach) => `translateX(${-reach}px)`],
  ["up", (reach) => `translateY(${-reach}px)`],
  ["down", (reach) => `translateY(${reach}px)`],
  ["hold", () => "scale(1.5)"],
];

export function gestureHint(hint: HTMLElement) {
  const finger = hint.querySelector(".finger") as HTMLElement;
  const targets = [...hint.querySelectorAll<HTMLElement>("[data-step]")];
  let demo: ReturnType<typeof setInterval> | undefined;

  const show = () => {
    hint.hidden = false;
    let step = 0;
    clearInterval(demo);
    const play = () => {
      const [name, transform] = STEPS[step++ % STEPS.length];
      for (const target of targets)
        target.classList.toggle("on", target.dataset.step === name);
      finger.style.transform = transform(hint.clientWidth * 0.17);
      setTimeout(() => (finger.style.transform = "none"), 1000);
    };
    play();
    demo = setInterval(play, 1700);
  };

  const hide = () => {
    if (hint.hidden) return;
    hint.hidden = true;
    clearInterval(demo);
    remember("hint-seen", "yes");
  };

  hint.querySelector("#hint-done")?.addEventListener("click", hide);

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
