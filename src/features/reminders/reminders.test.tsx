import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import {
  addInteraction,
  createContact,
  createDeal,
  createReminder,
  listReminders,
  listUpcomingBirthdays,
  updateReminder,
} from "@/data";
import { useTestDatabase } from "@/data/testing";
import { renderApp } from "@/test/render";
import { defaultDue, dueGroup, dueLabel, groupByDue, weekAhead } from "./due";

useTestDatabase();

const type = (element: HTMLElement, value: string) => fireEvent.change(element, { target: { value } });

/** A moment `days` days from now at a fixed local time, so grouping never depends on when the test runs. */
function at(days: number, hours = 10, minutes = 0): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, hours, minutes).toISOString();
}

describe("when a reminder is due", () => {
  const now = new Date(2026, 5, 17, 15, 0); // Wednesday 17 June 2026, 3pm

  it("groups by calendar day: earlier today is still today", () => {
    expect(dueGroup(new Date(2026, 5, 17, 9, 0).toISOString(), now)).toBe("today");
    expect(dueGroup(new Date(2026, 5, 17, 23, 0).toISOString(), now)).toBe("today");
    expect(dueGroup(new Date(2026, 5, 16, 23, 59).toISOString(), now)).toBe("overdue");
    expect(dueGroup(new Date(2026, 5, 18, 0, 1).toISOString(), now)).toBe("upcoming");

    const groups = groupByDue(
      [
        { due_at: new Date(2026, 5, 10).toISOString() },
        { due_at: new Date(2026, 5, 17, 8).toISOString() },
        { due_at: new Date(2026, 6, 1).toISOString() },
      ],
      now,
    );
    expect([groups.overdue.length, groups.today.length, groups.upcoming.length]).toEqual([1, 1, 1]);
  });

  it("says when in a few words", () => {
    expect(dueLabel(new Date(2026, 5, 17, 9, 30).toISOString(), now)).toMatch(/9:30/);
    expect(dueLabel(new Date(2026, 5, 18, 9, 0).toISOString(), now)).toMatch(/^Tomorrow, /);
    expect(dueLabel(new Date(2026, 5, 16, 9, 0).toISOString(), now)).toMatch(/^Yesterday, /);
    expect(dueLabel(new Date(2026, 5, 12, 9, 0).toISOString(), now)).toBe("5 days ago");
    expect(dueLabel(new Date(2026, 5, 20, 9, 0).toISOString(), now)).toMatch(/^Saturday, /);
    expect(dueLabel(new Date(2026, 6, 20, 9, 0).toISOString(), now)).toMatch(/Jul/);
  });

  it("starts new reminders tomorrow at nine", () => {
    const due = new Date(defaultDue(now));
    expect([due.getDate(), due.getHours(), due.getMinutes()]).toEqual([18, 9, 0]);
  });

  it("counts the week ahead as seven days including today", () => {
    const end = weekAhead(now);
    expect([end.getDate(), end.getHours(), end.getMinutes()]).toEqual([23, 23, 59]);
  });
});

describe("reminders and sides", () => {
  it("take the side they were made on", async () => {
    await createReminder({ title: "Renew passport", due_at: at(1), side: "personal" });
    await createReminder({ title: "Send invoice", due_at: at(1), side: "business" });
    expect((await listReminders({ side: "personal" })).map((r) => r.title)).toEqual(["Renew passport"]);
    expect((await listReminders({ side: "business" })).map((r) => r.title)).toEqual(["Send invoice"]);
  });

  it("follow a person who is on only one side, whatever side they were made on", async () => {
    const client = await createContact({ name: "Client Carla", business: "client" });
    const friend = await createContact({ name: "Friend Farid" });
    const both = await createContact({ name: "Both Bea", personal: true, business: "lead" });

    const a = await createReminder({ title: "Chase Carla", due_at: at(1), contact_id: client.id, side: "personal" });
    const b = await createReminder({ title: "Call Farid", due_at: at(1), contact_id: friend.id, side: "business" });
    const c = await createReminder({ title: "Lunch with Bea", due_at: at(1), contact_id: both.id, side: "business" });
    expect([a.side, b.side, c.side]).toEqual(["business", "personal", "business"]);

    // Pointing it at someone else moves it with them.
    await updateReminder(a.id, { contact_id: friend.id });
    expect((await listReminders({ side: "personal" })).map((r) => r.title).sort()).toEqual(["Call Farid", "Chase Carla"]);
  });
});

