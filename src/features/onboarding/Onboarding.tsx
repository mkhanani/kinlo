import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Check, ChevronDown, ChevronUp, CornerDownLeft } from "lucide-react";
import { useSaveKey } from "@/ai/hooks";
import { PROVIDER_IDS, PROVIDERS } from "@/ai/providers";
import { useSaveSetting, useSettings } from "@/app/settings";
import { LogoMark } from "@/components/Logo";
import { TitleBar } from "@/components/shell/TitleBar";
import { Button } from "@/components/ui/Button";
import type { AiProvider, SidesChoice, ThemePref } from "@/data/settings";
import type { ImportRow } from "@/data/transfer";
import type { Side } from "@/data/types";
import { chooseContactsFile } from "@/features/transfer/ImportDialog";
import { ease } from "@/lib/motion";
import type { BleedOrigin } from "./Bleed";

export interface OnboardingResult {
  sides: SidesChoice;
  activeSide: Side;
  userName: string | null;
  /** People read from a contacts file during setup, to add once a side has been chosen. */
  importRows: ImportRow[];
  /** Where the bleed starts, in which colour, and the app background it settles into. */
  origin: BleedOrigin;
  color: string;
  settleTo: string;
}

/** The two halves are fixed colours whatever the theme: personal is light, business is dark. */
export const SIDE_COLOR: Record<Side, string> = { personal: "#f6f6f5", business: "#0a0a0b" };

/** Both sides together: the grey halfway between the two, so it shows over either half. */
export const BOTH_COLOR = "#7f7f82";

const STEPS = ["welcome", "name", "theme", "assistant", "people", "sides"] as const;
type Step = (typeof STEPS)[number];

/**
 * First-run setup, one question per screen: read it, answer, press Enter. The last
 * question is the split screen that decides which sides of kinlo you use.
 */
