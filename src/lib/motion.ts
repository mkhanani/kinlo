import type { Transition, Variants } from "motion/react";

export const ease = [0.16, 1, 0.3, 1] as const;

export const pageTransition: Transition = { duration: 0.2, ease };

export const pageVariants: Variants = {
  initial: { opacity: 0, y: 6 },
  enter: { opacity: 1, y: 0, transition: pageTransition },
  exit: { opacity: 0, y: -6, transition: { duration: 0.18, ease } },
};

export const dialogVariants: Variants = {
  initial: { opacity: 0, scale: 0.98 },
  enter: { opacity: 1, scale: 1, transition: { duration: 0.2, ease } },
  exit: { opacity: 0, scale: 0.98, transition: { duration: 0.18, ease } },
};