describe("upcoming birthdays", () => {
  const today = new Date(2026, 5, 17); // 17 June 2026

  it("lists the next month, soonest first, with the age when the year is known", async () => {
    await createContact({ name: "Today Tia", birthday: "1990-06-17" });
    await createContact({ name: "Soon Sam", birthday: "--06-25" });
    await createContact({ name: "Edge Eli", birthday: "--07-17" });
    await createContact({ name: "Late Lou", birthday: "--07-18" });
    await createContact({ name: "Past Pat", birthday: "--06-16" });
    await createContact({ name: "No Date" });

    const list = await listUpcomingBirthdays(undefined, today);
    expect(list.map((b) => [b.contact.name, b.days_until, b.turning])).toEqual([
      ["Today Tia", 0, 36],
      ["Soon Sam", 8, null],
      ["Edge Eli", 30, null],
    ]);
    expect(list[1]!.date).toBe("2026-06-25");
  });

  it("wraps over the new year and handles 29 February", async () => {
    await createContact({ name: "New Year Nia", birthday: "2000-01-03" });
    const december = await listUpcomingBirthdays(undefined, new Date(2026, 11, 20));
    expect(december.map((b) => [b.contact.name, b.days_until, b.turning, b.date])).toEqual([["New Year Nia", 14, 27, "2027-01-03"]]);

    await createContact({ name: "Leap Lee", birthday: "--02-29" });
    const plainYear = await listUpcomingBirthdays(undefined, new Date(2027, 1, 20));
    expect(plainYear.find((b) => b.contact.name === "Leap Lee")!.date).toBe("2027-02-28");
    const leapYear = await listUpcomingBirthdays(undefined, new Date(2028, 1, 20));
    expect(leapYear.find((b) => b.contact.name === "Leap Lee")!.date).toBe("2028-02-29");
  });

  it("keeps to one side when asked, and leaves archived people out", async () => {
    await createContact({ name: "Friend", birthday: "--06-20" });
    await createContact({ name: "Client", business: "client", birthday: "--06-21" });
    await createContact({ name: "Gone", birthday: "--06-22", archived: true });
    expect((await listUpcomingBirthdays("personal", today)).map((b) => b.contact.name)).toEqual(["Friend"]);
    expect((await listUpcomingBirthdays("business", today)).map((b) => b.contact.name)).toEqual(["Client"]);
  });
});

