"use client";

import { FormEvent, useState } from "react";

export function ReportForm({ targetType = "", targetId = "" }: { targetType?: string; targetId?: string }) {
  const [type, setType] = useState(targetType || "title");
  const [id, setId] = useState(targetId);
  const [reason, setReason] = useState("broken_link");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(""); setError("");
    try {
      const response = await fetch("/api/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetType: type, targetId: id, reason, details }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The report could not be sent.");
      setMessage("Your report has been sent for review. Thank you."); setDetails("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Please try again later."); }
    finally { setBusy(false); }
  }

  return <form className="settings-card report-form" onSubmit={submit}>
    <label>Report type<select value={type} onChange={(event) => setType(event.target.value)}><option value="title">Title</option><option value="episode">Episode</option><option value="video_source">Video source</option><option value="download">Download link</option></select></label>
    <label>Content ID<input required maxLength={80} value={id} onChange={(event) => setId(event.target.value)} placeholder="Use the report link on a title or episode page"/></label>
    <label>Reason<select value={reason} onChange={(event) => setReason(event.target.value)}><option value="broken_link">Broken link</option><option value="wrong_subtitles">Subtitle issue</option><option value="inappropriate">Inappropriate content</option><option value="rights_concern">Rights concern</option><option value="other">Other</option></select></label>
    <label>Details<textarea maxLength={1000} value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Share enough detail for the administrator to find the issue."/></label>
    {error && <p className="admin-error" role="alert">{error}</p>}{message && <p className="admin-success" role="status">{message}</p>}
    <button className="button button-primary" disabled={busy}>{busy ? "Sending…" : "Send report"}</button>
  </form>;
}
