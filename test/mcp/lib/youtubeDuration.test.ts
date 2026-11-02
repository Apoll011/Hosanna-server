import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractYouTubeVideoId,
  formatChordProDuration,
  parseYouTubeIsoDuration,
} from "../../../src/mcp/lib/youtubeSearch.js";

describe("parseYouTubeIsoDuration", () => {
  it("parses M:SS-style ISO durations", () => {
    assert.equal(parseYouTubeIsoDuration("PT4M35S"), 275);
    assert.equal(parseYouTubeIsoDuration("PT45S"), 45);
    assert.equal(parseYouTubeIsoDuration("PT1H2M3S"), 3723);
  });

  it("rejects empty/zero", () => {
    assert.equal(parseYouTubeIsoDuration("PT0S"), null);
    assert.equal(parseYouTubeIsoDuration("invalid"), null);
  });
});

describe("formatChordProDuration", () => {
  it("formats seconds as M:SS and H:MM:SS", () => {
    assert.equal(formatChordProDuration(275), "4:35");
    assert.equal(formatChordProDuration(45), "0:45");
    assert.equal(formatChordProDuration(3723), "1:02:03");
  });
});

describe("extractYouTubeVideoId", () => {
  it("accepts watch, short, and bare ids", () => {
    assert.equal(
      extractYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
      "dQw4w9WgXcQ",
    );
    assert.equal(
      extractYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ"),
      "dQw4w9WgXcQ",
    );
    assert.equal(extractYouTubeVideoId("dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  });
});
