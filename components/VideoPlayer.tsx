"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getNextSourceIndex, parseGuestProgress } from "@/lib/watch-utils";
import { normalizeVideoSourceInput } from "@/lib/video-source-utils";

type SubtitleTrack = { language: string; label: string; file_url: string; kind: string; is_default?: number; timing_offset?: number };
type MediaSource = { id?: string; kind: "hls" | "mp4" | "embed"; quality: "auto" | "480p" | "720p" | "1080p"; url: string; priority?: number };
type Preference = { volume: number; quality: string; subtitleLanguage: string };
const guestPreferencesKey = "kverse:playback-preferences:v1";
const qualityRank: Record<string, number> = { "1080p": 4, "720p": 3, "480p": 2, auto: 1 };

function readGuestPreferences(): Preference {
  try {
    const value = JSON.parse(localStorage.getItem(guestPreferencesKey) || "{}");
    return { volume: Number.isFinite(value.volume) ? Math.max(0, Math.min(1, value.volume)) : 1, quality: ["auto", "480p", "720p", "1080p"].includes(value.quality) ? value.quality : "auto", subtitleLanguage: typeof value.subtitleLanguage === "string" ? value.subtitleLanguage : "si" };
  } catch { return { volume: 1, quality: "auto", subtitleLanguage: "si" }; }
}

