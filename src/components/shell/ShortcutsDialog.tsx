import { SHORTCUTS } from "@/app/shortcuts";
import { useSettings, useSide } from "@/app/settings";
import { Modal } from "@/components/ui/Modal";
import { modKey } from "@/lib/platform";
import { useUI } from "@/store/ui";

/** The list of keyboard shortcuts. Opens with Ctrl or Cmd + /. */
export function ShortcutsDialog() {
  const open = useUI((s) => s.shortcutsOpen);
  const setOpen = useUI((s) => s.setShortcutsOpen);
  const side = useSide();
  const { sides } = useSettings();

  return (
    <Modal open={open} onOpenChange={setOpen} title="Keyboard shortcuts" width={440}>
      <div className="flex flex-col gap-5">
        {SHORTCUTS.map(({ group, items }) => (
          <section key={group}>
            <h3 className="mb-1.5 text-xs font-medium text-subtle">{group}</h3>
            <dl className="flex flex-col">
              {items
                .filter((item) => (!item.business || side === "business") && (!item.bothSides || sides === "both"))
                .map((item) => (
                  <div key={item.label} className="flex h-8 items-center justify-between gap-4">
                    <dt className="text-base">{item.label}</dt>
                    <dd className="flex shrink-0 gap-1">
                      {item.keys.map((key) => (
                        <kbd
                          key={key}
                          className="flex h-6 min-w-6 items-center justify-center rounded-[6px] border border-hairline bg-control px-1.5 font-sans text-xs text-muted"
                        >
                          {key === "mod" ? modKey : key}
                        </kbd>
                      ))}
                    </dd>
                  </div>
                ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  );
}