describe("Reminders screen", () => {
  it("starts empty with one clear action", async () => {
    renderApp("/reminders");
    expect(await screen.findByText(/Nothing to remember right now/)).toBeInTheDocument();
  });

  it("groups open reminders into overdue, today and upcoming", async () => {
    const ana = await createContact({ name: "Ana Lima" });
    await createReminder({ title: "Old one", due_at: at(-3) });
    await createReminder({ title: "Call Ana", due_at: at(0, 9), contact_id: ana.id });
    await createReminder({ title: "Next week", due_at: at(6), repeat_rule: "weekly" });
    await createReminder({ title: "Work thing", due_at: at(0), side: "business" });

    renderApp("/reminders");
    const overdue = await screen.findByRole("region", { name: "Overdue" });
    expect(within(overdue).getByText("Old one")).toBeInTheDocument();
    expect(within(overdue).getByText("3 days ago")).toBeInTheDocument();

    const today = screen.getByRole("region", { name: "Today" });
    expect(within(today).getByText("Call Ana")).toBeInTheDocument();
    expect(within(today).getByRole("link", { name: "Ana Lima" })).toBeInTheDocument();

    const upcoming = screen.getByRole("region", { name: "Upcoming" });
    expect(within(upcoming).getByText("Next week")).toBeInTheDocument();
    expect(within(upcoming).getByText("Every week")).toBeInTheDocument();

    // The business reminder belongs to the other side.
    expect(screen.queryByText("Work thing")).not.toBeInTheDocument();
    expect(screen.getByText("3 open, 1 overdue")).toBeInTheDocument();
  });

  it("adds a reminder about a person from the dialog", async () => {
    await createContact({ name: "Ana Lima" });
    await createContact({ name: "Work Only", business: "client" });
    renderApp("/reminders");
    fireEvent.click((await screen.findAllByRole("button", { name: /Add reminder/ }))[0]!);

    const dialog = await screen.findByRole("dialog", { name: "Add reminder" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add reminder" }));
    expect(await within(dialog).findByText("Say what to be reminded of.")).toBeInTheDocument();

    type(within(dialog).getByLabelText("Remind me to"), "Send the photos");
    fireEvent.change(within(dialog).getByLabelText("Repeat"), { target: { value: "monthly" } });

    const about = within(dialog).getByLabelText("About");
    fireEvent.focus(about);
    type(about, "ana");
    // Only people on this side are offered.
    fireEvent.mouseDown(await within(dialog).findByRole("option", { name: /Ana Lima/ }));
    expect(within(dialog).queryByRole("option", { name: /Work Only/ })).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Add reminder" }));
    expect(await screen.findByText("Send the photos")).toBeInTheDocument();

    const [saved] = await listReminders();
    expect(saved).toMatchObject({ title: "Send the photos", repeat_rule: "monthly", contact_name: "Ana Lima", side: "personal" });
    // Tomorrow at nine unless you say otherwise.
    const due = new Date(saved!.due_at);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect([due.getDate(), due.getHours()]).toEqual([tomorrow.getDate(), 9]);
  });

  it("ticking a reminder finishes it, and it can be brought back from Done", async () => {
    await createReminder({ title: "Send card", due_at: at(0) });
    renderApp("/reminders");

    fireEvent.click(await screen.findByRole("checkbox", { name: "Done: Send card" }));
    expect(await screen.findByText(/Nothing to remember right now/)).toBeInTheDocument();
    expect(await listReminders()).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "Reopen: Send card" }));
    await waitFor(async () => expect(await listReminders()).toHaveLength(1));
  });

  it("ticking a repeating reminder moves it on instead of finishing it", async () => {
    await createReminder({ title: "Water plants", due_at: at(-1, 8), repeat_rule: "weekly" });
    renderApp("/reminders");
    await screen.findByRole("region", { name: "Overdue" });

    fireEvent.click(screen.getByRole("checkbox", { name: "Done: Water plants" }));
    const upcoming = await screen.findByRole("region", { name: "Upcoming" });
    expect(within(upcoming).getByText("Water plants")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Overdue" })).not.toBeInTheDocument();
    expect((await listReminders())[0]!.done_at).toBeNull();
  });

  it("edits and deletes from the row menu", async () => {
    await createReminder({ title: "Draft", due_at: at(2) });
    renderApp("/reminders");

    const trigger = await screen.findByRole("button", { name: "Options for Draft" });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit reminder" });
    const title = within(dialog).getByLabelText("Remind me to");
    expect(title).toHaveValue("Draft");
    type(title, "Final");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Final")).toBeInTheDocument();

    const again = await screen.findByRole("button", { name: "Options for Final" });
    again.focus();
    fireEvent.keyDown(again, { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    fireEvent.click(within(await screen.findByRole("dialog", { name: "Delete this reminder?" })).getByRole("button", { name: "Delete" }));
    await waitFor(async () => expect(await listReminders()).toEqual([]));
  });
});

describe("Reminders on a person's page", () => {
  it("adds one already about that person, and ticks it off", async () => {
    const ana = await createContact({ name: "Ana Lima" });
    renderApp(`/people/${ana.id}`);

    const card = await screen.findByRole("region", { name: "Reminders" });
    fireEvent.click(within(card).getByRole("button", { name: "Add reminder" }));
    const dialog = await screen.findByRole("dialog", { name: "Add reminder" });
    // The person is filled in already.
    expect(await within(dialog).findByRole("button", { name: "Remove Ana Lima" })).toBeInTheDocument();
    type(within(dialog).getByLabelText("Remind me to"), "Ask about the move");
    fireEvent.click(within(dialog).getByRole("button", { name: "Add reminder" }));

    expect(await within(card).findByText("Ask about the move")).toBeInTheDocument();
    // The page behind a dialog is hidden from assistive tech until the dialog has closed.
    fireEvent.click(await within(card).findByRole("checkbox", { name: "Done: Ask about the move" }));
    await waitFor(() => expect(within(card).queryByText("Ask about the move")).not.toBeInTheDocument());
    expect(within(card).getByText("No reminders.")).toBeInTheDocument();
  });
});

describe("Home", () => {
  it("shows who is overdue, what is due this week and whose birthday is near", async () => {
    const ingrid = await createContact({ name: "Ingrid Solberg", keep_in_touch_days: 7 });
    // Midnight sixteen days ago, so it is a full sixteen days whatever time the test runs.
    await addInteraction({ contact_id: ingrid.id, type: "call", happened_at: at(-16, 0) });
    const soon = new Date();
    soon.setDate(soon.getDate() + 3);
    const mmdd = `--${String(soon.getMonth() + 1).padStart(2, "0")}-${String(soon.getDate()).padStart(2, "0")}`;
    await createContact({ name: "Marcus Bell", birthday: mmdd });
    await createReminder({ title: "Overdue thing", due_at: at(-2) });
    await createReminder({ title: "In six days", due_at: at(6, 22) });
    await createReminder({ title: "In seven days", due_at: at(7, 1) });

    renderApp("/", { userName: "Mustafa" });
    expect(await screen.findByRole("heading", { name: /, Mustafa$/ })).toBeInTheDocument();

    const overdue = await screen.findByRole("region", { name: "Due for a catch-up" });
    expect(await within(overdue).findByRole("link", { name: /Ingrid Solberg/ })).toHaveTextContent("9 days overdue");

    const week = screen.getByRole("region", { name: "Reminders this week" });
    expect(await within(week).findByText("Overdue thing")).toBeInTheDocument();
    // Seven days counting today: day six is in, day seven is not.
    expect(within(week).getByText("In six days")).toBeInTheDocument();
    expect(within(week).queryByText("In seven days")).not.toBeInTheDocument();

    const birthdays = screen.getByRole("region", { name: "Upcoming birthdays" });
    expect(await within(birthdays).findByRole("link", { name: /Marcus Bell/ })).toHaveTextContent("in 3 days");

    const people = screen.getByRole("region", { name: "Your people" });
    expect(await within(people).findByText("2")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Open deals" })).not.toBeInTheDocument();
  });

  it("a reminder can be ticked off straight from Home", async () => {
    await createReminder({ title: "Quick one", due_at: at(0) });
    renderApp("/");
    const week = await screen.findByRole("region", { name: "Reminders this week" });
    fireEvent.click(await within(week).findByRole("checkbox", { name: "Done: Quick one" }));
    expect(await within(week).findByText("Nothing due this week.")).toBeInTheDocument();
  });

  it("on the business side shows that side's people and the open deals", async () => {
    const farid = await createContact({ name: "Friend Farid", keep_in_touch_days: 7 });
    await addInteraction({ contact_id: farid.id, type: "call", happened_at: at(-20, 0) });
    const carla = await createContact({ name: "Client Carla", business: "client", keep_in_touch_days: 7 });
    await addInteraction({ contact_id: carla.id, type: "call", happened_at: at(-20, 0) });
    await createDeal({ contact_id: carla.id, title: "Website", value: 4800, currency: "USD" });
    await createDeal({ contact_id: carla.id, title: "Retainer", value: 1200, currency: "USD" });
    await createReminder({ title: "Send invoice", due_at: at(0), side: "business" });
    await createReminder({ title: "Renew passport", due_at: at(0), side: "personal" });

    renderApp("/", { activeSide: "business" });
    const overdue = await screen.findByRole("region", { name: "Due for a catch-up" });
    expect(await within(overdue).findByRole("link", { name: /Client Carla/ })).toBeInTheDocument();
    expect(within(overdue).queryByText(/Friend Farid/)).not.toBeInTheDocument();

    const week = screen.getByRole("region", { name: "Reminders this week" });
    expect(await within(week).findByText("Send invoice")).toBeInTheDocument();
    expect(within(week).queryByText("Renew passport")).not.toBeInTheDocument();

    const deals = screen.getByRole("region", { name: "Open deals" });
    expect(await within(deals).findByText("2")).toBeInTheDocument();
    expect(within(deals).getByText(/6,000/)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Your people" })).not.toBeInTheDocument();
  });

  it("has a calm empty state", async () => {
    renderApp("/");
    expect(await screen.findByText("Everyone is up to date.")).toBeInTheDocument();
    expect(screen.getByText("Nothing due this week.")).toBeInTheDocument();
    expect(screen.getByText("No birthdays in the next month.")).toBeInTheDocument();
    expect(screen.getByText("Nobody here yet. Add your first person.")).toBeInTheDocument();
  });
});