export function VideoPlayer({ src, sources = [], titleId, titleSlug, title, posterUrl, episodeId, episodeNumber = null, subtitles = [], nextUrl = "" }: { src: string; sources?: MediaSource[]; titleId: string; titleSlug: string; title: string; posterUrl: string; episodeId: string | null; episodeNumber?: number | null; subtitles?: SubtitleTrack[]; nextUrl?: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const lastSave = useRef(0);
  const pendingResume = useRef<number | null>(null);
  const viewRecorded = useRef(false);
  const appliedCaptionOffsets = useRef(new WeakMap<TextTrack, number>());
  const hideTimer = useRef<number | undefined>(undefined);
  const [error, setError] = useState("");
  const [resumeNote, setResumeNote] = useState("");
  const [sourceIndex, setSourceIndex] = useState(0);
  const [quality, setQuality] = useState("auto");
  const [volume, setVolume] = useState(1);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [selectedTrack, setSelectedTrack] = useState(() => {
    const sinhala = subtitles.findIndex((track) => track.language.toLowerCase().startsWith("si"));
    return sinhala >= 0 ? sinhala : subtitles.findIndex((track) => Number(track.is_default) === 1);
  });
  const [captionSize, setCaptionSize] = useState(22);
  const [captionColor, setCaptionColor] = useState("#ffffff");
  const [captionBackground, setCaptionBackground] = useState(0.72);
  const [captionPosition, setCaptionPosition] = useState("bottom");
  const [captionTimingOffset, setCaptionTimingOffset] = useState(0);
  const [showCaptionSettings, setShowCaptionSettings] = useState(false);
  const [theater, setTheater] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [nextCountdown, setNextCountdown] = useState<number | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  const availableSources = useMemo(() => {
    const all = sources.length ? [...sources] : src ? [{ kind: "mp4" as const, quality: "auto" as const, url: src }] : [];
    return all.flatMap((source) => {
      const normalized = normalizeVideoSourceInput(source.url, source.kind);
      return normalized ? [{ ...source, ...normalized }] : [];
    }).sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0) || (qualityRank[b.quality] || 0) - (qualityRank[a.quality] || 0));
  }, [sources, src]);
  const qualitySources = useMemo(() => {
    if (quality === "auto") return [...availableSources].sort((a, b) => (qualityRank[b.quality] || 0) - (qualityRank[a.quality] || 0) || (Number(b.priority) || 0) - (Number(a.priority) || 0));
    const exact = availableSources.filter((source) => source.quality === quality);
    return exact.length ? exact : availableSources.filter((source) => source.quality === "auto");
  }, [availableSources, quality]);
  const safeIndex = qualitySources.length ? Math.min(sourceIndex, qualitySources.length - 1) : 0;
  const activeSource = qualitySources[safeIndex];
  const currentSrc = activeSource?.url || "";
  const isEmbed = activeSource?.kind === "embed";

  useEffect(() => {
    const setting = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(setting.matches);
    sync(); setting.addEventListener?.("change", sync);
    return () => setting.removeEventListener?.("change", sync);
  }, []);

  // A client-side navigation can keep the player mounted while changing episodes.
  // Reset per-playback state so the next episode gets its own view event and source attempt.
  useEffect(() => {
    viewRecorded.current = false;
    setSourceIndex(0);
    setError("");
    setNextCountdown(null);
  }, [titleId, episodeId]);

  useEffect(() => {
    let cancelled = false;
    const initial = readGuestPreferences();
    setVolume(initial.volume); setQuality(initial.quality);
    const trackIndex = subtitles.findIndex((track) => track.language.toLowerCase().startsWith(initial.subtitleLanguage.toLowerCase()));
    const defaultIndex = subtitles.findIndex((track) => Number(track.is_default) === 1);
    const sinhalaIndex = subtitles.findIndex((track) => ["si", "si-lk", "sinhala"].includes(track.language.toLowerCase()));
    setSelectedTrack(trackIndex >= 0 ? trackIndex : defaultIndex >= 0 ? defaultIndex : sinhalaIndex);
    fetch("/api/playback-preferences", { cache: "no-store" }).then((response) => response.json()).then((data) => {
      if (cancelled || !data.preferences) return;
      const preference = data.preferences as Preference;
      if (Number.isFinite(Number(preference.volume))) setVolume(Math.max(0, Math.min(1, Number(preference.volume))));
      if (["auto", "480p", "720p", "1080p"].includes(preference.quality)) setQuality(preference.quality);
      const preferredTrack = subtitles.findIndex((track) => track.language.toLowerCase().startsWith(String(preference.subtitleLanguage || "si").toLowerCase()));
      if (preferredTrack >= 0) setSelectedTrack(preferredTrack);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [titleId, episodeId, subtitles]);

  const savePreferences = useCallback((changes: Partial<Preference> = {}) => {
    const base = readGuestPreferences();
    const preferences = { ...base, volume, quality, subtitleLanguage: selectedTrack >= 0 ? subtitles[selectedTrack]?.language || "si" : "off", ...changes };
    try { localStorage.setItem(guestPreferencesKey, JSON.stringify(preferences)); } catch {}
    fetch("/api/playback-preferences", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(preferences) }).catch(() => {});
  }, [quality, selectedTrack, subtitles, volume]);

  const applyResume = useCallback(() => {
    const element = video.current, position = pendingResume.current;
    if (!element || position === null || !Number.isFinite(element.duration)) return;
    element.currentTime = Math.min(position, Math.max(0, element.duration - 3));
    pendingResume.current = null; setResumeNote("Resumed from your saved progress.");
  }, []);

  useEffect(() => {
    if (!currentSrc || isEmbed) return;
    const element = video.current;
    if (!element) return;
    let cancelled = false, hls: { destroy: () => void } | null = null;
    setError("");
    const isHls = activeSource?.kind === "hls" || currentSrc.toLowerCase().includes(".m3u8");
    const load = async () => {
      if (isHls && element.canPlayType("application/vnd.apple.mpegurl")) { element.src = currentSrc; return; }
      if (isHls) {
        try {
          const { default: Hls } = await import("hls.js");
          if (cancelled) return;
          if (!Hls.isSupported()) { setError("This browser can’t play the selected HLS stream."); return; }
          const player = new Hls({ enableWorker: true, capLevelToPlayerSize: true });
          hls = player;
          player.loadSource(currentSrc); player.attachMedia(element);
          player.on(Hls.Events.ERROR, (_event, data) => { if (data.fatal) setError("This source could not be loaded. Trying the next configured source…"); });
        } catch { setError("HLS playback support is unavailable in this browser."); }
        return;
      }
      element.src = currentSrc;
    };
    void load();
    return () => { cancelled = true; hls?.destroy(); element.removeAttribute("src"); element.load(); };
  }, [isEmbed, currentSrc]);

  useEffect(() => {
    if (!error || qualitySources.length <= 1) return;
    const timer = window.setTimeout(() => {
      const nextIndex = getNextSourceIndex(sourceIndex, qualitySources.length);
      if (nextIndex === null) {
        setError("All configured sources failed. Please try again later or report this link.");
        return;
      }
      setSourceIndex(nextIndex);
      setError("");
    }, 350);
    return () => window.clearTimeout(timer);
  }, [error, qualitySources.length, sourceIndex]);

  useEffect(() => {
    if (!currentSrc || isEmbed) return;
    pendingResume.current = null; setResumeNote("");
    let cancelled = false;
    const localKey = `kverse:progress:${titleId}:${episodeId || "movie"}`;
    fetch("/api/progress", { cache: "no-store" }).then((response) => response.json()).then((data) => {
      if (cancelled) return;
      const match = (data.items || []).find((item: any) => item.title_id === titleId && item.episode_id === (episodeId || null));
      if (match && Number(match.position_seconds) > 5) { pendingResume.current = Number(match.position_seconds); setResumeNote("Saved progress found. Playback will resume when you press play."); }
      else { try { const saved = Number(localStorage.getItem(localKey)); if (saved > 5) { pendingResume.current = saved; setResumeNote("Saved progress found. Playback will resume when you press play."); } } catch {} }
      if (video.current && video.current.readyState >= 1) applyResume();
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [currentSrc, isEmbed, titleId, episodeId, applyResume]);

  const saveProgress = useCallback(() => {
    const element = video.current;
    if (!element || !Number.isFinite(element.duration) || !element.duration) return;
    const payload = { titleId, episodeId, positionSeconds: element.currentTime, durationSeconds: element.duration };
    try {
      localStorage.setItem(`kverse:progress:${titleId}:${episodeId || "movie"}`, String(element.currentTime));
      const key = "kverse:guest-progress:v1";
      const previous = parseGuestProgress(localStorage.getItem(key) || "[]");
      const record = { title_id: titleId, episode_id: episodeId, slug: titleSlug, title, poster_url: posterUrl, episode_number: episodeNumber, position_seconds: element.currentTime, duration_seconds: element.duration, updated_at: new Date().toISOString() };
      const next = [record, ...previous.filter((item) => item.title_id !== titleId || item.episode_id !== episodeId)].slice(0, 20);
      localStorage.setItem(key, JSON.stringify(next));
    } catch {}
    fetch("/api/progress", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), keepalive: true }).catch(() => {});
  }, [titleId, titleSlug, title, posterUrl, episodeId, episodeNumber]);

  useEffect(() => {
    const save = () => saveProgress();
    const visibility = () => { if (document.visibilityState === "hidden") save(); };
    window.addEventListener("pagehide", save); document.addEventListener("visibilitychange", visibility);
    return () => { window.removeEventListener("pagehide", save); document.removeEventListener("visibilitychange", visibility); };
  }, [saveProgress]);

  useEffect(() => {
    const videoElement = video.current;
    if (!videoElement) return;
    videoElement.volume = volume;
    const tracks = videoElement.textTracks;
    for (let index = 0; index < tracks.length; index++) tracks[index].mode = index === selectedTrack ? "showing" : "disabled";
  }, [volume, selectedTrack, currentSrc]);

  useEffect(() => {
    const element = video.current;
    if (!element || selectedTrack < 0) return;
    const applySettings = () => {
      const textTrack = element.textTracks[selectedTrack];
      if (!textTrack?.cues) return;
      const offset = (Number(subtitles[selectedTrack]?.timing_offset) || 0) + captionTimingOffset;
      const previousOffset = appliedCaptionOffsets.current.get(textTrack) || 0;
      const delta = offset - previousOffset;
      for (let index = 0; index < textTrack.cues.length; index++) {
        const cue = textTrack.cues[index] as VTTCue;
        cue.startTime = Math.max(0, cue.startTime + delta);
        cue.endTime = Math.max(cue.startTime + 0.05, cue.endTime + delta);
        if ("line" in cue) cue.line = captionPosition === "top" ? 10 : captionPosition === "middle" ? 50 : "auto";
      }
      appliedCaptionOffsets.current.set(textTrack, offset);
    };
    const trackElements = [...element.querySelectorAll("track")];
    trackElements.forEach((track) => track.addEventListener("load", applySettings));
    const timer = window.setTimeout(applySettings, 250);
    return () => { window.clearTimeout(timer); trackElements.forEach((track) => track.removeEventListener("load", applySettings)); };
  }, [captionPosition, captionTimingOffset, currentSrc, selectedTrack, subtitles]);

  useEffect(() => {
    if (!nextCountdown) return;
    if (nextCountdown <= 1) { window.location.assign(nextUrl); return; }
    const timer = window.setTimeout(() => setNextCountdown((value) => value === null ? null : value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [nextCountdown, nextUrl]);

  const playNext = useCallback(() => { if (nextUrl) window.location.assign(nextUrl); }, [nextUrl]);
  const recordView = useCallback(() => {
    if (viewRecorded.current) return;
    viewRecorded.current = true;
    fetch("/api/view-events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ titleId, episodeId }) }).catch(() => {});
  }, [titleId, episodeId]);

  const togglePlay = useCallback(() => { const element = video.current; if (!element) return; if (element.paused) void element.play().then(recordView).catch(() => {}); else element.pause(); }, [recordView]);
  const toggleFullscreen = useCallback(() => { if (!frame.current) return; if (document.fullscreenElement) void document.exitFullscreen(); else void frame.current.requestFullscreen?.(); }, []);
  const changeTrack = useCallback((index: number) => { setSelectedTrack(index); savePreferences({ subtitleLanguage: index < 0 ? "off" : subtitles[index]?.language || "si" }); }, [savePreferences, subtitles]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      if (![" ", "k", "K", "ArrowLeft", "ArrowRight", "f", "F", "m", "M", "c", "C", "t", "T", "n", "N"].includes(event.key)) return;
      if (!frame.current) return;
      event.preventDefault();
      const element = video.current;
      if (event.key === " " || event.key.toLowerCase() === "k") togglePlay();
      else if (event.key === "ArrowLeft" && element) element.currentTime = Math.max(0, element.currentTime - 10);
      else if (event.key === "ArrowRight" && element) element.currentTime = Math.min(element.duration || Infinity, element.currentTime + 10);
      else if (event.key.toLowerCase() === "f") toggleFullscreen();
      else if (event.key.toLowerCase() === "m" && element) element.muted = !element.muted;
      else if (event.key.toLowerCase() === "c") changeTrack(selectedTrack >= 0 ? -1 : Math.max(0, subtitles.findIndex((track) => track.language.toLowerCase().startsWith("si"))));
      else if (event.key.toLowerCase() === "t") setTheater((value) => !value);
      else if (event.key.toLowerCase() === "n" && nextUrl) playNext();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [changeTrack, nextUrl, playNext, selectedTrack, subtitles, toggleFullscreen, togglePlay]);

  function revealControls() {
    setControlsVisible(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    if (!reducedMotion && video.current && !video.current.paused) hideTimer.current = window.setTimeout(() => setControlsVisible(false), 2600);
  }
  const captionStyle = { "--caption-size": `${captionSize}px`, "--caption-color": captionColor, "--caption-bg": `rgba(0,0,0,${captionBackground})` } as React.CSSProperties;

  return <div className={"watch-player-shell" + (theater ? " is-theater" : "")}>
    <div ref={frame} className={`video-frame${controlsVisible ? "" : " controls-hidden"}${showCaptionSettings ? " captions-open" : ""}`} style={captionStyle} onMouseMove={revealControls} onMouseLeave={() => { if (!video.current?.paused && !reducedMotion) setControlsVisible(false); }}>
      {isEmbed ? <iframe key={currentSrc} className="video-embed" src={currentSrc} title="Authorized third-party video player" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" sandbox="allow-forms allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"/> : currentSrc ? <video ref={video} controls playsInline preload="metadata" onLoadedMetadata={() => { applyResume(); if (video.current) { video.current.volume = volume; video.current.playbackRate = playbackSpeed; } }} onPlay={recordView} onTimeUpdate={() => { const now = Date.now(); if (now - lastSave.current > 10000) { lastSave.current = now; saveProgress(); } }} onPause={saveProgress} onEnded={() => { saveProgress(); if (nextUrl) setNextCountdown(10); }} onRateChange={() => { if (video.current && video.current.playbackRate !== playbackSpeed) setPlaybackSpeed(video.current.playbackRate); }} onVolumeChange={() => { if (video.current && Math.abs(video.current.volume - volume) > 0.01) { setVolume(video.current.volume); savePreferences({ volume: video.current.volume }); } }} onError={() => setError("This source could not be played. Trying the next configured source…")}>{subtitles.map((track, index) => <track key={`${track.language}-${track.file_url}`} kind={track.kind === "captions" ? "captions" : "subtitles"} src={track.file_url} srcLang={track.language} label={track.label} default={index === selectedTrack}/>)}</video> : <div className="video-unavailable"><span className="unavailable-moon">☾</span><span className="eyebrow">A QUIET PLACEHOLDER</span><h2>This episode isn’t streaming yet.</h2><p>No authorized video source has been configured. An administrator can add a licensed source in the dashboard.</p><span className="demo-warning">No playback was started.</span></div>}
      {currentSrc && !isEmbed && <div className="player-overlay-controls" aria-label="Playback options">
        <label>Quality<select aria-label="Video quality" value={quality} onChange={(event) => { setQuality(event.target.value); setSourceIndex(0); setError(""); savePreferences({ quality: event.target.value }); }}><option value="auto">Auto</option>{["480p", "720p", "1080p"].map((value) => qualitySources.some((source) => source.quality === value) || availableSources.some((source) => source.quality === value) ? <option key={value} value={value}>{value}</option> : null)}</select></label>
        <label>Speed<select aria-label="Playback speed" value={playbackSpeed} onChange={(event) => { const nextSpeed=Number(event.target.value);setPlaybackSpeed(nextSpeed);if (video.current) video.current.playbackRate = nextSpeed; }}><option value="0.5">0.5×</option><option value="0.75">0.75×</option><option value="1">Normal</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label>
        {subtitles.length > 0 && <><label>Subtitles<select aria-label="Subtitle language" value={selectedTrack} onChange={(event) => changeTrack(Number(event.target.value))}><option value={-1}>Off</option>{subtitles.map((track, index) => <option key={`${track.language}-${index}`} value={index}>{track.label}</option>)}</select></label><button type="button" onClick={() => setShowCaptionSettings((value) => !value)} aria-expanded={showCaptionSettings}>CC settings</button></>}
        <button type="button" onClick={() => { const element = video.current as (HTMLVideoElement & { requestPictureInPicture?: () => Promise<PictureInPictureWindow> }) | null; if (element?.requestPictureInPicture) void element.requestPictureInPicture().catch(() => {}); }} disabled={!video.current || !("pictureInPictureEnabled" in document)} aria-label="Picture in picture">PiP</button>
        <button type="button" onClick={() => setTheater((value) => !value)} aria-pressed={theater}>{theater ? "Exit theater" : "Theater"}</button><button type="button" onClick={toggleFullscreen} aria-label="Toggle fullscreen">Fullscreen</button>
      </div>}
      {currentSrc && isEmbed && <div className="player-overlay-controls" aria-label="Embedded player options"><button type="button" onClick={() => setTheater((value) => !value)} aria-pressed={theater}>{theater ? "Exit theater" : "Theater"}</button><button type="button" onClick={toggleFullscreen} aria-label="Toggle fullscreen">Fullscreen</button></div>}
      {showCaptionSettings && !isEmbed && <div className="caption-settings" aria-label="Subtitle appearance"><label>Text size<input type="range" min="14" max="40" step="1" value={captionSize} onChange={(event) => setCaptionSize(Number(event.target.value))}/></label><label>Text color<input type="color" value={captionColor} onChange={(event) => setCaptionColor(event.target.value)}/></label><label>Background<input type="range" min="0" max="1" step="0.05" value={captionBackground} onChange={(event) => setCaptionBackground(Number(event.target.value))}/></label><label>Position<select value={captionPosition} onChange={(event) => setCaptionPosition(event.target.value)}><option value="bottom">Bottom</option><option value="middle">Middle</option><option value="top">Top</option></select></label><label>Timing offset ({captionTimingOffset > 0 ? "+" : ""}{captionTimingOffset.toFixed(1)} s)<input type="range" min="-10" max="10" step="0.5" value={captionTimingOffset} onChange={(event) => setCaptionTimingOffset(Number(event.target.value))}/></label></div>}
      {error && <p className="player-error" role="alert">{qualitySources.length > 1 ? error : "The stream could not be played. Check the configured source URL and try again."}</p>}
      {resumeNote && <p className="player-resume-note" role="status">{resumeNote}</p>}
      {nextCountdown !== null && <div className="next-episode-card" role="status"><span>Next episode starts in <strong>{nextCountdown}</strong></span><div><button type="button" className="button button-primary" onClick={playNext}>Play next</button><button type="button" className="button button-glass" onClick={() => setNextCountdown(null)}>Cancel</button></div></div>}
    </div>
  </div>;
}
