import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, X } from "lucide-react";
import { useSettings, useSide } from "@/app/settings";
import { Avatar } from "@/components/ui/Avatar";
import { ToggleChip } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Segmented } from "@/components/ui/Segmented";
import { TagInput } from "@/components/ui/TagInput";
import { useAvatars, useContact, useCreateContact, useTags, useUpdateContact } from "@/data/hooks";
import { BUSINESS_KINDS } from "@/data/types";
import type { BusinessKind, Contact, ContactInput, LabeledValue, Side } from "@/data/types";
import { buildBirthday, MONTHS, parseBirthday } from "@/lib/dates";
import { toThumbnail } from "@/lib/image";
import { useUI } from "@/store/ui";
import { BUSINESS_LABEL, KEEP_IN_TOUCH } from "./labels";

interface FormState {
  name: string;
  nickname: string;
  personal: boolean;
  /** On the business side. `businessKind` says as what. */
  business: boolean;
  businessKind: BusinessKind;
  /** undefined: leave the photo as it is. null: remove it. A data URL: use this one. */
  avatar: string | null | undefined;
  company: string;
  role: string;
  emails: LabeledValue[];
  phones: LabeledValue[];
  socials: LabeledValue[];
  location: string;
  birthMonth: string;
  birthDay: string;
  birthYear: string;
  how_we_met: string;
  keep: string;
  tags: string[];
  notes: string;
}

const blank = (): LabeledValue => ({ label: "", value: "" });
const orBlank = (list: LabeledValue[]) => (list.length ? list.map((i) => ({ label: i.label ?? "", value: i.value })) : [blank()]);

function toForm(contact: Contact | null, side: Side): FormState {
  const birthday = parseBirthday(contact?.birthday);
  return {
    name: contact?.name ?? "",
    nickname: contact?.nickname ?? "",
    // A new person starts on the side you are looking at.
    personal: contact ? contact.personal : side === "personal",
    business: contact ? contact.business !== null : side === "business",
    businessKind: contact?.business ?? "lead",
    avatar: undefined,
    company: contact?.company ?? "",
    role: contact?.role ?? "",
    emails: orBlank(contact?.emails ?? []),
    phones: orBlank(contact?.phones ?? []),
    socials: orBlank(contact?.socials ?? []),
    location: contact?.location ?? "",
    birthMonth: birthday ? String(birthday.month) : "",
    birthDay: birthday ? String(birthday.day) : "",
    birthYear: birthday?.year != null ? String(birthday.year) : "",
    how_we_met: contact?.how_we_met ?? "",
    keep: contact?.keep_in_touch_days != null ? String(contact.keep_in_touch_days) : "",
    tags: contact?.tags.map((t) => t.name) ?? [],
    notes: contact?.notes ?? "",
  };
}

/** The one dialog for adding and editing a person. Opened from anywhere through the UI store. */
export function ContactFormDialog() {
  const { open, contactId } = useUI((s) => s.contactForm);
  const close = useUI((s) => s.closeContactForm);
  const { data: contact } = useContact(contactId ?? undefined);
  const ready = !contactId || !!contact;

  return (
    <Modal
      open={open && ready}
      onOpenChange={(next) => !next && close()}
      title={contactId ? "Edit person" : "Add person"}
      width={560}
    >
      {/* Keyed so the form starts fresh each time it opens for someone else. */}
      <ContactForm key={contactId ?? "new"} contact={contactId ? (contact ?? null) : null} onDone={close} />
    </Modal>
  );
}

