"use client";

import { FormEvent, useEffect, useState } from "react";

export function TitleRequestForm() {
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [items, setItems] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => { fetch("/api/title-requests").then((response) => response.json()).then((data) => setItems(data.items || [])).catch(() => {}); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/title-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, details }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The request could not be sent.");
      setMessage(data.trackingAvailable ? "Request sent. You can see status updates below while signed in." : "Request sent. Sign in before requesting to track status in your account.");
      setTitle(""); setDetails("");
      const updated = await fetch("/api/title-requests").then((result) => result.json()); setItems(updated.items || []);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Please try again later."); }
    finally { setBusy(false); }
  }

  return <div className="request-title-wrap"><form className="settings-card" onSubmit={submit}><label>Title<input required minLength={2} maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Drama or movie name"/></label><label>More details<textarea maxLength={1000} value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Country, year, or another detail that helps identify it"/></label>{error && <p className="admin-error" role="alert">{error}</p>}{message && <p className="admin-success" role="status">{message}</p>}<button className="button button-primary" disabled={busy}>{busy ? "Sending…" : "Send request"}</button></form>
    {!!items.length && <section className="admin-section"><div className="admin-section-title"><h2>Your requests</h2></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Title</th><th>Requested</th><th>Status</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{item.requested_title}</td><td>{item.created_at}</td><td>{item.status}</td></tr>)}</tbody></table></div></section>}
  </div>;
}
