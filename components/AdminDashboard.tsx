"use client";

import Link from "next/link";
import {FormEvent,useCallback,useEffect,useState} from "react";
import {useRouter} from "next/navigation";
import {CastStudio,MediaLibrary,SortablePhotoEditor,type MediaItem} from "./AdminCatalogExtensions";
import {BatchImageUploader} from "./BatchImageUploader";
import {RemoteImage} from "./RemoteImage";
import {HomePhotoEditor} from "./HomePhotoEditor";

type Tab="overview"|"homeEditor"|"titles"|"cast"|"media"|"users"|"settings";
type SubtitleInput={language:string;label:string;fileUrl:string;kind:"subtitles"|"captions"};
type EpisodeInput={id?:string;editorId:string;title:string;seasonNumber:number;episodeNumber:number;synopsis:string;thumbnailUrl:string;durationMinutes:string;videoUrl:string;subtitles:SubtitleInput[]};
const blank={title:"",type:"series",slug:"",alternativeTitle:"",synopsis:"",releaseYear:"",country:"South Korea",status:"completed",runtimeMinutes:"",posterUrl:"",backdropUrl:"",videoUrl:"",contentRating:"",genres:"",subtitleLanguages:"",published:false,featured:false,featuredOrder:0};
const tabs:[Tab,string][]=[["overview","Overview"],["homeEditor","Home editor"],["titles","Content"],["cast","Cast & crew"],["media","Media library"],["users","Users"],["settings","Site settings"]];
const nextEditorId=()=>crypto.randomUUID();
function previewImageUrl(value:string):string|null {
  try { const url=new URL(value.trim()); return url.protocol==="https:"&&url.hostname?url.toString():null; }
  catch { return null; }
}