export function Onboarding({ onChoose }: { onChoose: (result: OnboardingResult) => void }) {
  const settings = useSettings();
  const save = useSaveSetting();
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [name, setName] = useState(settings.userName ?? "");
  const [incoming, setIncoming] = useState<Incoming | null>(null);
  const step: Step = STEPS[index]!;

  const go = useCallback((to: number) => {
    setIndex((from) => {
      const next = Math.max(0, Math.min(STEPS.length - 1, to));
      setDirection(next >= from ? 1 : -1);
      return next;
    });
  }, []);
  const next = useCallback(() => go(index + 1), [go, index]);
  const back = useCallback(() => go(index - 1), [go, index]);

  const choose = (sides: SidesChoice, origin: BleedOrigin) => {
    const background = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#0a0a0b";
    onChoose({
      sides,
      // With both switched on, start on the personal side.
      activeSide: sides === "business" ? "business" : "personal",
      userName: name.trim() || null,
      importRows: incoming?.rows ?? [],
      origin,
      color: sides === "both" ? BOTH_COLOR : SIDE_COLOR[sides],
      settleTo: background,
    });
  };

  if (step === "sides") {
    return <SidesStep number={index} onBack={back} onChoose={choose} />;
  }

  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <main className="relative flex min-h-0 flex-1 items-center overflow-hidden">
        <AnimatePresence mode="wait" custom={direction} initial={false}>
          <motion.div
            key={step}
            custom={direction}
            variants={{
              enter: (d: number) => ({ opacity: 0, y: d * 28 }),
              center: { opacity: 1, y: 0, transition: { duration: 0.22, ease } },
              exit: (d: number) => ({ opacity: 0, y: d * -28, transition: { duration: 0.18, ease } }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            className="mx-auto w-full max-w-[600px] px-10 pb-16"
          >
            {step === "welcome" && <Welcome onNext={next} />}
            {step === "name" && <NameStep number={index} name={name} setName={setName} onNext={next} />}
            {step === "theme" && (
              <ThemeStep number={index} value={settings.theme} onPick={(theme) => save("theme", theme)} onNext={next} />
            )}
            {step === "assistant" && <AssistantStep number={index} onNext={next} />}
            {step === "people" && <PeopleStep number={index} incoming={incoming} setIncoming={setIncoming} onNext={next} />}
          </motion.div>
        </AnimatePresence>
      </main>
      <Footer index={index} onBack={back} onNext={next} />
    </div>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center gap-1 text-xs text-subtle">{children}</span>;
}

const EnterHint = () => (
  <Hint>
    press <strong className="font-semibold text-muted">Enter</strong> <CornerDownLeft size={12} strokeWidth={1.75} />
  </Hint>
);

function Question({ number, title, detail, children }: { number: number; title: string; detail?: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-1.5 text-sm text-muted">
        {number} <ArrowRight size={13} strokeWidth={1.75} />
      </div>
      <h1 className="text-xl">{title}</h1>
      {detail && <p className="mt-2 text-md text-muted">{detail}</p>}
      <div className="mt-8">{children}</div>
    </div>
  );
}

function Welcome({ onNext }: { onNext: () => void }) {
  useEnter(onNext);
  return (
    <div>
      <LogoMark size={40} />
      <h1 className="mt-6 text-xl">Remember your people.</h1>
      <p className="mt-2 max-w-[440px] text-md text-muted">
        kinlo keeps track of the people in your life and the people you work with. Everything stays on this computer. No
        account, nothing sent anywhere.
      </p>
      <div className="mt-8 flex items-center gap-3">
        <Button variant="primary" autoFocus onClick={onNext} className="!h-9 !px-4">
          Get started
        </Button>
        <EnterHint />
      </div>
      <p className="mt-6 text-sm text-subtle">A few quick questions. It takes about a minute.</p>
    </div>
  );
}

function NameStep({ number, name, setName, onNext }: { number: number; name: string; setName: (v: string) => void; onNext: () => void }) {
  useEnter(onNext);
  return (
    <Question number={number} title="First, what should we call you?" detail="A first name is plenty. kinlo uses it to greet you.">
      <input
        autoFocus
        aria-label="Your name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Type your name"
        className="w-full border-b border-hairline bg-transparent pb-2 text-lg outline-none transition-colors duration-200 placeholder:text-subtle focus:border-[var(--fg)]"
      />
      <div className="mt-6 flex items-center gap-3">
        <Button variant="primary" onClick={onNext} className="!h-9 !px-4">
          {name.trim() ? "OK" : "Skip"} <Check size={15} strokeWidth={1.75} />
        </Button>
        <EnterHint />
      </div>
    </Question>
  );
}

const THEMES: { value: ThemePref; key: string; label: string; detail: string }[] = [
  { value: "system", key: "A", label: "Match my computer", detail: "Light by day, dark by night, if that is how you have it set." },
  { value: "light", key: "B", label: "Light", detail: "Always light." },
  { value: "dark", key: "C", label: "Dark", detail: "Always dark." },
];

function ThemeStep({ number, value, onPick, onNext }: { number: number; value: ThemePref; onPick: (v: ThemePref) => void; onNext: () => void }) {
  useEnter(onNext);
  // A, B and C pick an answer, as the letters beside them suggest.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const match = THEMES.find((t) => t.key.toLowerCase() === e.key.toLowerCase());
      if (match) onPick(match.value);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onPick]);

  return (
    <Question number={number} title="How should kinlo look?" detail="It changes as you choose. You can switch later in Settings.">
      <div role="radiogroup" aria-label="Theme" className="flex max-w-[420px] flex-col gap-2">
        {THEMES.map((theme) => {
          const selected = value === theme.value;
          return (
            <button
              key={theme.value}
              role="radio"
              aria-checked={selected}
              onClick={() => onPick(theme.value)}
              className={`flex items-center gap-3 rounded-[10px] border px-3 py-2.5 text-left transition-colors duration-200 ${
                selected ? "border-[var(--fg)] bg-control" : "border-hairline bg-control hover:bg-control-hover"
              }`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] border text-xs font-semibold ${
                  selected ? "border-[var(--fg)] bg-fg text-bg" : "border-hairline text-muted"
                }`}
              >
                {theme.key}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-medium">{theme.label}</span>
                <span className="block text-sm text-muted">{theme.detail}</span>
              </span>
              {selected && <Check size={16} strokeWidth={1.75} />}
            </button>
          );
        })}
      </div>
      <div className="mt-6 flex items-center gap-3">
        <Button variant="primary" onClick={onNext} className="!h-9 !px-4">
          OK <Check size={15} strokeWidth={1.75} />
        </Button>
        <EnterHint />
      </div>
    </Question>
  );
}

const ASSISTANT_CHOICES: { value: AiProvider | null; key: string; label: string; detail: string }[] = [
  ...PROVIDER_IDS.map((id, index) => ({
    value: id,
    key: "ABCD"[index]!,
    label: PROVIDERS[id].label,
    detail: PROVIDERS[id].local ? "Runs on this computer. No key needed." : "With your own API key.",
  })),
  { value: null, key: "E", label: "Not now", detail: "Everything else works without it." },
];

/**
 * Optional: connect an AI model. Skipping is one key press, and it can be set up later
 * in Settings. A key typed here goes straight to the system keychain.
 */
function AssistantStep({ number, onNext }: { number: number; onNext: () => void }) {
  const settings = useSettings();
  const save = useSaveSetting();
  const saveKey = useSaveKey();
  const [choice, setChoice] = useState<AiProvider | null>(settings.aiProvider);
  const [key, setKey] = useState("");
  const needsKey = choice !== null && PROVIDERS[choice].needsKey;

  const finish = () => {
    if (choice !== settings.aiProvider) {
      save("aiProvider", choice);
      save("aiModel", null);
      save("aiBaseUrl", null);
    }
    if (choice && needsKey && key.trim()) saveKey.mutate({ provider: choice, key });
    onNext();
  };
  useEnter(finish);

  // The letters pick an answer, except while a key is being typed.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.target instanceof HTMLInputElement) return;
      const match = ASSISTANT_CHOICES.find((c) => c.key.toLowerCase() === e.key.toLowerCase());
      if (match) setChoice(match.value);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Question
      number={number}
      title="Would you like an assistant?"
      detail="Optional. Connect an AI model and you can ask kinlo about your people. What you ask is sent to the provider you pick, and nowhere else."
    >
      <div role="radiogroup" aria-label="Assistant" className="grid max-w-[520px] grid-cols-2 gap-2">
        {ASSISTANT_CHOICES.map((option) => {
          const selected = choice === option.value;
          return (
            <button
              key={option.key}
              role="radio"
              aria-checked={selected}
              onClick={() => setChoice(option.value)}
              className={`flex items-center gap-3 rounded-[10px] border px-3 py-2 text-left transition-colors duration-200 ${
                option.value === null ? "col-span-2" : ""
              } ${selected ? "border-[var(--fg)] bg-control" : "border-hairline bg-control hover:bg-control-hover"}`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] border text-xs font-semibold ${
                  selected ? "border-[var(--fg)] bg-fg text-bg" : "border-hairline text-muted"
                }`}
              >
                {option.key}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-medium">{option.label}</span>
                <span className="block text-sm text-muted">{option.detail}</span>
              </span>
            </button>
          );
        })}
      </div>
      {needsKey && (
        <div className="mt-4 max-w-[520px]">
          <input
            aria-label="API key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={`Paste your ${PROVIDERS[choice].label} key, or add it later`}
            className="w-full border-b border-hairline bg-transparent pb-2 text-md outline-none transition-colors duration-200 placeholder:text-subtle focus:border-[var(--fg)]"
          />
          <p className="mt-2 text-sm text-subtle">Kept in your system's keychain, never in kinlo's own files.</p>
        </div>
      )}
      <div className="mt-6 flex items-center gap-3">
        <Button variant="primary" onClick={finish} className="!h-9 !px-4">
          {choice ? "OK" : "Skip"} <Check size={15} strokeWidth={1.75} />
        </Button>
        <EnterHint />
      </div>
    </Question>
  );
}

