"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { isLikelyEmbedInput, normalizeVideoSourceInput } from "@/lib/video-source-utils";

type TitleOption = { id: string; title: string; type: string; episodes: Array<{ id: string; title: string; episode_number: number; season_number: number }> };
type StudioData = { sources: any[]; downloads: any[]; reports: any[]; requests: any[]; popular: any[]; settings: Record<string, string> };

export function StreamingStudio() {
  const [titles, setTitles] = useState<TitleOption[]>([]);
  const [data, setData] = useState<StudioData>({ sources: [], downloads: [], reports: [], requests: [], popular: [], settings: {} });
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState("");
  const [episodeId, setEpisodeId] = useState("");
  const [sourceKind, setSourceKind] = useState("mp4");
  const [sourceQuality, setSourceQuality] = useState("auto");
  const [sourceUrl, setSourceUrl] = useState("");
  const [downloadQuality, setDownloadQuality] = useState("720p");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [hostLabel, setHostLabel] = useState("");
  const [sizeMb, setSizeMb] = useState("");

  const refresh = useCallback(async () => {
    const [streaming, catalog] = await Promise.all([fetch("/api/admin/streaming", { cache: "no-store" }), fetch("/api/admin/titles", { cache: "no-store" })]);
    const streamData = await streaming.json();
    const catalogData = await catalog.json();
    if (!streaming.ok || !catalog.ok) throw new Error(streamData.error || catalogData.error || "Streaming admin data could not be loaded.");
    setData({ sources: streamData.sources || [], downloads: streamData.downloads || [], reports: streamData.reports || [], requests: streamData.requests || [], popular: streamData.popular || [], settings: streamData.settings || {} });
    setTitles((catalogData.items || []).map((title: any) => ({ ...title, episodes: (title.episodes || []).map((ep: any) => ({ id: ep.id, title: ep.title, episode_number: ep.episode_number, season_number: ep.season_number })) })));
  }, []);

  useEffect(() => { void refresh().catch((reason) => setError(reason instanceof Error ? reason.message : "Streaming admin data could not be loaded.")); }, [refresh]);

  async function send(body: Record<string, unknown>) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/streaming", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The change could not be saved.");
      setNotice("Saved."); await refresh();
      return true;
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The change could not be saved."); return false; }
    finally { setBusy(false); }
  }

  function selectTarget(value: string) { setTarget(value); setEpisodeId(""); }
  function updateSourceUrl(value: string) {
    setSourceUrl(value);
    if (isLikelyEmbedInput(value)) setSourceKind("embed");
    else if (/\.(?:m3u8|mp4|m4v|webm|ogv)(?:[?#]|$)/i.test(value)) {
      const detected = normalizeVideoSourceInput(value);
      if (detected && detected.kind !== "embed") setSourceKind(detected.kind);
    }
  }
  const selected = titles.find((title) => title.id === target);
  const episodeOptions = selected?.episodes || [];

  async function addSource(event: FormEvent) {
    event.preventDefault();
    if (await send({ action: "source", titleId: target, episodeId, kind: sourceKind, quality: sourceQuality, url: sourceUrl, priority: 0 })) setSourceUrl("");
  }
  async function addDownload(event: FormEvent) {
    event.preventDefault();
    if (await send({ action: "download", titleId: target, episodeId, quality: downloadQuality, url: downloadUrl, hostLabel, sizeMb })) { setDownloadUrl(""); setHostLabel(""); setSizeMb(""); }
  }

  return <div className="streaming-studio">
    <div className="admin-page-intro"><h2>Streaming &amp; downloads</h2><p>Manage authorized video sources, direct download links, subtitle downloads, reports, and basic viewing activity.</p></div>
    {error && <p className="admin-error" role="alert">{error}</p>}{notice && <p className="admin-success" role="status">{notice}</p>}
    <section className="admin-section"><div className="admin-section-title"><div><h3>Add an authorized video source</h3><small>Use direct MP4, HLS manifest, or a trusted embed URL for a title or episode.</small></div></div>
      <form className="admin-editor streaming-form" onSubmit={addSource}>
        <label>Title<select required value={target} onChange={(event) => selectTarget(event.target.value)}><option value="">Choose a title…</option>{titles.map((title) => <option key={title.id} value={title.id}>{title.title}</option>)}</select></label>
        <label>Episode (optional)<select value={episodeId} onChange={(event) => setEpisodeId(event.target.value)} disabled={!target}><option value="">Title-level source</option>{episodeOptions.map((episode) => <option key={episode.id} value={episode.id}>S{episode.season_number} · E{episode.episode_number} · {episode.title}</option>)}</select></label>
        <label>Format<select value={sourceKind} onChange={(event) => setSourceKind(event.target.value)}><option value="mp4">MP4</option><option value="hls">HLS (.m3u8)</option><option value="embed">Embed</option></select></label>
        <label>Quality<select value={sourceQuality} onChange={(event) => setSourceQuality(event.target.value)}><option value="auto">Auto</option><option value="480p">480p</option><option value="720p">720p</option><option value="1080p">1080p</option></select></label>
        <label className="wide">Authorized source URL or iframe code<input required type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" value={sourceUrl} onChange={(event) => updateSourceUrl(event.target.value)} placeholder={sourceKind === "embed" ? "https://host.example/e/… or paste the full <iframe> code" : "https://…/video.mp4 or https://…/playlist.m3u8"}/><small>Embed links from supported hosts and pasted iframe code are detected automatically. Only the iframe source URL is saved.</small></label>
        <div className="admin-actions wide"><button className="button button-primary" disabled={busy || !target}>{busy ? "Saving…" : "Add source"}</button></div>
      </form>
    </section>
    <section className="admin-section"><div className="admin-section-title"><div><h3>Add a download link</h3><small>Subtitle downloads can use the same endpoint with quality “Subtitle”.</small></div></div>
      <form className="admin-editor streaming-form" onSubmit={addDownload}>
        <label>Title<select required value={target} onChange={(event) => selectTarget(event.target.value)}><option value="">Choose a title…</option>{titles.map((title) => <option key={title.id} value={title.id}>{title.title}</option>)}</select></label>
        <label>Episode (optional)<select value={episodeId} onChange={(event) => setEpisodeId(event.target.value)} disabled={!target}><option value="">Title-level download</option>{episodeOptions.map((episode) => <option key={episode.id} value={episode.id}>S{episode.season_number} · E{episode.episode_number} · {episode.title}</option>)}</select></label>
        <label>Quality<select value={downloadQuality} onChange={(event) => setDownloadQuality(event.target.value)}><option value="480p">480p</option><option value="720p">720p</option><option value="1080p">1080p</option><option value="subtitle">Subtitle</option></select></label>
        <label>File size (MB)<input type="number" min="0" max="1000000" step="0.1" value={sizeMb} onChange={(event) => setSizeMb(event.target.value)}/></label>
        <label>Host label<input maxLength={80} value={hostLabel} onChange={(event) => setHostLabel(event.target.value)} placeholder="Archive, Drive…"/></label>
        <label className="wide">Download URL<input required type="url" value={downloadUrl} onChange={(event) => setDownloadUrl(event.target.value)} placeholder="https://…"/></label>
        <div className="admin-actions wide"><button className="button button-primary" disabled={busy || !target}>{busy ? "Saving…" : "Add download"}</button></div>
      </form>
    </section>
    <section className="admin-section"><div className="admin-section-title"><div><h3>Download access</h3><small>Require a signed-in account for 1080p downloads.</small></div><label className="admin-inline-check"><input type="checkbox" checked={data.settings.downloads_login_1080p === "true"} onChange={(event) => void send({ action: "setting", login1080: event.target.checked })}/> Require sign-in for 1080p</label></div></section>
    <section className="admin-section"><div className="admin-section-title"><h3>Video sources ({data.sources.length})</h3></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Content</th><th>Format</th><th>Quality</th><th>URL</th><th>Status</th><th>Action</th></tr></thead><tbody>{data.sources.map((source) => <tr key={source.id}><td>{source.title}{source.episode_title && <small className="admin-mobile-title">{source.episode_title}</small>}</td><td>{source.kind}</td><td>{source.quality}</td><td><span className="streaming-url">{source.url}</span></td><td>{source.status}</td><td><button type="button" onClick={() => void send({ action: "status", entity: "source", id: source.id, status: source.status === "active" ? "inactive" : "active" })}>{source.status === "active" ? "Disable" : "Enable"}</button></td></tr>)}{!data.sources.length && <tr><td colSpan={6}>No configured sources.</td></tr>}</tbody></table></div></section>
    <section className="admin-section"><div className="admin-section-title"><h3>Download links ({data.downloads.length})</h3></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Content</th><th>Quality</th><th>Size</th><th>Host</th><th>Status / clicks</th><th>Action</th></tr></thead><tbody>{data.downloads.map((link) => <tr key={link.id}><td>{link.title}{link.episode_title && <small className="admin-mobile-title">{link.episode_title}</small>}</td><td>{link.quality}</td><td>{link.size_mb == null ? "—" : `${link.size_mb} MB`}</td><td>{link.host_label || "—"}</td><td>{link.status} · {link.clicks}</td><td><button type="button" onClick={() => void send({ action: "status", entity: "download", id: link.id, status: link.status === "active" ? "inactive" : "active" })}>{link.status === "active" ? "Disable" : "Enable"}</button></td></tr>)}{!data.downloads.length && <tr><td colSpan={6}>No download links.</td></tr>}</tbody></table></div></section>
    <section className="admin-section"><div className="admin-section-title"><div><h3>Content reports ({data.reports.filter((report) => report.status === "open").length} open)</h3><small>Disable a reported title, episode, source, or download and mark the report resolved.</small></div></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Content</th><th>Type</th><th>Reason</th><th>Details</th><th>Status</th><th>Action</th></tr></thead><tbody>{data.reports.map((report) => <tr key={report.id}><td>{report.content_title}</td><td>{report.target_type}</td><td>{report.reason}</td><td>{report.details || "—"}</td><td><select aria-label={`Status for report ${report.id}`} value={report.status} onChange={(event) => void send({ action: "report-status", id: report.id, status: event.target.value })}><option value="open">Open</option><option value="reviewing">Reviewing</option><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option></select></td><td><button type="button" disabled={report.status === "resolved"} onClick={() => void send({ action: "disable-report-target", id: report.id })}>Disable item</button></td></tr>)}{!data.reports.length && <tr><td colSpan={6}>No reports received.</td></tr>}</tbody></table></div></section>
    <section className="admin-section"><div className="admin-section-title"><h3>Title requests ({data.requests.length})</h3></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Requested title</th><th>Details</th><th>Requested</th><th>Status</th></tr></thead><tbody>{data.requests.map((request) => <tr key={request.id}><td>{request.requested_title}</td><td>{request.details || "—"}</td><td>{request.created_at}</td><td><select aria-label={`Status for ${request.requested_title}`} value={request.status} onChange={(event) => void send({ action: "request-status", id: request.id, status: event.target.value })}><option value="open">Open</option><option value="reviewing">Reviewing</option><option value="added">Added</option><option value="declined">Declined</option></select></td></tr>)}{!data.requests.length && <tr><td colSpan={4}>No title requests.</td></tr>}</tbody></table></div></section>
    <section className="admin-section"><div className="admin-section-title"><div><h3>Popular this week</h3><small>Counts are from play events in the last seven days.</small></div></div><ol className="admin-popular-list">{data.popular.map((item, index) => <li key={item.title_id}><span>{index + 1}. {item.title}</span><strong>{item.views} views</strong></li>)}{!data.popular.length && <li>No play activity yet.</li>}</ol></section>
  </div>;
}
