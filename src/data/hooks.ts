import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import * as data from "./index";
import type { ReminderFilter } from "./reminders";
import type {
  ContactFilter,
  ContactInput,
  ContactPatch,
  Interaction,
  InteractionInput,
  Reminder,
  ReminderInput,
  Side,
} from "./types";

/**
 * React bindings for the data layer. Screens read with these hooks and write with the
 * mutations, which refresh everything the write could have changed.
 */
export const keys = {
  contacts: ["contacts"] as const,
  contactList: (filter: ContactFilter) => ["contacts", "list", filter] as const,
  contact: (id: string) => ["contacts", "detail", id] as const,
  contactSearch: (query: string, side?: Side) => ["contacts", "search", side ?? "all", query] as const,
  avatars: ["avatars"] as const,
  tags: ["tags"] as const,
  interactions: (contactId: string) => ["interactions", contactId] as const,
  reminders: ["reminders"] as const,
  contactReminders: (contactId: string) => ["reminders", "contact", contactId] as const,
  deals: ["deals"] as const,
  contactDeals: (contactId: string) => ["deals", "contact", contactId] as const,
  stages: ["stages"] as const,
};

export function useContacts(filter: ContactFilter = {}) {
  return useQuery({
    queryKey: keys.contactList(filter),
    queryFn: () => data.listContacts(filter),
    // Keep the old list on screen while a new search runs, so typing does not flicker.
    placeholderData: keepPreviousData,
  });
}

export function useContact(id: string | undefined) {
  return useQuery({
    queryKey: keys.contact(id ?? ""),
    queryFn: () => data.getContact(id!),
    enabled: !!id,
  });
}

export function useContactSearch(query: string, side?: Side) {
  return useQuery({
    queryKey: keys.contactSearch(query, side),
    queryFn: () => data.searchContacts(query, 8, side),
    enabled: query.trim().length > 0,
    placeholderData: keepPreviousData,
  });
}

export function useContactCount(side?: Side) {
  return useQuery({ queryKey: [...keys.contacts, "count", side ?? "all"], queryFn: () => data.countContacts(side) });
}

/** Every photo, keyed by contact id. One query, cached until a photo changes. */
export function useAvatars() {
  return useQuery({ queryKey: keys.avatars, queryFn: data.loadAvatars });
}

/** Sets a person's photo, or removes it when `image` is null. */
export function useSetAvatar() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ contactId, image }: { contactId: string; image: string | null }) =>
      image ? data.setAvatar(contactId, image) : data.removeAvatar(contactId),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.avatars }),
  });
}

export function useTags() {
  return useQuery({ queryKey: keys.tags, queryFn: data.listTags });
}

export function useInteractions(contactId: string) {
  return useQuery({ queryKey: keys.interactions(contactId), queryFn: () => data.listInteractions(contactId) });
}

export function useContactReminders(contactId: string) {
  return useQuery({
    queryKey: keys.contactReminders(contactId),
    queryFn: () => data.listReminders({ contactId, status: "open" }),
  });
}

export function useContactDeals(contactId: string) {
  return useQuery({ queryKey: keys.contactDeals(contactId), queryFn: () => data.listDeals({ contactId }) });
}

export function useStages() {
  return useQuery({ queryKey: keys.stages, queryFn: data.listStages });
}

/** Saves a new person together with their tags. */
export function useCreateContact() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ input, tags, avatar }: { input: ContactInput; tags: string[]; avatar?: string | null }) => {
      const contact = await data.createContact(input);
      if (tags.length) await data.setContactTags(contact.id, tags);
      if (avatar) await data.setAvatar(contact.id, avatar);
      return contact;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.avatars });
      void client.invalidateQueries({ queryKey: keys.contacts });
      void client.invalidateQueries({ queryKey: keys.tags });
    },
  });
}

export function useUpdateContact() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
      tags,
      avatar,
    }: {
      id: string;
      patch: ContactPatch;
      tags?: string[];
      /** A new photo, null to remove it, or leave out to keep what is there. */
      avatar?: string | null;
    }) => {
      // The contact first: if the patch is refused, tags and photo are left as they were.
      const contact = await data.updateContact(id, patch);
      if (tags) await data.setContactTags(id, tags);
      if (avatar) await data.setAvatar(id, avatar);
      else if (avatar === null) await data.removeAvatar(id);
      return contact;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.avatars });
      void client.invalidateQueries({ queryKey: keys.contacts });
      void client.invalidateQueries({ queryKey: keys.tags });
      // Names appear on reminders and deals, and archiving hides deals.
      void client.invalidateQueries({ queryKey: keys.reminders });
      void client.invalidateQueries({ queryKey: keys.deals });
    },
  });
}

