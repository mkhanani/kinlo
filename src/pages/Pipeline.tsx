import { Page, PageHeader } from "@/components/ui/Page";

const stages = ["Lead", "Talking", "Proposal", "Won", "Lost"];

export function PipelinePage() {
  return (
    <Page>
      <PageHeader title="Pipeline" subtitle="Deals by stage." />
      <div className="grid grid-cols-5 gap-3">
        {stages.map((s) => (
          <div key={s} className="glass flex min-h-[320px] flex-col p-3">
            <div className="mb-3 flex items-center justify-between px-1 text-sm">
              <span className="font-medium">{s}</span>
              <span className="text-subtle">0</span>
            </div>
            <div className="flex flex-1 items-center justify-center rounded-[10px] border border-dashed border-hairline text-xs text-subtle">
              No deals
            </div>
          </div>
        ))}
      </div>
    </Page>
  );
}
