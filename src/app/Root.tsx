import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bleed, type BleedSpec } from "@/features/onboarding/Bleed";
import { Onboarding, type OnboardingResult } from "@/features/onboarding/Onboarding";
import { AppShell } from "./AppShell";
import { useSaveSetting, useSettings, useThemeSync } from "./settings";

/**
 * The top of the app: the welcome setup until it has been finished, then the app itself.
 * The bleed lives here because it has to stay on screen while one is swapped for the other.
 */
export function Root() {
  const { onboarded } = useSettings();
  const save = useSaveSetting();
  const navigate = useNavigate();
  useThemeSync();

  const [bleed, setBleed] = useState<{ spec: BleedSpec; phase: "covering" | "clearing" } | null>(null);
  const pending = useRef<OnboardingResult | null>(null);

  const begin = (result: OnboardingResult) => {
    if (pending.current) return;
    pending.current = result;
    setBleed({ spec: { origin: result.origin, color: result.color }, phase: "covering" });
  };

  // The window is covered: save the answers and swap in the app behind the colour.
  const onCovered = useCallback(() => {
    const result = pending.current;
    if (!result) return;
    pending.current = null;
    save("userName", result.userName);
    save("sides", result.sides);
    save("activeSide", result.activeSide);
    save("onboarded", true);
    navigate("/", { replace: true });
    setBleed((current) => (current ? { ...current, phase: "clearing" } : current));
  }, [save, navigate]);

  return (
    <>
      {onboarded ? <AppShell /> : <Onboarding onChoose={begin} />}
      {bleed && <Bleed spec={bleed.spec} phase={bleed.phase} onCovered={onCovered} onCleared={() => setBleed(null)} />}
    </>
  );
}
