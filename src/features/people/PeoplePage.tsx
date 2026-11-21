import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Archive, Clock, Plus, Search, SearchX, Tag as TagIcon, Users, X } from "lucide-react";
import { useSide } from "@/app/settings";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Chip, ToggleChip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/Menu";
import { Page, PageHeader } from "@/components/ui/Page";
import { Segmented } from "@/components/ui/Segmented";
import { overdueDays } from "@/data/contacts";
import { useContactCount, useContacts, useTags } from "@/data/hooks";
import type { Contact, ContactFilter } from "@/data/types";
import { relativeDay } from "@/lib/dates";
import { ease } from "@/lib/motion";
import { useDebounced } from "@/lib/useDebounced";
import { EMPTY_PEOPLE_FILTER, useUI } from "@/store/ui";
import { sideLabels } from "./labels";
import { ManageTagsDialog } from "./ManageTagsDialog";

export function PeoplePage() {
  const filter = useUI((s) => s.peopleFilter);
  const setFilter = useUI((s) => s.setPeopleFilter);
  const openForm = useUI((s) => s.openContactForm);
  const search = useDebounced(filter.search, 150);
  const side = useSide();
  const [managingTags, setManagingTags] = useState(false);

  const query: ContactFilter = useMemo(
    () => ({
      search: search.trim() || undefined,
      side,
      business: side === "business" && filter.business !== "all" ? filter.business : undefined,
      tagId: filter.tagId ?? undefined,
      overdueOnly: filter.overdueOnly || undefined,
      includeArchived: filter.includeArchived || undefined,
    }),
    [search, side, filter.business, filter.tagId, filter.overdueOnly, filter.includeArchived],
  );

  const { data: contacts, isPending } = useContacts(query);
  const { data: total = 0 } = useContactCount(side);
  const { data: tags = [] } = useTags();
  const activeTag = tags.find((t) => t.id === filter.tagId);

  const filtering =
    !!search.trim() ||
    (side === "business" && filter.business !== "all") ||
    !!filter.tagId ||
    filter.overdueOnly ||
    filter.includeArchived;
  const nobody =
    side === "business" ? "No business contacts yet. Add your first lead or client." : "Nobody here yet. Add your first person.";
  const nobodyYet = total === 0 && !filter.includeArchived && !isPending;

  return (
    <Page>
      <PageHeader
        title="People"
        subtitle={total > 0 ? `${total} ${total === 1 ? "person" : "people"}` : undefined}
        actions={
          <Button variant="primary" onClick={() => openForm()}>
            <Plus size={15} strokeWidth={1.5} /> Add person
          </Button>
        }
      />

      {nobodyYet ? (
        <EmptyState
          icon={Users}
          title={nobody}
          action={
            <Button variant="primary" onClick={() => openForm()}>
              Add person
            </Button>
          }
        />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label className="control flex h-8 min-w-[200px] flex-1 items-center gap-2 px-2.5 focus-within:border-[var(--ring)]">
              <Search size={14} strokeWidth={1.5} className="shrink-0 text-muted" />
              <input
                value={filter.search}
                onChange={(e) => setFilter({ search: e.target.value })}
                placeholder="Search names, companies, notes"
                aria-label="Search people"
                className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-subtle"
              />
              {filter.search && (
                <button
                  aria-label="Clear search"
                  onClick={() => setFilter({ search: "" })}
                  className="flex h-5 w-5 items-center justify-center rounded-full text-muted hover:bg-control-hover hover:text-fg"
                >
                  <X size={12} strokeWidth={1.75} />
                </button>
              )}
            </label>

            {side === "business" && (
              <Segmented
                label="Kind"
                value={filter.business}
                onChange={(business) => setFilter({ business })}
                options={[
                  { value: "all", label: "All" },
                  { value: "lead", label: "Leads" },
                  { value: "client", label: "Clients" },
                  { value: "other", label: "Other" },
                ]}
              />
            )}

            <Menu
              trigger={
                <button
                  aria-label={activeTag ? `Tag filter: ${activeTag.name}` : "Tag filter"}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-hairline px-2.5 text-sm transition-colors duration-200 ${
                    activeTag ? "bg-active text-fg" : "bg-control text-muted hover:bg-control-hover hover:text-fg"
                  }`}
                >
                  <TagIcon size={14} strokeWidth={1.5} /> {activeTag ? activeTag.name : "Tag"}
                </button>
              }
            >
              {tags.length === 0 ? (
                <div className="px-2 py-1.5 text-sm text-subtle">No tags yet. Add them when editing a person.</div>
              ) : (
                <>
                  <MenuItem onSelect={() => setFilter({ tagId: null })} checked={!filter.tagId}>
                    Any tag
                  </MenuItem>
                  <MenuSeparator />
                  {tags.map((tag) => (
                    <MenuItem key={tag.id} onSelect={() => setFilter({ tagId: tag.id })} checked={filter.tagId === tag.id}>
                      {tag.name} <span className="text-subtle">{tag.contact_count}</span>
                    </MenuItem>
                  ))}
                  <MenuSeparator />
                  <MenuItem onSelect={() => setManagingTags(true)}>Manage tags</MenuItem>
                </>
              )}
            </Menu>

            <ToggleChip pressed={filter.overdueOnly} onPressedChange={(overdueOnly) => setFilter({ overdueOnly })}>
              <Clock size={14} strokeWidth={1.5} /> Overdue
            </ToggleChip>
            <ToggleChip pressed={filter.includeArchived} onPressedChange={(includeArchived) => setFilter({ includeArchived })}>
              <Archive size={14} strokeWidth={1.5} /> Archived
            </ToggleChip>
          </div>

          {contacts && contacts.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title={filtering ? "Nobody matches that." : nobody}
              action={
                filtering ? (
                  <Button onClick={() => setFilter(EMPTY_PEOPLE_FILTER)}>Clear filters</Button>
                ) : (
                  <Button variant="primary" onClick={() => openForm()}>
                    Add person
                  </Button>
                )
              }
            />
          ) : (
            <ul className="glass divide-y divide-hairline overflow-hidden" aria-label="People">
              <AnimatePresence initial={false}>
                {contacts?.map((contact) => (
                  <motion.li
                    key={contact.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2, ease }}
                  >
                    <ContactRow contact={contact} />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </>
      )}
      <ManageTagsDialog open={managingTags} onOpenChange={setManagingTags} />
    </Page>
  );
}

function ContactRow({ contact }: { contact: Contact }) {
  const overdue = overdueDays(contact);
  const work = [contact.role, contact.company].filter(Boolean).join(" at ");

  return (
    <Link
      to={`/people/${contact.id}`}
      className={`flex items-center gap-3 px-4 py-2.5 transition-colors duration-150 hover:bg-glass-hover focus-visible:bg-glass-hover focus-visible:outline-none ${
        contact.archived ? "opacity-60" : ""
      }`}
    >
      <Avatar name={contact.name} contactId={contact.id} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-base font-medium">{contact.name}</span>
          {contact.nickname && <span className="truncate text-sm text-subtle">{contact.nickname}</span>}
        </div>
        <div className="truncate text-sm text-muted">{work || sideLabels(contact).join(" · ")}</div>
      </div>
      <div className="hidden shrink-0 items-center gap-1 md:flex">
        {contact.tags.slice(0, 3).map((tag) => (
          <Chip key={tag.id}>{tag.name}</Chip>
        ))}
        {contact.tags.length > 3 && <span className="text-xs text-subtle">+{contact.tags.length - 3}</span>}
      </div>
      <div className="w-[132px] shrink-0 text-right text-sm">
        {contact.archived ? (
          <span className="text-subtle">Archived</span>
        ) : overdue > 0 ? (
          <Chip tone="strong">
            {overdue} {overdue === 1 ? "day" : "days"} overdue
          </Chip>
        ) : contact.last_contacted_at ? (
          <span className="text-muted">{relativeDay(contact.last_contacted_at)}</span>
        ) : (
          <span className="text-subtle">No contact yet</span>
        )}
      </div>
    </Link>
  );
}
