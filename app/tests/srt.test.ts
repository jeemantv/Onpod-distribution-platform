// Unit tests for the SRT → transcript conversion used by AI YouTube's caption
// import (the path that makes unlisted/private videos work).
//
// Run:  npx tsx --test tests/srt.test.ts

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { srtToTranscript } from "../src/lib/youtube-captions";

describe("srtToTranscript", () => {
  test("emits absolute [HH:MM:SS] stamps and merges cues into buckets", () => {
    const srt = `1
00:00:01,000 --> 00:00:04,000
Welcome back to the show.

2
00:00:04,500 --> 00:00:08,000
Today we talk about pricing.

3
00:00:41,000 --> 00:00:44,000
So here is the mistake everyone makes.
`;
    const out = srtToTranscript(srt);
    const lines = out.split("\n");
    assert.equal(lines.length, 2, "cues within 30s collapse into one line");
    assert.equal(lines[0], "[00:00:01] Welcome back to the show. Today we talk about pricing.");
    assert.equal(lines[1], "[00:00:41] So here is the mistake everyone makes.");
  });

  test("strips karaoke tags and de-duplicates rolling ASR overlap", () => {
    const srt = `1
00:01:00,000 --> 00:01:03,000
<c.colorE5E5E5>the thing about</c> pricing is

2
00:01:03,000 --> 00:01:06,000
pricing is that nobody asks
`;
    const out = srtToTranscript(srt);
    assert.equal(out, "[00:01:00] the thing about pricing is that nobody asks");
  });

  test("handles hour-plus timestamps and VTT-style dot milliseconds", () => {
    const srt = `1
01:02:03.500 --> 01:02:06.000
Still going after an hour.
`;
    assert.equal(srtToTranscript(srt), "[01:02:03] Still going after an hour.");
  });

  test("returns empty string for junk input rather than throwing", () => {
    assert.equal(srtToTranscript(""), "");
    assert.equal(srtToTranscript("not an srt file at all"), "");
  });
});