interface Incoming {
  file: string;
  rows: ImportRow[];
}

/**
 * Optional: bring contacts in from a file. The file is only read here. The people are
 * added at the end, once it is known which side of kinlo they belong on.
 */
function PeopleStep({
  number,
  incoming,
  setIncoming,
  onNext,
}: {
  number: number;
  incoming: Incoming | null;
  setIncoming: (value: Incoming | null) => void;
  onNext: () => void;
}) {
  const [problem, setProblem] = useState<string | null>(null);
  useEnter(onNext);

  const choose = async () => {
    const result = await chooseContactsFile();
    if (!result) return;
    if ("problem" in result) {
      setProblem(result.problem);
      return;
    }
    setProblem(null);
    setIncoming({ file: result.file, rows: result.rows });
  };

  return (
    <Question
      number={number}
      title="Bring your people with you?"
      detail="Optional. If you have your contacts as a CSV file, from Google Contacts or Outlook for example, kinlo can add them. You can also do this later in Settings."
    >
      {incoming ? (
        <p className="text-md">
          {incoming.rows.length} {incoming.rows.length === 1 ? "person" : "people"} found in{" "}
          <span className="font-medium">{incoming.file}</span>. They will be added when you finish.
        </p>
      ) : (
        problem && (
          <p role="alert" className="text-md">
            {problem}
          </p>
        )
      )}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button onClick={() => void choose()} className="!h-9 !px-4">
          {incoming ? "Choose another file" : "Choose a file"}
        </Button>
        {incoming && (
          <Button variant="ghost" onClick={() => setIncoming(null)} className="!h-9 !px-3">
            Leave it out
          </Button>
        )}
        <Button variant="primary" onClick={onNext} className="!h-9 !px-4">
          {incoming ? "OK" : "Skip"} <Check size={15} strokeWidth={1.75} />
        </Button>
        <EnterHint />
      </div>
    </Question>
  );
}

