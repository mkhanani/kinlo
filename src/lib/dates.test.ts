import { describe, expect, it } from "vitest";
import {
  buildBirthday,
  calendarDaysBetween,
  formatBirthday,
  monthGrid,
  parseBirthday,
  parseTime,
  relativeDay,
} from "./dates";

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);

describe("relativeDay", () => {
  const now = at(2026, 6, 15);
  it("uses calendar days, not 24 hour blocks", () => {
    expect(relativeDay(at(2026, 6, 15, 1).toISOString(), now)).toBe("today");
    expect(relativeDay(at(2026, 6, 14, 23).toISOString(), now)).toBe("yesterday");
    expect(calendarDaysBetween(at(2026, 6, 14, 23), at(2026, 6, 15, 1))).toBe(1);
  });
  it("reads naturally at every distance", () => {
    expect(relativeDay(at(2026, 6, 12).toISOString(), now)).toBe("3 days ago");
    expect(relativeDay(at(2026, 5, 25).toISOString(), now)).toBe("3 weeks ago");
    expect(relativeDay(at(2026, 2, 15).toISOString(), now)).toBe("4 months ago");
    expect(relativeDay(at(2024, 6, 15).toISOString(), now)).toBe("2 years ago");
    expect(relativeDay(at(2026, 6, 16).toISOString(), now)).toBe("tomorrow");
    expect(relativeDay(at(2026, 6, 20).toISOString(), now)).toBe("in 5 days");
  });
});

describe("birthdays", () => {
  it("round-trips with and without a year", () => {
    expect(buildBirthday({ month: 4, day: 9, year: 1990 })).toBe("1990-04-09");
    expect(buildBirthday({ month: 4, day: 9, year: null })).toBe("--04-09");
    expect(parseBirthday("1990-04-09")).toEqual({ month: 4, day: 9, year: 1990 });
    expect(parseBirthday("--04-09")).toEqual({ month: 4, day: 9, year: null });
  });
  it("rejects dates that do not exist", () => {
    expect(buildBirthday({ month: 2, day: 30, year: null })).toBeNull();
    expect(buildBirthday({ month: 2, day: 29, year: 2023 })).toBeNull();
    expect(buildBirthday({ month: 2, day: 29, year: 2024 })).toBe("2024-02-29");
    expect(buildBirthday({ month: 2, day: 29, year: null })).toBe("--02-29");
    expect(buildBirthday({ month: 13, day: 1, year: null })).toBeNull();
    expect(buildBirthday({ month: null, day: 5, year: null })).toBeNull();
    expect(buildBirthday({ month: 5, day: 5, year: 1700 })).toBeNull();
  });
  it("formats for display", () => {
    expect(formatBirthday("--04-09")).toMatch(/April 9|9 April/);
    expect(formatBirthday("1990-04-09")).toMatch(/1990/);
    expect(formatBirthday("nonsense")).toBeNull();
    expect(formatBirthday(null)).toBeNull();
  });
});

describe("parseTime", () => {
  it("reads the ways people type a time", () => {
    expect(parseTime("15:30")).toEqual({ hours: 15, minutes: 30 });
    expect(parseTime("3:30 pm")).toEqual({ hours: 15, minutes: 30 });
    expect(parseTime("3pm")).toEqual({ hours: 15, minutes: 0 });
    expect(parseTime("12am")).toEqual({ hours: 0, minutes: 0 });
    expect(parseTime("12 PM")).toEqual({ hours: 12, minutes: 0 });
    expect(parseTime("1530")).toEqual({ hours: 15, minutes: 30 });
    expect(parseTime("9.05")).toEqual({ hours: 9, minutes: 5 });
    expect(parseTime(" 9 ")).toEqual({ hours: 9, minutes: 0 });
  });
  it("refuses things that are not a time", () => {
    for (const bad of ["", "25:00", "10:75", "13pm", "0pm", "soon", "3:3"]) expect(parseTime(bad)).toBeNull();
  });
});

describe("monthGrid", () => {
  it("fills whole weeks around the month", () => {
    // February 2026 starts on a Sunday.
    const sundayFirst = monthGrid(2026, 1, 0);
    expect(sundayFirst).toHaveLength(28);
    expect(sundayFirst[0]!.getDate()).toBe(1);
    const mondayFirst = monthGrid(2026, 1, 1);
    expect(mondayFirst).toHaveLength(35);
    expect(mondayFirst[0]!.getMonth()).toBe(0); // starts in January
    expect(mondayFirst[6]!.getDate()).toBe(1);
  });
});
