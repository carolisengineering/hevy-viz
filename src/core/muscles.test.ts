import { describe, expect, it } from "vitest";
import { MAIN_GROUPS, muscleGroup, muscleLabel, sideOf } from "./muscles";

describe("muscleGroup", () => {
  it("maps each Hevy muscle to its group", () => {
    expect(muscleGroup("quadriceps")).toBe("Legs");
    expect(muscleGroup("adductors")).toBe("Legs");
    expect(muscleGroup("lats")).toBe("Back");
    expect(muscleGroup("lower_back")).toBe("Back");
    expect(muscleGroup("triceps")).toBe("Arms");
    expect(muscleGroup("abdominals")).toBe("Core");
    expect(muscleGroup("full_body")).toBe("Full body");
    expect(muscleGroup("cardio")).toBe("Cardio");
  });

  it("puts unknown muscles under Other", () => {
    expect(muscleGroup("neck")).toBe("Other");
    expect(muscleGroup("something_new")).toBe("Other");
  });

  it("lists the six main groups in display order", () => {
    expect(MAIN_GROUPS).toEqual(["Legs", "Back", "Chest", "Shoulders", "Arms", "Core"]);
  });
});

describe("sideOf", () => {
  it("puts legs and the lower back on the lower side", () => {
    expect(sideOf("hamstrings")).toBe("lower");
    expect(sideOf("lower_back")).toBe("lower");
  });

  it("puts back, chest, shoulders and arms on the upper side", () => {
    expect(sideOf("chest")).toBe("upper");
    expect(sideOf("upper_back")).toBe("upper");
    expect(sideOf("biceps")).toBe("upper");
  });

  it("puts core and full body in the bonus tracks", () => {
    expect(sideOf("abdominals")).toBe("bonus");
    expect(sideOf("full_body")).toBe("bonus");
  });
});

describe("muscleLabel", () => {
  it("turns an id into a sentence-case label", () => {
    expect(muscleLabel("upper_back")).toBe("Upper back");
  });
});
