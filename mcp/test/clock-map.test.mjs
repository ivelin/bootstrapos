import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  JOURNEY_SPOKEN,
  LOOP_SPOKEN,
  formatSpokenJourney,
  formatSpokenLoop,
  nextSpokenJourney,
  spokenJourneyOf,
  spokenLoopOf,
} from "../dist/clock-map.js";

describe("OS 2.8.15 clock remap (no invented Advance)", () => {
  it("maps stored journey integers to five spoken rungs", () => {
    assert.deepEqual(spokenJourneyOf(1), { rung: 1, label: "Write the bet" });
    assert.deepEqual(spokenJourneyOf(2), { rung: 1, label: "Write the bet" });
    assert.deepEqual(spokenJourneyOf(3), { rung: 2, label: "Filter cheaply" });
    assert.deepEqual(spokenJourneyOf(4), { rung: 3, label: "Ground it" });
    assert.deepEqual(spokenJourneyOf(5), { rung: 4, label: "Build tiny slice" });
    assert.deepEqual(spokenJourneyOf(6), { rung: 4, label: "Build tiny slice" });
    assert.deepEqual(spokenJourneyOf(7), { rung: 5, label: "Try with real people" });
    assert.deepEqual(spokenJourneyOf(8), { rung: 5, label: "Try with real people" });
    assert.deepEqual(spokenJourneyOf(9), { rung: 5, label: "Try with real people" });
  });

  it("maps stored loop integers to five spoken weeks", () => {
    assert.deepEqual(spokenLoopOf(1), { week: 1, label: "Ask" });
    assert.deepEqual(spokenLoopOf(2), { week: 1, label: "Ask" });
    assert.deepEqual(spokenLoopOf(3), { week: 2, label: "Make" });
    assert.deepEqual(spokenLoopOf(4), { week: 3, label: "Check" });
    assert.deepEqual(spokenLoopOf(5), { week: 3, label: "Check" });
    assert.deepEqual(spokenLoopOf(6), { week: 4, label: "Hear" });
    assert.deepEqual(spokenLoopOf(7), { week: 5, label: "Write back" });
  });

  it("keeps DyeConverter-class 1-1 as Write the bet / Ask", () => {
    assert.equal(formatSpokenJourney(1), "Write the bet (1)");
    assert.equal(formatSpokenLoop(1), "Ask (1)");
  });

  it("keeps a 6/7/kill board at Build tiny slice / Write back — no invented Advance", () => {
    assert.equal(spokenJourneyOf(6).label, "Build tiny slice");
    assert.equal(spokenLoopOf(7).label, "Write back");
    assert.equal(nextSpokenJourney(6)?.label, "Try with real people");
    assert.equal(nextSpokenJourney(7), null);
    assert.equal(nextSpokenJourney(8), null);
    assert.equal(nextSpokenJourney(9), null);
  });

  it("does not merge Filter+Ground, Build+Try, or Check+Hear", () => {
    assert.notEqual(JOURNEY_SPOKEN[2], JOURNEY_SPOKEN[3]);
    assert.notEqual(JOURNEY_SPOKEN[4], JOURNEY_SPOKEN[5]);
    assert.notEqual(LOOP_SPOKEN[3], LOOP_SPOKEN[4]);
    assert.equal(JOURNEY_SPOKEN[2], "Filter cheaply");
    assert.equal(JOURNEY_SPOKEN[3], "Ground it");
    assert.equal(JOURNEY_SPOKEN[4], "Build tiny slice");
    assert.equal(JOURNEY_SPOKEN[5], "Try with real people");
    assert.equal(LOOP_SPOKEN[3], "Check");
    assert.equal(LOOP_SPOKEN[4], "Hear");
  });

  it("does not invent a sixth journey rung", () => {
    assert.equal(Object.keys(JOURNEY_SPOKEN).length, 5);
    assert.equal(Object.keys(LOOP_SPOKEN).length, 5);
    assert.ok(!Object.values(JOURNEY_SPOKEN).includes("Grow"));
    assert.ok(!Object.values(JOURNEY_SPOKEN).includes("Learn and improve"));
  });
});
