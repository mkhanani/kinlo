import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import * as data from "./index";
import type { ContactFilter, ContactInput, ContactPatch, Interaction, InteractionInput } from "./types";

/**
 * React bindings for the data layer. Screens read with these hooks and write with the
 * mutations, which refresh everything the write could have changed.
 */
export const keys = {
  contacts: ["contacts"] as const,
  contactList: (filter: ContactFilter) => ["contacts", "list", filter] as const,
  contact: (id: string) => ["contacts", "detail", id] as const,
  contactSearch: (query: string) => ["contacts", "search", query] as const,
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

export function useContactSearch(query: string) {
  return useQuery({
    queryKey: keys.contactSearch(query),
    queryFn: () => data.searchContacts(query, 8),
    enabled: query.trim().length > 0,
    placeholderData: keepPreviousData,
  });
}

export function useContactCount() {
  return useQuery({ queryKey: [...keys.contacts, "count"], queryFn: data.countContacts });
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
    mutationFn: async ({ input, tags }: { input: ContactInput; tags: string[] }) => {
      const contact = await data.createContact(input);
      if (tags.length) await data.setContactTags(contact.id, tags);
      return contact;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.contacts });
      void client.invalidateQueries({ queryKey: keys.tags });
    },
  });
}

export function useUpdateContact() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch, tags }: { id: string; patch: ContactPatch; tags?: string[] }) => {
      if (tags) await data.setContactTags(id, tags);
      return data.updateContact(id, patch);
    },
    onSuccess: () => {
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
