export const EASE = [0.22, 1, 0.36, 1] as const;

export const FADE_UP = {
  duration: 0.55,
  ease: EASE,
};

export const FADE_UP_SLOW = {
  duration: 0.7,
  ease: EASE,
};

export const viewportOnce = { once: true, margin: "-80px" as const };