export function useDeleteContact() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => data.deleteContact(id),
    onSuccess: (_result, id) => {
      client.removeQueries({ queryKey: keys.contact(id) });
      client.removeQueries({ queryKey: keys.interactions(id) });
      void client.invalidateQueries({ queryKey: keys.avatars });
      void client.invalidateQueries({ queryKey: keys.contacts });
      void client.invalidateQueries({ queryKey: keys.tags });
      void client.invalidateQueries({ queryKey: keys.reminders });
      void client.invalidateQueries({ queryKey: keys.deals });
    },
  });
}

/** Any change to interactions can move last_contacted_at and the search index. */
function useInteractionMutation<V>(run: (variables: V) => Promise<unknown>, contactIdOf: (variables: V) => string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: (_result, variables) => {
      void client.invalidateQueries({ queryKey: keys.interactions(contactIdOf(variables)) });
      void client.invalidateQueries({ queryKey: keys.contacts });
    },
  });
}

export const useAddInteraction = () =>
  useInteractionMutation(
    (input: InteractionInput) => data.addInteraction(input),
    (input) => input.contact_id,
  );

export const useUpdateInteraction = () =>
  useInteractionMutation(
    ({ interaction, patch }: { interaction: Interaction; patch: Partial<Pick<Interaction, "type" | "happened_at" | "summary">> }) =>
      data.updateInteraction(interaction.id, patch),
    ({ interaction }) => interaction.contact_id,
  );

export const useDeleteInteraction = () =>
  useInteractionMutation(
    (interaction: Interaction) => data.deleteInteraction(interaction.id),
    (interaction) => interaction.contact_id,
  );

/**
 * Today's date in local time, as YYYY-MM-DD. It changes at midnight, so anything keyed on
 * it (what is overdue, what is due today, whose birthday is near) refreshes by itself
 * when the app is left open overnight.
 */
export function useDayKey(): string {
  const read = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const [day, setDay] = useState(read);
  useEffect(() => {
    const timer = setInterval(() => setDay(read()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return day;
}

export function useReminders(filter: ReminderFilter = {}) {
  const day = useDayKey();
  return useQuery({
    queryKey: [...keys.reminders, "list", filter, day],
    queryFn: () => data.listReminders(filter),
    placeholderData: keepPreviousData,
  });
}

export function useOverdueContacts(side: Side) {
  const day = useDayKey();
  return useQuery({
    queryKey: [...keys.contacts, "overdue", side, day],
    queryFn: () => data.listOverdueContacts(undefined, side),
  });
}

export function useUpcomingBirthdays(side: Side) {
  const day = useDayKey();
  return useQuery({
    queryKey: [...keys.contacts, "birthdays", side, day],
    queryFn: () => data.listUpcomingBirthdays(side),
  });
}

export function useOpenDeals() {
  return useQuery({
    queryKey: [...keys.deals, "open-summary"],
    queryFn: async () => ({ count: await data.countOpenDeals(), totals: await data.openDealTotals() }),
  });
}

/** Every change to a reminder refreshes every list of reminders. */
function useReminderMutation<V, R>(run: (variables: V) => Promise<R>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.reminders }),
  });
}

export const useCreateReminder = () => useReminderMutation((input: ReminderInput) => data.createReminder(input));

export const useUpdateReminder = () =>
  useReminderMutation(
    ({ id, patch }: { id: string; patch: Partial<Pick<Reminder, "title" | "due_at" | "repeat_rule" | "contact_id">> }) =>
      data.updateReminder(id, patch),
  );

export const useCompleteReminder = () => useReminderMutation((id: string) => data.completeReminder(id));
export const useReopenReminder = () => useReminderMutation((id: string) => data.reopenReminder(id));
export const useDeleteReminder = () => useReminderMutation((id: string) => data.deleteReminder(id));

/** Renaming or deleting a tag changes it on everyone who has it. */
export function useRenameTag() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => data.renameTag(id, name),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.tags });
      void client.invalidateQueries({ queryKey: keys.contacts });
    },
  });
}

export function useDeleteTag() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => data.deleteTag(id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.tags });
      void client.invalidateQueries({ queryKey: keys.contacts });
    },
  });
}