/** Enter moves on, unless focus is on a button that will handle it itself. */
function useEnter(onEnter: () => void) {
  const handler = useRef(onEnter);
  handler.current = onEnter;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.isComposing) return;
      if (e.target instanceof HTMLButtonElement) return;
      e.preventDefault();
      handler.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function Footer({ index, onBack, onNext }: { index: number; onBack: () => void; onNext: () => void }) {
  const arrow =
    "flex h-8 w-8 items-center justify-center text-fg/80 transition-colors duration-150 hover:bg-control-hover disabled:opacity-30 disabled:hover:bg-transparent";
  return (
    <footer className="relative flex h-14 shrink-0 items-center justify-end px-5">
      <div
        className="absolute inset-x-0 top-0 h-px bg-hairline"
        role="progressbar"
        aria-label="Setup progress"
        aria-valuemin={0}
        aria-valuemax={STEPS.length - 1}
        aria-valuenow={index}
      >
        <motion.div
          className="h-full bg-fg"
          initial={false}
          animate={{ width: `${(index / (STEPS.length - 1)) * 100}%` }}
          transition={{ duration: 0.3, ease }}
        />
      </div>
      <div className="control flex overflow-hidden hover:!bg-control">
        <button aria-label="Previous question" className={arrow} disabled={index === 0} onClick={onBack}>
          <ChevronUp size={16} strokeWidth={1.5} />
        </button>
        <span className="w-px bg-hairline" />
        <button aria-label="Next question" className={arrow} onClick={onNext}>
          <ChevronDown size={16} strokeWidth={1.5} />
        </button>
      </div>
    </footer>
  );
}

const SIDE_COPY: Record<Side, { word: string; line: string }> = {
  personal: { word: "Personal", line: "Family, friends and the little things worth remembering." },
  business: { word: "Business", line: "Leads, clients, follow-ups and a simple deal pipeline." },
};

/**
 * The split screen. Personal on the left in light, Business on the right in dark, and a
 * small "I want both" at the bottom. Whichever you pick bleeds across the window.
 */
