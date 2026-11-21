import { useState } from "react";
import type { FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSettings } from "@/app/settings";
import { Button } from "@/components/ui/Button";
import { DateTimeField } from "@/components/ui/DateTimeField";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { PersonPicker } from "@/components/ui/PersonPicker";
import { getDeal } from "@/data";
import { keys, useCreateDeal, useStages, useUpdateDeal } from "@/data/hooks";
import type { Deal } from "@/data/types";
import { useUI } from "@/store/ui";

/** The one dialog for adding and editing a deal. Opened from anywhere through the UI store. */
export function DealFormDialog() {
  const { open, dealId, contactId, stageId } = useUI((s) => s.dealForm);
  const close = useUI((s) => s.closeDealForm);
  const { data: deal } = useQuery({
    queryKey: [...keys.deals, "detail", dealId],
    queryFn: () => getDeal(dealId!),
    enabled: !!dealId,
  });
  const { data: stages = [] } = useStages();
  const ready = stages.length > 0 && (!dealId || !!deal);

  return (
    <Modal open={open && ready} onOpenChange={(next) => !next && close()} title={dealId ? "Edit deal" : "Add deal"} width={480}>
      <DealForm
        key={dealId ?? `new-${contactId ?? ""}-${stageId ?? ""}`}
        deal={dealId ? (deal ?? null) : null}
        startContactId={contactId}
        startStageId={stageId ?? stages[0]?.id ?? ""}
        onDone={close}
      />
    </Modal>
  );
}

/** "4,800", "4800.50" and "4 800" are all fine. Returns undefined for something that is not an amount. */
export function parseAmount(input: string): number | null | undefined {
  const cleaned = input.replace(/[\s,]/g, "");
  if (cleaned === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return undefined;
  return Number(cleaned);
}

function DealForm({
  deal,
  startContactId,
  startStageId,
  onDone,
}: {
  deal: Deal | null;
  startContactId: string | null;
  startStageId: string;
  onDone: () => void;
}) {
  const { defaultCurrency } = useSettings();
  const { data: stages = [] } = useStages();
  const [title, setTitle] = useState(deal?.title ?? "");
  const [contactId, setContactId] = useState<string | null>(deal ? deal.contact_id : startContactId);
  const [stageId, setStageId] = useState(deal?.stage_id ?? startStageId);
  const [amount, setAmount] = useState(deal?.value != null ? String(deal.value) : "");
  const [currency, setCurrency] = useState(deal?.currency ?? defaultCurrency);
  const [expectedClose, setExpectedClose] = useState<string | null>(deal?.expected_close ?? null);
  const [notes, setNotes] = useState(deal?.notes ?? "");
  const [error, setError] = useState<{ title?: string; contact?: string; amount?: string; currency?: string; save?: string }>({});
  const create = useCreateDeal();
  const update = useUpdateDeal();
  const busy = create.isPending || update.isPending;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const problems: typeof error = {};
    const value = parseAmount(amount);
    if (!title.trim()) problems.title = "Give the deal a name.";
    if (!contactId) problems.contact = "Choose who the deal is with.";
    if (value === undefined) problems.amount = "Enter an amount such as 4800 or 4,800.50.";
    if (!/^[A-Za-z]{3}$/.test(currency.trim())) problems.currency = "Use a three-letter code such as USD.";
    if (Object.keys(problems).length) return setError(problems);

    const fields = {
      title,
      contact_id: contactId!,
      value: value ?? null,
      currency: currency.trim().toUpperCase(),
      expected_close: expectedClose,
      notes,
    };
    try {
      if (deal) {
        await update.mutateAsync({ id: deal.id, patch: fields, stageId: stageId !== deal.stage_id ? stageId : undefined });
      } else {
        await create.mutateAsync({ ...fields, stage_id: stageId });
      }
      onDone();
    } catch (cause) {
      setError({ save: cause instanceof Error ? cause.message : "That did not save. Try again." });
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field label="Deal" error={error.title}>
        {(id) => (
          <Input
            id={id}
            autoFocus
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setError((prev) => ({ ...prev, title: undefined }));
            }}
            placeholder="Website redesign, yearly retainer"
          />
        )}
      </Field>

      <Field label="With" error={error.contact}>
        {(id) => (
          <PersonPicker
            id={id}
            value={contactId}
            onChange={(next) => {
              setContactId(next);
              setError((prev) => ({ ...prev, contact: undefined }));
            }}
            side="business"
            placeholder="Search your business contacts"
          />
        )}
      </Field>

      <div className="grid grid-cols-[1fr_96px] gap-3">
        <Field label="Value" error={error.amount}>
          {(id) => (
            <Input
              id={id}
              inputMode="decimal"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setError((prev) => ({ ...prev, amount: undefined }));
              }}
              placeholder="Optional"
            />
          )}
        </Field>
        <Field label="Currency" error={error.currency}>
          {(id) => (
            <Input
              id={id}
              value={currency}
              maxLength={3}
              onChange={(e) => {
                setCurrency(e.target.value.toUpperCase());
                setError((prev) => ({ ...prev, currency: undefined }));
              }}
            />
          )}
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Stage">
          {(id) => (
            <Select id={id} value={stageId} onChange={(e) => setStageId(e.target.value)}>
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-muted">Expected to close</span>
          <DateTimeField label="Expected to close" value={expectedClose} onChange={setExpectedClose} dateOnly />
        </div>
      </div>

      <Field label="Notes">
        {(id) => <Textarea id={id} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />}
      </Field>

      <div className="-mx-5 -mb-5 mt-1 flex items-center justify-end gap-2 border-t border-hairline px-5 py-3">
        {error.save && <p className="mr-auto text-sm text-danger">{error.save}</p>}
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={busy}>
          {deal ? "Save" : "Add deal"}
        </Button>
      </div>
    </form>
  );
}