export function AdminDashboard({name}:{name:string}) {
  const [tab,setTab]=useState<Tab>("overview");
  const [overview,setOverview]=useState<any>(null),[titles,setTitles]=useState<any[]>([]),[users,setUsers]=useState<any[]>([]),[settings,setSettings]=useState<any>({}),[mediaAssets,setMediaAssets]=useState<any[]>([]);
  const [form,setForm]=useState<any>(blank),[gallery,setGallery]=useState<{url:string;caption:string;attribution:string}[]>([]),[episodes,setEpisodes]=useState<EpisodeInput[]>([]),[editing,setEditing]=useState(false),[query,setQuery]=useState(""),[message,setMessage]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const router=useRouter();

  const loadOverview=useCallback(async()=>{const response=await fetch("/api/admin/overview");if(response.status===403){router.replace("/admin/login");return;}const data=await response.json();if(!response.ok)throw new Error(data.error||"Dashboard overview could not be loaded.");setOverview(data);},[router]);
  const loadTitles=useCallback(async()=>{const response=await fetch("/api/admin/titles");if(response.status===403){router.replace("/admin/login");return;}const data=await response.json();if(!response.ok)throw new Error(data.error||"Content could not be loaded.");setTitles(data.items||[]);},[router]);
  const loadUsers=useCallback(async(search=query)=>{const response=await fetch("/api/admin/users?q="+encodeURIComponent(search));if(response.status===403){router.replace("/admin/login");return;}const data=await response.json();if(!response.ok)throw new Error(data.error||"User accounts could not be loaded.");setUsers(data.items||[]);},[query,router]);
  const loadSettings=useCallback(async()=>{const response=await fetch("/api/admin/settings");if(response.status===403){router.replace("/admin/login");return;}const data=await response.json();if(!response.ok)throw new Error(data.error||"Site settings could not be loaded.");setSettings(data.settings||{});},[router]);
  const loadMedia=useCallback(async()=>{const response=await fetch("/api/admin/media");if(response.status===403){router.replace("/admin/login");return;}const data=await response.json();if(!response.ok)throw new Error(data.error||"Media library could not be loaded.");setMediaAssets(data.items||[]);},[router]);
  useEffect(()=>{void Promise.all([loadOverview(),loadTitles(),loadSettings()]).catch(reason=>setError(reason instanceof Error?reason.message:"Admin data could not be loaded."));},[loadOverview,loadSettings,loadTitles]);
  useEffect(()=>{if(tab==="titles"||tab==="cast"||tab==="homeEditor")void loadMedia().catch(reason=>setError(reason instanceof Error?reason.message:"Media library could not be loaded."));},[tab,loadMedia]);
  useEffect(()=>{if(tab!=="users")return;const timer=setTimeout(()=>void loadUsers().catch(reason=>setError(reason instanceof Error?reason.message:"User accounts could not be loaded.")),220);return()=>clearTimeout(timer);},[tab,loadUsers]);

  function edit(item:any) {
    setForm({title:item.title,type:item.type,slug:item.slug,alternativeTitle:item.alternative_title||"",synopsis:item.synopsis||"",releaseYear:item.release_year||"",country:item.country||"",status:item.status||"completed",runtimeMinutes:item.runtime_minutes||"",posterUrl:item.poster_url||"",backdropUrl:item.backdrop_url||"",videoUrl:item.video_url||"",contentRating:item.content_rating||"",genres:(item.genres||[]).join(", "),subtitleLanguages:Array.isArray(JSON.parse(item.subtitle_languages||"[]"))?JSON.parse(item.subtitle_languages||"[]").join(", "):"",published:item.published===1,featured:item.featured===1,featuredOrder:Number(item.featured_order)||0,id:item.id});
    setEpisodes((item.episodes||[]).map((episode:any)=>({id:episode.id,editorId:nextEditorId(),title:episode.title,seasonNumber:Number(episode.season_number)||1,episodeNumber:Number(episode.episode_number)||1,synopsis:episode.synopsis||"",thumbnailUrl:episode.thumbnail_url||"",durationMinutes:episode.duration_minutes==null?"":String(episode.duration_minutes),videoUrl:episode.video_url||"",subtitles:(episode.subtitles||[]).map((track:any)=>({language:track.language||"",label:track.label||"",fileUrl:track.fileUrl||"",kind:track.kind==="captions"?"captions":"subtitles"}))})));
    setGallery((item.gallery||[]).map((image:any)=>({url:image.image_url,caption:image.caption||"",attribution:image.attribution||""})));
    setEditing(true);setTab("titles");setMessage("");setError("");window.scrollTo({top:0,behavior:"smooth"});
  }
  function newTitle(type:"series"|"movie"="series"){setForm({...blank,type});setGallery([]);setEpisodes([]);setEditing(true);setTab("titles");setMessage("");setError("");}
  async function saveTitle(event:FormEvent) {
    event.preventDefault();setBusy(true);setError("");setMessage("");
    const episodesForSave=form.type==="series"?episodes.map(({editorId,...episode})=>({...episode,durationMinutes:episode.durationMinutes===""?null:Number(episode.durationMinutes)})):[];
    const body={...form,genres:form.genres.split(",").map((value:string)=>value.trim()).filter(Boolean),subtitleLanguages:form.subtitleLanguages.split(",").map((value:string)=>value.trim()).filter(Boolean),episodes:episodesForSave,gallery:gallery.filter(image=>image.url.trim())};
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
  const posterPreview=previewImageUrl(form.posterUrl);
  const backdropPreview=previewImageUrl(form.backdropUrl);

  return <main className="admin-layout">
    <aside className="admin-sidebar"><Link href="/" className="brand"><span className="brand-mark">✦</span><span>dear<span className="brand-script">drama</span><small>ADMIN STUDIO</small></span></Link><span className="admin-label">WORKSPACE</span><nav className="admin-nav">{tabs.map(([key,label])=><button key={key} type="button" className={tab===key?"active":""} onClick={()=>{setTab(key);setMessage("");setError("");}}>{label}</button>)}</nav><div className="admin-side-foot"><span>Signed in as {name}</span><button className="button button-glass" onClick={logout}>Sign out</button><Link href="/">← Public site</Link></div></aside>
    <section className="admin-content">
      <div className="admin-topbar"><div><span>DEARDRAMA · ADMIN STUDIO</span><h1>{pageTitle}</h1><div className="admin-mobile-title">Signed in as {name}</div></div><span className="status-pill live">● Protected session</span></div>
      {message&&<p className="admin-message" role="status">{message}</p>}{error&&<p className="admin-message admin-error" role="alert">{error}</p>}

      {tab==="overview"&&<>
        <div className="admin-page-intro"><h2>Good to see you, {name.split(" ")[0]}.</h2><p>Here is what’s in your DearDrama database right now.</p></div>
        <div className="admin-quick-actions"><button className="button button-primary" onClick={()=>newTitle("series")}>＋ Add drama</button><button className="button button-glass" onClick={()=>newTitle("movie")}>＋ Add movie</button><button className="button button-glass" onClick={()=>{setTab("cast");setMessage("");setError("");}}>＋ Add cast member</button><button className="button button-glass" onClick={()=>setTab("media")}>＋ Upload photos</button></div>
        <div className="admin-stats">{[["Registered users",overview?.stats?.users],["Movies",overview?.stats?.movies],["Series",overview?.stats?.series],["Episodes",overview?.stats?.episodes],["Published",overview?.stats?.published],["Drafts",overview?.stats?.drafts],["Cast profiles",overview?.stats?.cast],["Uploaded images",overview?.stats?.media]].map(([label,value])=><div className="admin-stat" key={label as string}><span>{label}</span><strong>{value??"—"}</strong></div>)}</div>
        <section className="admin-section"><div className="admin-section-title"><h3>Recent content updates</h3><button onClick={()=>setTab("titles")}>Manage content →</button></div><AdminTitleTable items={overview?.titles||[]} onEdit={edit} onDelete={deleteTitle}/></section>
        <section className="admin-section"><div className="admin-section-title"><h3>Recent administrator activity</h3></div>{overview?.audit?.length?<div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Action</th><th>Record</th><th>Admin</th><th>When</th></tr></thead><tbody>{overview.audit.map((entry:any,index:number)=><tr key={index}><td>{entry.action}</td><td>{entry.entity_type} · {entry.entity_id.slice(0,8)}</td><td>{entry.email||"Account removed"}</td><td>{entry.created_at}</td></tr>)}</tbody></table></div>:<p className="admin-notice">No sensitive actions have been recorded yet.</p>}</section>
      </>}

      {tab==="homeEditor"&&<HomePhotoEditor titles={titles} assets={mediaAssets} onSaved={async()=>{await Promise.all([loadTitles(),loadOverview()]);}} onAssetsChanged={loadMedia} onAddTitle={()=>newTitle("series")}/>}

      {tab==="titles"&&<>
        <div className="admin-page-intro"><h2>Content library</h2><p>Create and edit movies, series, genres, episodes, galleries, and authorized media URLs.</p></div>
        <div className="admin-section"><div className="admin-section-title"><h3>{editing?(form.id?"Edit title":"New title"):"All titles"}</h3><div className="admin-actions"><button className="button button-primary" type="button" onClick={()=>newTitle()}>＋ Add title</button>{editing&&<button className="button button-glass" type="button" onClick={()=>setEditing(false)}>Cancel edit</button>}</div></div>
          {editing&&<form className="admin-editor" onSubmit={saveTitle}>
            <datalist id="admin-media-urls">{mediaUrls.map(url=><option key={url} value={url}/>)}</datalist>
            <label>Title<input required maxLength={160} value={form.title} onChange={event=>setForm({...form,title:event.target.value})}/></label><label>Type<select value={form.type} onChange={event=>setForm({...form,type:event.target.value})}><option value="series">Series</option><option value="movie">Movie</option></select></label>
            <label>URL slug<input value={form.slug} onChange={event=>setForm({...form,slug:event.target.value})} placeholder="generated-from-title"/></label><label>Alternative title<input value={form.alternativeTitle} maxLength={160} onChange={event=>setForm({...form,alternativeTitle:event.target.value})}/></label>
            <label>Release year<input type="number" min="1900" max="2100" value={form.releaseYear} onChange={event=>setForm({...form,releaseYear:event.target.value})}/></label><label>Country<input value={form.country} maxLength={100} onChange={event=>setForm({...form,country:event.target.value})}/></label>
            <label>Completion status<select value={form.status} onChange={event=>setForm({...form,status:event.target.value})}><option value="ongoing">Ongoing</option><option value="completed">Completed</option><option value="upcoming">Upcoming</option></select></label><label>Runtime in minutes (films)<input type="number" min="1" max="600" value={form.runtimeMinutes} onChange={event=>setForm({...form,runtimeMinutes:event.target.value})}/></label>
            <label className="wide">Synopsis<textarea maxLength={5000} value={form.synopsis} onChange={event=>setForm({...form,synopsis:event.target.value})}/></label>
            <label>Genre names<input value={form.genres} onChange={event=>setForm({...form,genres:event.target.value})} placeholder="Romance, Healing Romance"/></label><label>Subtitle languages<input value={form.subtitleLanguages} onChange={event=>setForm({...form,subtitleLanguages:event.target.value})} placeholder="English, Korean"/></label>
            <label>Poster URL<input list="admin-media-urls" type="url" value={form.posterUrl} onChange={event=>setForm({...form,posterUrl:event.target.value})} placeholder="https://…"/>{!!mediaAssets.length&&<select aria-label="Choose an uploaded poster" value={mediaAssets.some(asset=>asset.url===form.posterUrl)?form.posterUrl:""} onChange={event=>setForm({...form,posterUrl:event.target.value})}><option value="">Choose from media library…</option>{mediaAssets.map(asset=><option key={asset.id} value={asset.url}>{asset.filename} · {asset.role}</option>)}</select>}{posterPreview?<div className="admin-image-url-preview admin-image-url-preview-poster" role="img" aria-label="Poster preview"><RemoteImage src={posterPreview} alt="Poster preview" sizes="110px" fallbackLabel="Poster preview"/></div>:<small className="admin-image-preview-hint">Enter a complete HTTPS image URL to preview the poster. Save the title to apply it.</small>}</label>
            <label>Backdrop URL<input list="admin-media-urls" type="url" value={form.backdropUrl} onChange={event=>setForm({...form,backdropUrl:event.target.value})} placeholder="https://…"/>{!!mediaAssets.length&&<select aria-label="Choose an uploaded backdrop" value={mediaAssets.some(asset=>asset.url===form.backdropUrl)?form.backdropUrl:""} onChange={event=>setForm({...form,backdropUrl:event.target.value})}><option value="">Choose from media library…</option>{mediaAssets.map(asset=><option key={asset.id} value={asset.url}>{asset.filename} · {asset.role}</option>)}</select>}{backdropPreview?<div className="admin-image-url-preview admin-image-url-preview-backdrop" role="img" aria-label="Backdrop preview"><RemoteImage src={backdropPreview} alt="Backdrop preview" sizes="(max-width: 650px) 100vw, 540px" fallbackLabel="Backdrop preview"/></div>:<small className="admin-image-preview-hint">Enter a complete HTTPS image URL to preview the backdrop. Save the title to apply it.</small>}</label>
            <label>Content rating (only if verified)<input value={form.contentRating} onChange={event=>setForm({...form,contentRating:event.target.value})}/></label><label>Film video URL<input type="url" value={form.videoUrl} onChange={event=>setForm({...form,videoUrl:event.target.value})} placeholder="https://archive.org/download/.../video.mp4"/></label>
            <BatchImageUploader title="Upload title images" description="Drop several files at once; assign each as a poster, backdrop, or gallery photo. Save this title to persist the assignments." roles={[{value:"poster",label:"Main poster"},{value:"backdrop",label:"Hero backdrop"},{value:"gallery",label:"Gallery photo"}]} onUploaded={(asset,role)=>{if(role==="poster")setForm((current:any)=>({...current,posterUrl:asset.url}));else if(role==="backdrop")setForm((current:any)=>({...current,backdropUrl:asset.url}));else setGallery((current:{url:string;caption:string;attribution:string}[])=>current.length>=30?current:[...current,{url:asset.url,caption:asset.filename.replace(/\.[^.]+$/,""),attribution:""}]);setMessage("Image uploaded and assigned. Save the title to keep the association.");}}/>
            {form.type==="series"&&<EpisodeEditor episodes={episodes} setEpisodes={setEpisodes} assets={mediaAssets}/>}
            <SortablePhotoEditor label="Title gallery" description="Drag photographs to reorder; use the arrow buttons for keyboard-accessible ordering." photos={gallery} onChange={setGallery} assets={mediaAssets} emptyText="No gallery images added yet."/>
            <div className="admin-checks wide"><label><input type="checkbox" checked={form.published} onChange={event=>setForm({...form,published:event.target.checked})}/> Published</label><label><input type="checkbox" checked={form.featured} onChange={event=>setForm({...form,featured:event.target.checked})}/> Feature on home page</label></div>
            {form.featured&&<label className="wide">Homepage feature order<input type="number" min="0" max="10000" value={form.featuredOrder} onChange={event=>setForm({...form,featuredOrder:event.target.value})}/><small>Lower numbers appear first in the homepage hero carousel.</small></label>}
            <div className="admin-actions wide"><button disabled={busy} className="button button-primary">{busy?"Saving…":"Save title"}</button><button type="button" className="button button-glass" onClick={()=>setEditing(false)}>Cancel</button></div>
          </form>}
        </div>
        <section className="admin-section"><div className="admin-section-title"><h3>Catalog</h3></div><AdminTitleTable items={titles} onEdit={edit} onDelete={deleteTitle}/></section>
        <p className="admin-notice">Poster and backdrop fields accept HTTPS image URLs or uploaded library images. Video URLs must be yours to distribute or otherwise licensed.</p>
      </>}

      {tab==="cast"&&<CastStudio assets={mediaAssets}/>}
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

function EpisodeEditor({episodes,setEpisodes,assets}:{episodes:EpisodeInput[];setEpisodes:(episodes:EpisodeInput[])=>void;assets:MediaItem[]}) {
  function update(id:string,change:Partial<EpisodeInput>){setEpisodes(episodes.map(episode=>episode.editorId===id?{...episode,...change}:episode));}
  function addEpisode(seasonNumber:number){const number=episodes.filter(episode=>episode.seasonNumber===seasonNumber).length+1;setEpisodes([...episodes,{editorId:nextEditorId(),title:"",seasonNumber,episodeNumber:number,synopsis:"",thumbnailUrl:"",durationMinutes:"",videoUrl:"",subtitles:[]}]);}
  function addSeason(){const season=Math.max(0,...episodes.map(episode=>episode.seasonNumber))+1;addEpisode(season);}
  function move(id:string,direction:-1|1){
    const from=episodes.findIndex(episode=>episode.editorId===id);if(from<0)return;const season=episodes[from].seasonNumber,indexes=episodes.map((episode,index)=>episode.seasonNumber===season?index:-1).filter(index=>index>=0),position=indexes.indexOf(from),next=position+direction;if(next<0||next>=indexes.length)return;
    const copy=[...episodes],to=indexes[next];[copy[from],copy[to]]=[copy[to],copy[from]];let number=0;setEpisodes(copy.map(episode=>episode.seasonNumber===season?{...episode,episodeNumber:++number}:episode));
  }
  function remove(id:string){const removed=episodes.find(episode=>episode.editorId===id);if(!removed)return;let number=0;setEpisodes(episodes.filter(episode=>episode.editorId!==id).map(episode=>episode.seasonNumber===removed.seasonNumber?{...episode,episodeNumber:++number}:episode));}
  return <section className="admin-nested-editor wide" aria-label="Seasons and episodes">
    <div className="admin-section-title"><div><h4>Seasons &amp; episodes ({episodes.length})</h4><small>Add and order real episodes. Blank video URLs stay unavailable to viewers.</small></div><div className="admin-actions"><button type="button" disabled={episodes.length>=250} onClick={()=>addEpisode(episodes[episodes.length-1]?.seasonNumber||1)}>＋ Add episode</button><button type="button" disabled={episodes.length>=250} onClick={addSeason}>＋ Add season</button></div></div>
    {episodes.map((episode,index)=><article className="admin-episode-editor" key={episode.editorId}>
      <div className="admin-episode-heading"><strong>Season {episode.seasonNumber} · Episode {episode.episodeNumber}</strong><div><button type="button" disabled={!episodes.some((other,i)=>i<index&&other.seasonNumber===episode.seasonNumber)} onClick={()=>move(episode.editorId,-1)} aria-label={`Move episode ${episode.episodeNumber} up`}>↑</button><button type="button" disabled={!episodes.some((other,i)=>i>index&&other.seasonNumber===episode.seasonNumber)} onClick={()=>move(episode.editorId,1)} aria-label={`Move episode ${episode.episodeNumber} down`}>↓</button><button type="button" className="row-remove" onClick={()=>remove(episode.editorId)} aria-label={`Remove episode ${episode.episodeNumber}`}>×</button></div></div>
      <div className="admin-episode-fields"><label>Episode title<input required maxLength={160} value={episode.title} onChange={event=>update(episode.editorId,{title:event.target.value})}/></label><label>Season number<input type="number" min="1" max="30" value={episode.seasonNumber} onChange={event=>update(episode.editorId,{seasonNumber:Number(event.target.value)})}/></label><label>Episode number<input type="number" min="1" max="500" value={episode.episodeNumber} onChange={event=>update(episode.editorId,{episodeNumber:Number(event.target.value)})}/></label><label>Runtime in minutes<input type="number" min="1" max="600" value={episode.durationMinutes} onChange={event=>update(episode.editorId,{durationMinutes:event.target.value})}/></label>
        <label className="wide">Playback URL<input type="url" value={episode.videoUrl} onChange={event=>update(episode.editorId,{videoUrl:event.target.value})} placeholder="https://…"/></label>
        <label className="wide">Thumbnail URL<input type="url" value={episode.thumbnailUrl} onChange={event=>update(episode.editorId,{thumbnailUrl:event.target.value})} placeholder="https://…"/>{!!assets.length&&<select aria-label={`Choose thumbnail for episode ${episode.episodeNumber}`} value={assets.some(asset=>asset.url===episode.thumbnailUrl)?episode.thumbnailUrl:""} onChange={event=>update(episode.editorId,{thumbnailUrl:event.target.value})}><option value="">Choose from media library…</option>{assets.map(asset=><option key={asset.id} value={asset.url}>{asset.filename} · {asset.role}</option>)}</select>}<small>Upload an image in Media Library with the Episode thumbnail role, then select it here.</small></label>
        <label className="wide">Episode description<textarea maxLength={1000} value={episode.synopsis} onChange={event=>update(episode.editorId,{synopsis:event.target.value})}/></label>
      </div>
      <div className="admin-subtitle-editor"><div className="admin-section-title"><div><strong>Subtitles</strong><small>Tracks are stored with this episode.</small></div><button type="button" disabled={episode.subtitles.length>=20} onClick={()=>update(episode.editorId,{subtitles:[...episode.subtitles,{language:"",label:"",fileUrl:"",kind:"subtitles"}]})}>＋ Add track</button></div>
        {episode.subtitles.map((track,trackIndex)=><div className="admin-subtitle-row" key={trackIndex}><label>Language<input required maxLength={30} value={track.language} onChange={event=>update(episode.editorId,{subtitles:episode.subtitles.map((item,i)=>i===trackIndex?{...item,language:event.target.value}:item)})}/></label><label>Label<input required maxLength={80} value={track.label} onChange={event=>update(episode.editorId,{subtitles:episode.subtitles.map((item,i)=>i===trackIndex?{...item,label:event.target.value}:item)})}/></label><label>Track URL<input required type="url" value={track.fileUrl} onChange={event=>update(episode.editorId,{subtitles:episode.subtitles.map((item,i)=>i===trackIndex?{...item,fileUrl:event.target.value}:item)})}/></label><label>Type<select value={track.kind} onChange={event=>update(episode.editorId,{subtitles:episode.subtitles.map((item,i)=>i===trackIndex?{...item,kind:event.target.value as SubtitleInput["kind"]}:item)})}><option value="subtitles">Subtitles</option><option value="captions">Captions</option></select></label><button type="button" className="row-remove" aria-label={`Remove subtitle track ${trackIndex+1}`} onClick={()=>update(episode.editorId,{subtitles:episode.subtitles.filter((_,i)=>i!==trackIndex)})}>×</button></div>)}
        {!episode.subtitles.length&&<p className="admin-muted">No subtitle tracks added.</p>}
      </div>
    </article>)}
    {!episodes.length&&<p className="admin-muted">No episodes yet. Add the first episode or a new season.</p>}
  </section>;
}

function AdminTitleTable({items,onEdit,onDelete}:{items:any[];onEdit:(item:any)=>void;onDelete:(item:any)=>void}) {
  return <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Title</th><th>Type</th><th>Updated</th><th>Visibility</th><th>Actions</th></tr></thead><tbody>{items.map(item=><tr key={item.id}><td>{item.title}<div className="admin-mobile-title">{item.slug}</div></td><td>{item.type}</td><td>{item.updated_at}</td><td><span className={"status-pill "+(item.published?"live":"draft")}>{item.published?"Published":"Draft"}</span></td><td><div className="admin-user-actions"><button type="button" onClick={()=>onEdit(item)}>Edit</button><button type="button" onClick={()=>onDelete(item)}>Delete</button></div></td></tr>)}{!items.length&&<tr><td colSpan={5}>No titles yet.</td></tr>}</tbody></table></div>;
}
