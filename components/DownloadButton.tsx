"use client";

import { useState } from "react";
import Link from "next/link";

type DownloadState = "idle" | "preparing" | "ready" | "error";

export function DownloadButton({ id, quality, sizeMb, hostLabel }: { id: string; quality: string; sizeMb: number | null; hostLabel: string }) {
  const [state, setState] = useState<DownloadState>("idle");
  const [message, setMessage] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  const href = `/api/download/${encodeURIComponent(id)}`;
  const label = quality === "subtitle" ? "Subtitle file" : `${quality} download`;

  async function prepare() {
    if (state === "ready") {
      window.location.assign(href);
      return;
    }
    setState("preparing");
    setMessage("");
    setNeedsLogin(false);
    try {
      const response = await fetch(href, { method: "HEAD", cache: "no-store" });
      if (response.status === 401) {
        setNeedsLogin(true);
        setMessage("Sign in to download this quality.");
        setState("error");
        return;
      }
      if (response.status === 404) throw new Error("This download is no longer available.");
      if (response.status === 429) throw new Error("Too many requests. Please wait a minute and retry.");
      if (!response.ok) throw new Error("Could not prepare this download. Please retry.");
      setState("ready");
      window.setTimeout(() => window.location.assign(href), 450);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not prepare this download. Please retry.");
      setState("error");
    }
  }

  return <div className="download-option">
    <button type="button" className={`button button-outline download-action is-${state}`} onClick={() => void prepare()} disabled={state === "preparing"} aria-label={`${label}${sizeMb == null ? "" : `, ${sizeMb} megabytes`}${hostLabel ? `, hosted by ${hostLabel}` : ""}`}>
      <span className="download-action-label">{state === "preparing" ? "Preparing…" : state === "ready" ? "Starting…" : state === "error" ? "Retry download" : label}</span>
      {state === "preparing" ? <span className="download-spinner" aria-hidden="true"/> : state === "ready" ? <span aria-hidden="true">✓</span> : null}
      <small>{sizeMb == null ? hostLabel : `${sizeMb} MB${hostLabel ? ` · ${hostLabel}` : ""}`}</small>
    </button>
    {message && <p className="download-status" role={needsLogin ? "status" : "alert"}>{message}{needsLogin&&<Link href={`/login?next=${encodeURIComponent(href)}`}> Sign in ↗</Link>}</p>}
    <span className="sr-only" aria-live="polite">{state === "preparing" ? "Preparing download" : state === "ready" ? "Download is ready" : ""}</span>
  </div>;
}
