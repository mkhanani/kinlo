import { Bell } from "lucide-react";
import { Page, PageHeader } from "@/components/ui/Page";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";

export function RemindersPage() {
  return (
    <Page>
      <PageHeader title="Reminders" />
      <EmptyState icon={Bell} title="No reminders. Add one when something needs doing." action={<Button>Add reminder</Button>} />
    </Page>
  );
}
