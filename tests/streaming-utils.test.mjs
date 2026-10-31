import test from "node:test";
import assert from "node:assert/strict";
import { convertSrtToVtt, validateVtt } from "../lib/subtitle-utils.ts";
import { normalizeVideoSourceInput } from "../lib/video-source-utils.ts";
import { getNextPlayableEpisode, getNextSourceIndex, isEpisodeNew, parseGuestProgress } from "../lib/watch-utils.ts";

test("Internet Archive item, embed, protocol-relative iframe, and direct MP4 URLs normalize for playback", () => {
  assert.deepEqual(normalizeVideoSourceInput("https://archive.org/details/sample-video"), {
    kind: "embed",
    url: "https://archive.org/embed/sample-video",
  });
  assert.deepEqual(normalizeVideoSourceInput("https://archive.org/details/sample-video?start=60"), {
    kind: "embed",
    url: "https://archive.org/embed/sample-video?start=60",
  });
  assert.deepEqual(normalizeVideoSourceInput("https://archive.org/embed/sample-video"), {
    kind: "embed",
    url: "https://archive.org/embed/sample-video",
  });
  assert.deepEqual(normalizeVideoSourceInput('<iframe src="//archive.org/embed/sample-video"></iframe>'), {
    kind: "embed",
    url: "https://archive.org/embed/sample-video",
  });
  assert.deepEqual(normalizeVideoSourceInput("https://archive.org/download/sample-video/movie.mp4"), {
    kind: "mp4",
    url: "https://archive.org/download/sample-video/movie.mp4",
  });
});

test("SRT converts comma timestamps to valid WebVTT and keeps Sinhala UTF-8 text", () => {
  const srt = "1\r\n00:00:01,250 --> 00:00:03,500\r\nආයුබෝවන්\r\n";
  const vtt = convertSrtToVtt(new TextEncoder().encode(srt));
  assert.match(vtt, /^WEBVTT\n/);
  assert.match(vtt, /00:00:01\.250 --> 00:00:03\.500/);
  assert.match(vtt, /ආයුබෝවන්/);
  assert.equal(validateVtt(new TextEncoder().encode(vtt)), vtt);
});

test("subtitle cue order is compared by elapsed time, including unpadded hour fields", () => {
  const vtt = "WEBVTT\n\n1\n0:00:01.000 --> 00:00:02.000\nValid cue\n";
  assert.equal(validateVtt(new TextEncoder().encode(vtt)), vtt);
  assert.throws(
    () => validateVtt(new TextEncoder().encode("WEBVTT\n\n1\n0:00:02.000 --> 00:00:01.000\nInvalid cue\n")),
    /invalid timestamps/,
  );
  assert.throws(
    () => convertSrtToVtt(new TextEncoder().encode("1\n100:00:00,000 --> 99:59:59,999\nInvalid order")),
    /end times/,
  );
});

test("subtitle utilities reject malformed cues and invalid UTF-8", () => {
  assert.throws(() => convertSrtToVtt(new TextEncoder().encode("1\n00:00:02,000 --> 00:00:01,000\nBad order")), /end times/);
  assert.throws(() => validateVtt(new TextEncoder().encode("not a subtitle file")), /begin with WEBVTT/);
  assert.throws(() => convertSrtToVtt(new Uint8Array([0xff, 0xfe, 0xff])), /valid UTF-8/);
});

test("next episode selection skips drafts or unavailable episodes and stops at the end", () => {
  const episodes = [
    { id: "one", season_number: 1, episode_number: 1, playable: true },
    { id: "draft", season_number: 1, episode_number: 2, playable: false },
    { id: "two", season_number: 1, episode_number: 3, playable: true },
  ];
  assert.equal(getNextPlayableEpisode(episodes, "one")?.id, "two");
  assert.equal(getNextPlayableEpisode(episodes, "two"), null);
  assert.equal(getNextPlayableEpisode(episodes, "missing"), null);
});

test("source failover tries each source once and stops after the last failure", () => {
  assert.equal(getNextSourceIndex(0, 3), 1);
  assert.equal(getNextSourceIndex(1, 3), 2);
  assert.equal(getNextSourceIndex(2, 3), null);
  assert.equal(getNextSourceIndex(-1, 3), null);
  assert.equal(getNextSourceIndex(0, 0), null);
});

test("episode NEW badge is limited to published times within the last 48 hours", () => {
  const now = Date.parse("2026-10-29T12:00:00.000Z");
  assert.equal(isEpisodeNew("2026-10-29 11:00:00", now), true);
  assert.equal(isEpisodeNew("2026-10-27 12:00:00", now), false);
  assert.equal(isEpisodeNew("2026-10-29 13:00:00", now), false);
  assert.equal(isEpisodeNew("not-a-date", now), false);
});

test("guest continue-watching records are validated and sorted newest first", () => {
  const value = JSON.stringify([
    { title_id: "older", episode_id: null, slug: "older", title: "Older", position_seconds: 30, duration_seconds: 60, updated_at: "2026-10-01T00:00:00.000Z" },
    { title_id: "newer", episode_id: "ep-1", slug: "newer", title: "Newer", episode_number: 1, position_seconds: 20, duration_seconds: 80, updated_at: "2026-10-02T00:00:00.000Z" },
    { title_id: "invalid", slug: "", title: "Invalid", position_seconds: -1, duration_seconds: 20 },
  ]);
  const items = parseGuestProgress(value);
  assert.deepEqual(items.map((item) => item.title_id), ["newer", "older"]);
  assert.equal(items[0].episode_number, 1);
  assert.deepEqual(parseGuestProgress("not-json"), []);
});
