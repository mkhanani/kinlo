import { CalendarDays, Mail, MessageSquare, NotebookPen, Phone } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { BusinessKind, Contact, InteractionType, Side } from "@/data/types";

export const SIDE_LABEL: Record<Side, string> = {
  personal: "Personal",
  business: "Business",
};

export const BUSINESS_LABEL: Record<BusinessKind, string> = {
  lead: "Lead",
  client: "Client",
  other: "Other",
};

/** Short labels for where a person sits: "Personal", "Client", or both. */
export function sideLabels(contact: Pick<Contact, "personal" | "business">): string[] {
  const labels: string[] = [];
  if (contact.personal) labels.push("Personal");
  if (contact.business) labels.push(contact.business === "other" ? "Business" : BUSINESS_LABEL[contact.business]);
  return labels;
}

export const INTERACTION: Record<InteractionType, { label: string; icon: LucideIcon }> = {
  call: { label: "Call", icon: Phone },
  message: { label: "Message", icon: MessageSquare },
  meeting: { label: "Meeting", icon: CalendarDays },
  email: { label: "Email", icon: Mail },
  note: { label: "Note", icon: NotebookPen },
};

export const KEEP_IN_TOUCH: { days: number; label: string }[] = [
  { days: 7, label: "Every week" },
  { days: 14, label: "Every 2 weeks" },
  { days: 30, label: "Every month" },
  { days: 90, label: "Every 3 months" },
  { days: 182, label: "Every 6 months" },
  { days: 365, label: "Every year" },
];

export function keepInTouchLabel(days: number | null): string | null {
  if (days == null) return null;
  return KEEP_IN_TOUCH.find((o) => o.days === days)?.label ?? `Every ${days} days`;
}
