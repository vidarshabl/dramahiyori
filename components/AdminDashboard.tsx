"use client";

import Link from "next/link";
import {FormEvent,useCallback,useEffect,useState} from "react";
import {useRouter} from "next/navigation";
import {CastStudio,MediaLibrary} from "./AdminCatalogExtensions";

type Tab="overview"|"titles"|"cast"|"media"|"users"|"settings";
const blank={title:"",type:"series",slug:"",alternativeTitle:"",synopsis:"",releaseYear:"",country:"South Korea",status:"completed",runtimeMinutes:"",posterUrl:"",backdropUrl:"",videoUrl:"",contentRating:"",genres:"",subtitleLanguages:"",published:false,featured:false,episodes:"[]"};
const tabs:[Tab,string][]=[["overview","Overview"],["titles","Content"],["cast","Cast & crew"],["media","Media library"],["users","Users"],["settings","Site settings"]];

export function AdminDashboard({name}:{name:string}) {
  const [tab,setTab]=useState<Tab>("overview");
  const [overview,setOverview]=useState<any>(null),[titles,setTitles]=useState<any[]>([]),[users,setUsers]=useState<any[]>([]),[settings,setSettings]=useState<any>({}),[mediaAssets,setMediaAssets]=useState<any[]>([]);
  const [form,setForm]=useState<any>(blank),[gallery,setGallery]=useState<{url:string;caption:string;attribution:string}[]>([]),[editing,setEditing]=useState(false),[query,setQuery]=useState(""),[message,setMessage]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const router=useRouter();

  const loadOverview=useCallback(async()=>{const response=await fetch("/api/admin/overview");if(response.status===403){router.replace("/admin/login");return;}const data=await response.json();if(!response.ok)throw new Error(data.error||"Dashboard overview could not be loaded.");setOverview(data);},[router]);
  const loadTitles=useCallback(async()=>{const response=await fetch("/api/admin/titles");if(response.status===403){router.replace("/admin/login");return;}const data=await response.json();if(!response.ok)throw new Error(data.error||"Content could not be loaded.");setTitles(data.items||[]);},[router]);
  const loadUsers=useCallback(async(search=query)=>{const response=await fetch("/api/admin/users?q="+encodeURIComponent(search));if(response.status===403){router.replace("/admin/login");return;}const data=await response.json();if(!response.ok)throw new Error(data.error||"User accounts could not be loaded.");setUsers(data.items||[]);},[query,router]);
  const loadSettings=useCallback(async()=>{const response=await fetch("/api/admin/settings");if(response.status===403){router.replace("/admin/login");return;}const data=await response.json();if(!response.ok)throw new Error(data.error||"Site settings could not be loaded.");setSettings(data.settings||{});},[router]);
  const loadMedia=useCallback(async()=>{const response=await fetch("/api/admin/media");if(response.status===403){router.replace("/admin/login");return;}const data=await response.json();if(!response.ok)throw new Error(data.error||"Media library could not be loaded.");setMediaAssets(data.items||[]);},[router]);
  useEffect(()=>{void Promise.all([loadOverview(),loadTitles(),loadSettings()]).catch(reason=>setError(reason instanceof Error?reason.message:"Admin data could not be loaded."));},[loadOverview,loadSettings,loadTitles]);
  useEffect(()=>{if(tab==="titles"||tab==="cast")void loadMedia().catch(reason=>setError(reason instanceof Error?reason.message:"Media library could not be loaded."));},[tab,loadMedia]);
  useEffect(()=>{if(tab!=="users")return;const timer=setTimeout(()=>void loadUsers().catch(reason=>setError(reason instanceof Error?reason.message:"User accounts could not be loaded.")),220);return()=>clearTimeout(timer);},[tab,loadUsers]);

  function edit(item:any) {
    setForm({title:item.title,type:item.type,slug:item.slug,alternativeTitle:item.alternative_title||"",synopsis:item.synopsis||"",releaseYear:item.release_year||"",country:item.country||"",status:item.status||"completed",runtimeMinutes:item.runtime_minutes||"",posterUrl:item.poster_url||"",backdropUrl:item.backdrop_url||"",videoUrl:item.video_url||"",contentRating:item.content_rating||"",genres:(item.genres||[]).join(", "),subtitleLanguages:Array.isArray(JSON.parse(item.subtitle_languages||"[]"))?JSON.parse(item.subtitle_languages||"[]").join(", "):"",published:item.published===1,featured:item.featured===1,episodes:JSON.stringify((item.episodes||[]).map((episode:any)=>({title:episode.title,seasonNumber:episode.season_number,episodeNumber:episode.episode_number,synopsis:episode.synopsis,thumbnailUrl:episode.thumbnail_url,durationMinutes:episode.duration_minutes,videoUrl:episode.video_url,subtitles:(episode.subtitles||[]).map((track:any)=>({language:track.language,label:track.label,fileUrl:track.fileUrl,kind:track.kind}))})),null,2),id:item.id});
    setGallery((item.gallery||[]).map((image:any)=>({url:image.image_url,caption:image.caption||"",attribution:image.attribution||""})));
    setEditing(true);setTab("titles");setMessage("");setError("");window.scrollTo({top:0,behavior:"smooth"});
  }
  function newTitle(){setForm({...blank});setGallery([]);setEditing(true);setTab("titles");setMessage("");setError("");}
  async function saveTitle(event:FormEvent) {
    event.preventDefault();setBusy(true);setError("");setMessage("");
    let episodes:any[]=[];
    try{episodes=form.type==="series"?JSON.parse(form.episodes||"[]"):[];if(!Array.isArray(episodes))throw new Error();}
    catch{setError("Check that the episode field is a valid JSON array.");setBusy(false);return;}
    const body={...form,genres:form.genres.split(",").map((value:string)=>value.trim()).filter(Boolean),subtitleLanguages:form.subtitleLanguages.split(",").map((value:string)=>value.trim()).filter(Boolean),episodes,gallery:gallery.filter(image=>image.url.trim())};
    try{const response=await fetch("/api/admin/titles",{method:form.id?"PUT":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw new Error(data.error||"The title could not be saved.");setMessage("Title saved.");setEditing(false);await Promise.all([loadTitles(),loadOverview()]);}
    catch(reason){setError(reason instanceof Error?reason.message:"Please try again.");}
    finally{setBusy(false);}
  }
  async function deleteTitle(item:any) {
    if(!confirm(`Delete “${item.title}” and its episodes? This cannot be undone.`))return;
    setError("");
    try{const response=await fetch("/api/admin/titles?id="+encodeURIComponent(item.id),{method:"DELETE"});const data=await response.json();if(!response.ok)throw new Error(data.error||"Could not delete the title.");if(form.id===item.id)setEditing(false);setMessage("Title deleted.");await Promise.all([loadTitles(),loadOverview()]);}
    catch(reason){setError(reason instanceof Error?reason.message:"Could not delete the title.");}
  }
  async function toggleUser(user:any) {
    const status=user.status==="active"?"disabled":"active";
    if(!confirm((status==="disabled"?"Disable ":"Re-enable ")+user.email+"?"))return;
    const response=await fetch("/api/admin/users",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:user.id,status})});const data=await response.json();
    if(!response.ok){setError(data.error||"Account update failed.");return;}
    await Promise.all([loadUsers(),loadOverview()]);
  }
  async function saveSettings(event:FormEvent) {
    event.preventDefault();setError("");setMessage("");
    const response=await fetch("/api/admin/settings",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(settings)});const data=await response.json();
    if(!response.ok){setError(data.error||"Settings could not be saved.");return;}
    setMessage("Settings saved.");
  }
  async function logout(){await fetch("/api/auth/logout",{method:"POST"});router.push("/admin/login");router.refresh();}
  const pageTitle=tabs.find(([key])=>key===tab)?.[1]||"Admin";
  const mediaUrls=mediaAssets.map(asset=>asset.url);

  return <main className="admin-layout">
    <aside className="admin-sidebar"><Link href="/" className="brand"><span className="brand-mark">✦</span><span>dear<span className="brand-script">drama</span><small>ADMIN STUDIO</small></span></Link><span className="admin-label">WORKSPACE</span><nav className="admin-nav">{tabs.map(([key,label])=><button key={key} type="button" className={tab===key?"active":""} onClick={()=>{setTab(key);setMessage("");setError("");}}>{label}</button>)}</nav><div className="admin-side-foot"><span>Signed in as {name}</span><button className="button button-glass" onClick={logout}>Sign out</button><Link href="/">← Public site</Link></div></aside>
    <section className="admin-content">
      <div className="admin-topbar"><div><span>DEARDRAMA · ADMIN STUDIO</span><h1>{pageTitle}</h1><div className="admin-mobile-title">Signed in as {name}</div></div><span className="status-pill live">● Protected session</span></div>
      {message&&<p className="admin-message" role="status">{message}</p>}{error&&<p className="admin-message admin-error" role="alert">{error}</p>}

      {tab==="overview"&&<>
        <div className="admin-page-intro"><h2>Good to see you, {name.split(" ")[0]}.</h2><p>Here is what’s in your DearDrama database right now.</p></div>
        <div className="admin-stats">{[["Registered users",overview?.stats?.users],["Movies",overview?.stats?.movies],["Series",overview?.stats?.series],["Episodes",overview?.stats?.episodes],["Published",overview?.stats?.published],["Drafts",overview?.stats?.drafts],["Cast profiles",overview?.stats?.cast],["Uploaded images",overview?.stats?.media]].map(([label,value])=><div className="admin-stat" key={label as string}><span>{label}</span><strong>{value??"—"}</strong></div>)}</div>
        <section className="admin-section"><div className="admin-section-title"><h3>Recent content updates</h3><button onClick={()=>setTab("titles")}>Manage content →</button></div><AdminTitleTable items={overview?.titles||[]} onEdit={edit} onDelete={deleteTitle}/></section>
        <section className="admin-section"><div className="admin-section-title"><h3>Recent administrator activity</h3></div>{overview?.audit?.length?<div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Action</th><th>Record</th><th>Admin</th><th>When</th></tr></thead><tbody>{overview.audit.map((entry:any,index:number)=><tr key={index}><td>{entry.action}</td><td>{entry.entity_type} · {entry.entity_id.slice(0,8)}</td><td>{entry.email||"Account removed"}</td><td>{entry.created_at}</td></tr>)}</tbody></table></div>:<p className="admin-notice">No sensitive actions have been recorded yet.</p>}</section>
      </>}

      {tab==="titles"&&<>
        <div className="admin-page-intro"><h2>Content library</h2><p>Create and edit movies, series, genres, episodes, galleries, and authorized media URLs.</p></div>
        <div className="admin-section"><div className="admin-section-title"><h3>{editing?(form.id?"Edit title":"New title"):"All titles"}</h3><div className="admin-actions"><button className="button button-primary" type="button" onClick={newTitle}>＋ Add title</button>{editing&&<button className="button button-glass" type="button" onClick={()=>setEditing(false)}>Cancel edit</button>}</div></div>
          {editing&&<form className="admin-editor" onSubmit={saveTitle}>
            <datalist id="admin-media-urls">{mediaUrls.map(url=><option key={url} value={url}/>)}</datalist>
            <label>Title<input required maxLength={160} value={form.title} onChange={event=>setForm({...form,title:event.target.value})}/></label><label>Type<select value={form.type} onChange={event=>setForm({...form,type:event.target.value})}><option value="series">Series</option><option value="movie">Movie</option></select></label>
            <label>URL slug<input value={form.slug} onChange={event=>setForm({...form,slug:event.target.value})} placeholder="generated-from-title"/></label><label>Alternative title<input value={form.alternativeTitle} maxLength={160} onChange={event=>setForm({...form,alternativeTitle:event.target.value})}/></label>
            <label>Release year<input type="number" min="1900" max="2100" value={form.releaseYear} onChange={event=>setForm({...form,releaseYear:event.target.value})}/></label><label>Country<input value={form.country} maxLength={100} onChange={event=>setForm({...form,country:event.target.value})}/></label>
            <label>Completion status<select value={form.status} onChange={event=>setForm({...form,status:event.target.value})}><option value="ongoing">Ongoing</option><option value="completed">Completed</option><option value="upcoming">Upcoming</option></select></label><label>Runtime in minutes (films)<input type="number" min="1" max="600" value={form.runtimeMinutes} onChange={event=>setForm({...form,runtimeMinutes:event.target.value})}/></label>
            <label className="wide">Synopsis<textarea maxLength={5000} value={form.synopsis} onChange={event=>setForm({...form,synopsis:event.target.value})}/></label>
            <label>Genre names<input value={form.genres} onChange={event=>setForm({...form,genres:event.target.value})} placeholder="Romance, Healing Romance"/></label><label>Subtitle languages<input value={form.subtitleLanguages} onChange={event=>setForm({...form,subtitleLanguages:event.target.value})} placeholder="English, Korean"/></label>
            <label>Poster URL<input list="admin-media-urls" type="url" value={form.posterUrl} onChange={event=>setForm({...form,posterUrl:event.target.value})} placeholder="https://…"/></label><label>Backdrop URL<input list="admin-media-urls" type="url" value={form.backdropUrl} onChange={event=>setForm({...form,backdropUrl:event.target.value})} placeholder="https://…"/></label>
            <label>Content rating (only if verified)<input value={form.contentRating} onChange={event=>setForm({...form,contentRating:event.target.value})}/></label><label>Film video URL<input type="url" value={form.videoUrl} onChange={event=>setForm({...form,videoUrl:event.target.value})} placeholder="https://archive.org/download/.../video.mp4"/></label>
            {form.type==="series"&&<label className="wide">Episodes (JSON, ordered as listed)<textarea value={form.episodes} onChange={event=>setForm({...form,episodes:event.target.value})} placeholder='[{"title":"Episode 1","videoUrl":"https://archive.org/download/example/video.mp4"}]'/><small>Each entry supports title, synopsis, thumbnailUrl, durationMinutes, and videoUrl. Video URLs may use any valid HTTPS host.</small></label>}
            <section className="admin-nested-editor wide" aria-label="Title gallery">
              <div className="admin-section-title"><div><h4>Gallery images</h4><small>Add up to 30 images with optional captions and attribution.</small></div><button type="button" disabled={gallery.length>=30} onClick={()=>setGallery(rows=>[...rows,{url:"",caption:"",attribution:""}])}>＋ Add image</button></div>
              {gallery.map((image,index)=><div className="admin-inline-row" key={index}>
                <label>Image URL<input required type="url" list="admin-media-urls" value={image.url} placeholder="https://…" onChange={event=>setGallery(rows=>rows.map((row,i)=>i===index?{...row,url:event.target.value}:row))}/></label>
                <label>Caption<input maxLength={200} value={image.caption} onChange={event=>setGallery(rows=>rows.map((row,i)=>i===index?{...row,caption:event.target.value}:row))}/></label>
                <label>Attribution<input maxLength={200} value={image.attribution} onChange={event=>setGallery(rows=>rows.map((row,i)=>i===index?{...row,attribution:event.target.value}:row))}/></label>
                <button type="button" className="row-remove" aria-label={`Remove gallery image ${index+1}`} onClick={()=>setGallery(rows=>rows.filter((_,i)=>i!==index))}>×</button>
              </div>)}
              {!gallery.length&&<p className="admin-muted">No gallery images added yet.</p>}
            </section>
            <div className="admin-checks wide"><label><input type="checkbox" checked={form.published} onChange={event=>setForm({...form,published:event.target.checked})}/> Published</label><label><input type="checkbox" checked={form.featured} onChange={event=>setForm({...form,featured:event.target.checked})}/> Feature on home page</label></div>
            <div className="admin-actions wide"><button disabled={busy} className="button button-primary">{busy?"Saving…":"Save title"}</button><button type="button" className="button button-glass" onClick={()=>setEditing(false)}>Cancel</button></div>
          </form>}
        </div>
        <section className="admin-section"><div className="admin-section-title"><h3>Catalog</h3></div><AdminTitleTable items={titles} onEdit={edit} onDelete={deleteTitle}/></section>
        <p className="admin-notice">Poster and backdrop fields accept HTTPS image URLs or uploaded library images. Video URLs must be yours to distribute or otherwise licensed.</p>
      </>}

      {tab==="cast"&&<CastStudio assetUrls={mediaUrls}/>}
      {tab==="media"&&<MediaLibrary onChanged={()=>void loadMedia()}/>}

      {tab==="users"&&<>
        <div className="admin-page-intro"><h2>Community accounts</h2><p>Only basic account details are shown. Public registration cannot grant admin access.</p></div>
        <section className="admin-section"><div className="admin-section-title"><h3>Registered users</h3><input className="admin-search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search email or display name"/></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Display name</th><th>Email</th><th>Status</th><th>Joined</th><th>Action</th></tr></thead><tbody>{users.map(user=><tr key={user.id}><td>{user.display_name}</td><td>{user.email}</td><td><span className={"status-pill "+(user.status==="active"?"live":"draft")}>{user.status}</span></td><td>{user.created_at}</td><td><button onClick={()=>void toggleUser(user)}>{user.status==="active"?"Disable":"Re-enable"}</button></td></tr>)}</tbody></table></div></section>
        <p className="admin-notice">Administrator roles are created with the secure one-time CLI procedure documented in README. Role changes are not available through this public-facing account manager.</p>
      </>}

      {tab==="settings"&&<>
        <div className="admin-page-intro"><h2>Site identity</h2><p>These fields are stored in the database and can be changed at any time.</p></div>
        <form className="settings-card" onSubmit={saveSettings}><label>Brand name<input value={settings.brand||""} onChange={event=>setSettings({...settings,brand:event.target.value})}/></label><label>Tagline<input value={settings.tagline||""} onChange={event=>setSettings({...settings,tagline:event.target.value})}/></label><label>Contact email<input type="email" value={settings.contactEmail||""} onChange={event=>setSettings({...settings,contactEmail:event.target.value})}/></label><label>About copy<textarea value={settings.about||""} onChange={event=>setSettings({...settings,about:event.target.value})}/></label><button className="button button-primary">Save site settings</button></form>
      </>}
    </section>
  </main>;
}

function AdminTitleTable({items,onEdit,onDelete}:{items:any[];onEdit:(item:any)=>void;onDelete:(item:any)=>void}) {
  return <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Title</th><th>Type</th><th>Updated</th><th>Visibility</th><th>Actions</th></tr></thead><tbody>{items.map(item=><tr key={item.id}><td>{item.title}<div className="admin-mobile-title">{item.slug}</div></td><td>{item.type}</td><td>{item.updated_at}</td><td><span className={"status-pill "+(item.published?"live":"draft")}>{item.published?"Published":"Draft"}</span></td><td><div className="admin-user-actions"><button type="button" onClick={()=>onEdit(item)}>Edit</button><button type="button" onClick={()=>onDelete(item)}>Delete</button></div></td></tr>)}{!items.length&&<tr><td colSpan={5}>No titles yet.</td></tr>}</tbody></table></div>;
}