function SidesStep({
  number,
  onBack,
  onChoose,
}: {
  number: number;
  onBack: () => void;
  onChoose: (sides: SidesChoice, origin: BleedOrigin) => void;
}) {
  const [hovered, setHovered] = useState<Side | null>(null);
  const [both, setBoth] = useState(false);
  const [chosen, setChosen] = useState(false);
  const refs = { personal: useRef<HTMLButtonElement>(null), business: useRef<HTMLButtonElement>(null) };

  const pick = (side: Side, event: MouseEvent<HTMLButtonElement>) => {
    if (chosen) return;
    setChosen(true);
    // A keyboard "click" has no position, so start from the middle of that half.
    const box = event.currentTarget.getBoundingClientRect();
    const fromPointer = event.clientX !== 0 || event.clientY !== 0;
    onChoose(side, {
      kind: "point",
      x: fromPointer ? event.clientX : box.left + box.width / 2,
      y: fromPointer ? event.clientY : box.top + box.height / 2,
    });
  };

  const pickBoth = useCallback(() => {
    if (chosen) return;
    setBoth(true);
    setChosen(true);
    // Let the tick show for a moment before the window fills.
    window.setTimeout(() => onChoose("both", { kind: "bottom" }), 260);
  }, [chosen, onChoose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft") refs.personal.current?.focus();
      else if (e.key === "ArrowRight") refs.business.current?.focus();
      else if (e.key.toLowerCase() === "b") pickBoth();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickBoth]);

  const half = (side: Side) => {
    const { word, line } = SIDE_COPY[side];
    return (
      <button
        ref={refs[side]}
        // Scopes the colour tokens, so each half is its own theme.
        data-theme={side === "personal" ? "light" : "dark"}
        aria-label={`${word}. ${line}`}
        onClick={(e) => pick(side, e)}
        onMouseEnter={() => setHovered(side)}
        onMouseLeave={() => setHovered(null)}
        onFocus={() => setHovered(side)}
        onBlur={() => setHovered(null)}
        style={{ background: SIDE_COLOR[side], flexGrow: hovered === side ? 1.4 : 1 }}
        className="group relative flex min-w-0 basis-0 flex-col items-center justify-center px-8 text-fg outline-none transition-[flex-grow] duration-500 ease-out"
      >
        <span
          className={`text-xl font-semibold tracking-[-0.02em] transition-transform duration-500 ease-out ${
            hovered === side ? "scale-110" : ""
          }`}
        >
          {word}
        </span>
        <span
          className={`mt-2 max-w-[260px] text-center text-base text-muted transition-opacity duration-300 ${
            hovered && hovered !== side ? "opacity-40" : ""
          }`}
        >
          {line}
        </span>
        <span
          className={`mt-6 inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-hairline px-3 text-sm transition-opacity duration-300 ${
            hovered === side ? "opacity-100" : "opacity-0"
          }`}
        >
          Choose {word.toLowerCase()} <ArrowRight size={14} strokeWidth={1.5} />
        </span>
      </button>
    );
  };

  return (
    <motion.div
      className="relative flex h-full"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.22, ease } }}
    >
      {half("personal")}
      {half("business")}

      {/* Window controls sit over the dark half on Windows and Linux. */}
      <div data-theme="dark" className="absolute inset-x-0 top-0 text-fg">
        <TitleBar />
      </div>

      {/* White text with a difference blend reads dark on the light half and light on the dark one. */}
      <div className="pointer-events-none absolute inset-x-0 top-14 flex flex-col items-center gap-2 text-center text-white mix-blend-difference">
        <span className="flex items-center gap-1.5 text-sm opacity-70">
          {number} <ArrowRight size={13} strokeWidth={1.75} />
        </span>
        <h1 className="text-xl">What will you use kinlo for?</h1>
        <p className="text-base opacity-70">Pick a side. You can change this in Settings.</p>
      </div>

      <button
        onClick={onBack}
        className="absolute left-4 top-12 inline-flex h-7 items-center gap-1 rounded-[8px] px-2 text-sm text-white mix-blend-difference hover:bg-white/10"
      >
        <ChevronUp size={15} strokeWidth={1.5} /> Back
      </button>

      <div className="absolute inset-x-0 bottom-8 flex flex-col items-center gap-3">
        <button
          role="checkbox"
          aria-checked={both}
          onClick={pickBoth}
          data-theme="dark"
          className="inline-flex h-10 items-center gap-2.5 rounded-full border border-white/15 bg-[#1b1b1e] px-4 text-base text-[#f4f4f5] shadow-soft transition-transform duration-200 hover:scale-[1.03]"
        >
          <span
            className={`flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border transition-colors duration-150 ${
              both ? "border-white bg-white text-black" : "border-white/40"
            }`}
          >
            {both && <Check size={13} strokeWidth={2.5} />}
          </span>
          I want both
        </button>
        <span className="text-xs text-white mix-blend-difference opacity-60">
          ← → to move · Enter to choose · B for both
        </span>
      </div>
    </motion.div>
  );
}
