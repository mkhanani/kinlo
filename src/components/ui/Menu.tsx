import type { ReactNode } from "react";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { Check } from "lucide-react";

/** Dropdown menu on a floating glass surface. */
export function Menu({
  trigger,
  children,
  align = "end",
  afterClose,
}: {
  trigger: ReactNode;
  children: ReactNode;
  align?: "start" | "end";
  /**
   * For menus whose items move the cursor somewhere else on purpose. When set, the
   * cursor is not put back on the trigger as the menu closes; this is called instead,
   * once the menu has let go of it.
   */
  afterClose?: () => void;
}) {
  return (
    <Dropdown.Root>
      <Dropdown.Trigger asChild>{trigger}</Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          align={align}
          sideOffset={6}
          onCloseAutoFocus={
            afterClose
              ? (event) => {
                  event.preventDefault();
                  afterClose();
                }
              : undefined
          }
          className="menu-surface glass-float z-50 max-h-[320px] min-w-[180px] overflow-y-auto p-1"
        >
          {children}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}

const item =
  "flex h-8 cursor-default items-center gap-2 rounded-[8px] px-2 text-base outline-none data-[highlighted]:bg-control-hover";

export function MenuItem({
  children,
  onSelect,
  danger,
  checked,
}: {
  children: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  checked?: boolean;
}) {
  return (
    <Dropdown.Item onSelect={onSelect} className={`${item} ${danger ? "text-danger" : "text-fg"}`}>
      <span className="flex flex-1 items-center gap-2">{children}</span>
      {checked && <Check size={14} strokeWidth={1.5} className="text-muted" />}
    </Dropdown.Item>
  );
}

export function MenuSeparator() {
  return <Dropdown.Separator className="my-1 h-px bg-hairline" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <Dropdown.Label className="px-2 pb-1 pt-1.5 text-xs text-subtle">{children}</Dropdown.Label>;
}