function ContactForm({ contact, onDone }: { contact: Contact | null; onDone: () => void }) {
  const side = useSide();
  const { sides } = useSettings();
  const [form, setForm] = useState<FormState>(() => toForm(contact, side));
  const [error, setError] = useState<{ name?: string; birthday?: string; side?: string; photo?: string; save?: string }>({});
  const fileInput = useRef<HTMLInputElement>(null);
  const { data: tags = [] } = useTags();
  const create = useCreateContact();
  const update = useUpdateContact();
  const navigate = useNavigate();
  const busy = create.isPending || update.isPending;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => setError((e) => ({ ...e, name: undefined })), [form.name]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const problems: typeof error = {};
    if (!form.name.trim()) problems.name = "Add a name.";

    const hasBirthday = form.birthMonth || form.birthDay || form.birthYear;
    const birthday = buildBirthday({
      month: form.birthMonth ? Number(form.birthMonth) : null,
      day: form.birthDay ? Number(form.birthDay) : null,
      year: form.birthYear ? Number(form.birthYear) : null,
    });
    if (hasBirthday && !birthday) problems.birthday = "That date does not exist. Month and day are needed, the year is optional.";

    if (!form.personal && !form.business) problems.side = "Choose Personal, Business, or both.";

    if (problems.name || problems.birthday || problems.side) {
      setError(problems);
      return;
    }

    const input: ContactInput = {
      name: form.name,
      nickname: form.nickname,
      personal: form.personal,
      business: form.business ? form.businessKind : null,
      company: form.company,
      role: form.role,
      emails: form.emails,
      phones: form.phones,
      socials: form.socials,
      location: form.location,
      birthday,
      how_we_met: form.how_we_met,
      keep_in_touch_days: form.keep ? Number(form.keep) : null,
      notes: form.notes,
    };

    try {
      if (contact) {
        await update.mutateAsync({ id: contact.id, patch: input, tags: form.tags, avatar: form.avatar });
      } else {
        const created = await create.mutateAsync({ input, tags: form.tags, avatar: form.avatar });
        navigate(`/people/${created.id}`);
      }
      onDone();
    } catch (cause) {
      setError({ save: cause instanceof Error ? cause.message : "That did not save. Try again." });
    }
  };

  const { data: avatars } = useAvatars();
  const hasPhoto = !!contact && !!avatars?.[contact.id];

  const keepOptions = [...KEEP_IN_TOUCH];
  if (form.keep && !keepOptions.some((o) => String(o.days) === form.keep)) {
    keepOptions.push({ days: Number(form.keep), label: `Every ${form.keep} days` });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <div className="flex items-center gap-4">
        <Avatar name={form.name || "?"} contactId={contact?.id} image={form.avatar} size={64} />
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={() => fileInput.current?.click()}>
              Choose photo
            </Button>
            {(form.avatar || (form.avatar === undefined && contact && hasPhoto)) && (
              <Button type="button" size="sm" variant="ghost" onClick={() => set("avatar", null)}>
                Remove
              </Button>
            )}
          </div>
          {error.photo ? (
            <p className="text-xs text-danger">{error.photo}</p>
          ) : (
            <p className="text-xs text-subtle">Optional. Stored only on this computer.</p>
          )}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          aria-label="Photo"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            try {
              set("avatar", await toThumbnail(file));
              setError((prev) => ({ ...prev, photo: undefined }));
            } catch (cause) {
              setError((prev) => ({ ...prev, photo: cause instanceof Error ? cause.message : "That image could not be read." }));
            }
          }}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Name" error={error.name} className="col-span-2">
          {(id) => (
            <Input
              id={id}
              autoFocus
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Full name"
              aria-invalid={!!error.name}
            />
          )}
        </Field>
        <Field label="Nickname" className={sides === "both" ? "" : "col-span-2"}>
          {(id) => <Input id={id} value={form.nickname} onChange={(e) => set("nickname", e.target.value)} />}
        </Field>
        {sides === "both" && (
          <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-muted">Shows on</span>
              <div className="flex gap-2">
                <ToggleChip
                  pressed={form.personal}
                  onPressedChange={(on) => {
                    set("personal", on);
                    setError((prev) => ({ ...prev, side: undefined }));
                  }}
                >
                  Personal
                </ToggleChip>
                <ToggleChip
                  pressed={form.business}
                  onPressedChange={(on) => {
                    set("business", on);
                    setError((prev) => ({ ...prev, side: undefined }));
                  }}
                >
                  Business
                </ToggleChip>
              </div>
              {error.side && <p className="text-xs text-danger">{error.side}</p>}
          </div>
        )}
        {form.business && sides !== "personal" && (
          <div className="col-span-2 flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">In your work, they are a</span>
            <Segmented
              label="Business kind"
              value={form.businessKind}
              onChange={(kind) => set("businessKind", kind)}
              options={BUSINESS_KINDS.map((k) => ({ value: k, label: BUSINESS_LABEL[k] }))}
            />
          </div>
        )}
        <Field label="Company">
          {(id) => <Input id={id} value={form.company} onChange={(e) => set("company", e.target.value)} />}
        </Field>
        <Field label="Role">
          {(id) => <Input id={id} value={form.role} onChange={(e) => set("role", e.target.value)} />}
        </Field>
      </div>

      <Section title="Reach them">
        <LabeledList
          noun="email"
          type="email"
          placeholder="name@example.com"
          labelPlaceholder="Work, home"
          items={form.emails}
          onChange={(v) => set("emails", v)}
        />
        <LabeledList
          noun="phone"
          type="tel"
          placeholder="Phone number"
          labelPlaceholder="Mobile, office"
          items={form.phones}
          onChange={(v) => set("phones", v)}
        />
        <LabeledList
          noun="social"
          type="text"
          placeholder="Link or handle"
          labelPlaceholder="LinkedIn, Instagram"
          items={form.socials}
          onChange={(v) => set("socials", v)}
        />
        <Field label="Location">
          {(id) => (
            <Input id={id} value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="City, country" />
          )}
        </Field>
      </Section>

      <Section title="About">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-muted">Birthday</span>
          <div className="grid grid-cols-[1fr_72px_88px] gap-2">
            <Select aria-label="Birthday month" value={form.birthMonth} onChange={(e) => set("birthMonth", e.target.value)}>
              <option value="">Month</option>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </Select>
            <Input
              aria-label="Birthday day"
              inputMode="numeric"
              placeholder="Day"
              value={form.birthDay}
              onChange={(e) => set("birthDay", e.target.value.replace(/\D/g, "").slice(0, 2))}
            />
            <Input
              aria-label="Birthday year"
              inputMode="numeric"
              placeholder="Year"
              value={form.birthYear}
              onChange={(e) => set("birthYear", e.target.value.replace(/\D/g, "").slice(0, 4))}
            />
          </div>
          {error.birthday ? (
            <p className="text-xs text-danger">{error.birthday}</p>
          ) : (
            <p className="text-xs text-subtle">The year is optional.</p>
          )}
        </div>
        <Field label="How you met">
          {(id) => <Input id={id} value={form.how_we_met} onChange={(e) => set("how_we_met", e.target.value)} />}
        </Field>
        <Field label="Keep in touch" hint="kinlo will tell you when it has been longer than this.">
          {(id) => (
            <Select id={id} value={form.keep} onChange={(e) => set("keep", e.target.value)}>
              <option value="">No reminder</option>
              {keepOptions.map((o) => (
                <option key={o.days} value={o.days}>
                  {o.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Tags" hint="Press Enter after each one.">
          {(id) => <TagInput id={id} value={form.tags} onChange={(v) => set("tags", v)} suggestions={tags.map((t) => t.name)} />}
        </Field>
        <Field label="Notes">
          {(id) => (
            <Textarea
              id={id}
              rows={4}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Anything worth remembering"
            />
          )}
        </Field>
      </Section>

      <div className="sticky -bottom-5 -mx-5 -mb-5 flex items-center justify-end gap-2 border-t border-hairline bg-[var(--float-solid)] px-5 py-3">
        {error.save && <p className="mr-auto text-sm text-danger">{error.save}</p>}
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={busy}>
          {contact ? "Save" : "Add person"}
        </Button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3 border-t border-hairline pt-4">
      <legend className="float-left mb-1 w-full text-xs font-medium uppercase tracking-[0.06em] text-subtle">{title}</legend>
      {children}
    </fieldset>
  );
}

/** A list of values with optional labels: emails, phones, socials. */
function LabeledList({
  noun,
  type,
  placeholder,
  labelPlaceholder,
  items,
  onChange,
}: {
  noun: string;
  type: string;
  placeholder: string;
  labelPlaceholder: string;
  items: LabeledValue[];
  onChange: (items: LabeledValue[]) => void;
}) {
  const title = noun[0]!.toUpperCase() + noun.slice(1);
  const patch = (index: number, change: Partial<LabeledValue>) =>
    onChange(items.map((item, i) => (i === index ? { ...item, ...change } : item)));

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-muted">{title}</span>
      {items.map((item, index) => (
        <div key={index} className="grid grid-cols-[1fr_150px_28px] gap-2">
          <Input
            type={type}
            aria-label={items.length > 1 ? `${title} ${index + 1}` : title}
            placeholder={placeholder}
            value={item.value}
            onChange={(e) => patch(index, { value: e.target.value })}
          />
          <Input
            aria-label={`${title} label${items.length > 1 ? ` ${index + 1}` : ""}`}
            placeholder={labelPlaceholder}
            value={item.label ?? ""}
            onChange={(e) => patch(index, { label: e.target.value })}
          />
          <button
            type="button"
            aria-label={`Remove ${noun}`}
            disabled={items.length === 1 && !item.value && !item.label}
            onClick={() => onChange(items.length === 1 ? [blank()] : items.filter((_, i) => i !== index))}
            className="flex h-8 w-7 items-center justify-center rounded-[8px] text-subtle hover:bg-control hover:text-fg disabled:opacity-0"
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, blank()])}
        className="flex h-7 w-fit items-center gap-1 rounded-[8px] px-1.5 text-sm text-muted hover:bg-control hover:text-fg"
      >
        <Plus size={13} strokeWidth={1.5} /> Add {noun}
      </button>
    </div>
  );
}
