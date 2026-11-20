import { Users, Plus } from "lucide-react";
import { Page, PageHeader } from "@/components/ui/Page";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";

export function PeoplePage() {
  return (
    <Page>
      <PageHeader
        title="People"
        actions={
          <Button variant="primary">
            <Plus size={15} strokeWidth={1.5} /> Add person
          </Button>
        }
      />
      <EmptyState
        icon={Users}
        title="Nobody here yet. Add your first person."
        action={<Button variant="primary">Add person</Button>}
      />
    </Page>
  );
}
