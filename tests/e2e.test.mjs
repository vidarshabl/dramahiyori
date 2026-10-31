import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const base=(process.env.TEST_BASE_URL||"").replace(/\/$/,"");
const adminEmail=(process.env.TEST_ADMIN_EMAIL||"").toLowerCase();
const adminPassword=process.env.TEST_ADMIN_PASSWORD||"";
const origin=base;
let userCookie="",adminCookie="",userEmail="",userPassword="",titleId="",episodeId="",slug="",castSlug="";

async function request(path,{method="GET",body,cookie=""}={}) {
 const headers={Origin:origin}; if(body!==undefined)headers["Content-Type"]="application/json"; if(cookie)headers.Cookie=cookie;
 const response=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
 let data={};try{data=await response.json()}catch{}
 return {response,data};
}
function cookieFrom(response){const all=response.headers.getSetCookie?.()||[];return (all.find(x=>x.startsWith("deardrama_session="))||"").split(";")[0];}

before(async()=>{
 assert.ok(base,"Set TEST_BASE_URL, for example http://127.0.0.1:3000");
 assert.ok(adminEmail&&adminPassword,"Set TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD for admin integration tests.");
 const bad=await request("/api/auth/register",{method:"POST",body:{email:"bad@example.test",password:"short",role:"admin"}});
 assert.equal(bad.response.status,400,"registration rejects invalid data and never trusts a submitted role");
 userEmail="viewer-"+randomUUID()+"@example.test";userPassword="test-password-Long-2026!";
 const registered=await request("/api/auth/register",{method:"POST",body:{displayName:"Test Viewer",email:userEmail,password:userPassword,confirmPassword:userPassword,terms:"on",role:"admin"}});
 assert.equal(registered.response.status,201,JSON.stringify(registered.data));
 userCookie=cookieFrom(registered.response);assert.match(userCookie,/^deardrama_session=/);
 const me=await request("/api/auth/me",{cookie:userCookie});assert.equal(me.data.user.role,"user");
 const adminLogin=await request("/api/auth/admin-login",{method:"POST",body:{email:adminEmail,password:adminPassword}});
 assert.equal(adminLogin.response.status,200,JSON.stringify(adminLogin.data));
 adminCookie=cookieFrom(adminLogin.response);assert.match(adminCookie,/^deardrama_session=/);
});

test("public and admin authentication remain separate",async()=>{
 const userOnAdmin=await request("/api/admin/overview",{cookie:userCookie});assert.equal(userOnAdmin.response.status,403);
 const userOnCast=await request("/api/admin/cast",{cookie:userCookie});assert.equal(userOnCast.response.status,403);
 const userOnMedia=await request("/api/admin/media",{cookie:userCookie});assert.equal(userOnMedia.response.status,403);
 const noSession=await request("/api/admin/titles");assert.equal(noSession.response.status,403);
 const noSessionOnImport=await request("/api/admin/catalog-import",{method:"POST"});assert.equal(noSessionOnImport.response.status,403);
 const noSessionOnSubtitles=await fetch(base+"/api/admin/subtitles",{method:"POST",headers:{Origin:origin}});assert.equal(noSessionOnSubtitles.status,403);
 const viewerOnImport=await request("/api/admin/catalog-import",{method:"POST",cookie:userCookie});assert.equal(viewerOnImport.response.status,403);
 const wrongPublic=await request("/api/auth/login",{method:"POST",body:{email:adminEmail,password:adminPassword}});
 assert.equal(wrongPublic.response.status,401,"admin credentials do not use the public user login");
});

test("subtitle uploads enforce admin access, file validation, and storage readiness",async()=>{
 const upload=async(fileName,content,cookie=adminCookie)=>{
  const form=new FormData();form.set("file",new Blob([content]),fileName);
  const headers={Origin:origin};if(cookie)headers.Cookie=cookie;
  return fetch(base+"/api/admin/subtitles",{method:"POST",headers,body:form});
 };
 const unauthorized=await upload("captions.srt","1\n00:00:01,000 --> 00:00:02,000\nසිංහල\n","");
 assert.equal(unauthorized.status,403,"public users cannot upload subtitles");
 assert.equal((await upload("captions.txt","subtitle text")).status,400,"unsupported file extensions are rejected");
 assert.equal((await upload("captions.vtt","not a WebVTT file")).status,400,"malformed WebVTT is rejected");
 assert.equal((await upload("captions.srt",new Uint8Array(1024*1024+1))).status,413,"oversized subtitle files are rejected");
 const validWithoutStorage=await upload("captions.srt","1\n00:00:01,000 --> 00:00:02,000\nසිංහල\n");
 assert.equal(validWithoutStorage.status,503,"a valid upload clearly reports when persistent Blob storage is not configured");
});

test("administrator imports the supplied drama catalog idempotently with static artwork and metadata",async()=>{
 const imported=await request("/api/admin/catalog-import",{method:"POST",cookie:adminCookie});
 assert.equal(imported.response.status,200,JSON.stringify(imported.data));
  assert.equal(imported.data.created,11);assert.equal(imported.data.updated,0);assert.equal(imported.data.total,11);
 const saved=await request("/api/admin/titles",{cookie:adminCookie});
 const queen=saved.data.items.find(item=>item.slug==="queen-of-tears");assert.ok(queen);
 assert.equal(queen.imdb_rating,8.2);assert.equal(queen.total_episodes,16);assert.equal(queen.total_runtime_minutes,1120);
 assert.equal(queen.runtime_minutes,70);assert.equal(queen.poster_url,"/drama-media/queen-of-tears-poster.jpg");
 assert.ok(queen.genres.includes("Romance"));assert.deepEqual(queen.episodes,[]);
 const titlePage=await fetch(base+"/title/queen-of-tears");assert.equal(titlePage.status,200);
 const titleHtml=await titlePage.text();assert.match(titleHtml,/8\.2\/10/);assert.match(titleHtml,/1,120 min total/);assert.match(titleHtml,/16 episodes/);assert.match(titleHtml,/Kim Soo-hyun/);assert.doesNotMatch(titleHtml,/"ratingCount":1/,"structured data must not invent an IMDb review count");
 const artwork=await fetch(base+"/drama-media/queen-of-tears-poster.jpg");assert.equal(artwork.status,200);assert.match(artwork.headers.get("content-type")||"",/image\/jpeg/);
  const doctor=saved.data.items.find(item=>item.slug==="doctor-stranger");assert.ok(doctor);
  assert.equal(doctor.alternative_title,"닥터 이방인");assert.equal(doctor.imdb_rating,7.5);assert.equal(doctor.total_episodes,20);assert.equal(doctor.total_runtime_minutes,1400);
  assert.equal(doctor.poster_url,"/drama-media/doctor-stranger-poster.jpg");assert.equal(doctor.backdrop_url,"/drama-media/doctor-stranger-backdrop.jpg");
  const people=await request("/api/admin/cast",{cookie:adminCookie});
  const doctorCast=people.data.items.filter(person=>["Lee Jong-suk","Jin Se-yeon","Park Hae-jin","Kang So-ra"].includes(person.name)&&person.credits.some(credit=>credit.title_slug==="doctor-stranger"));
  assert.deepEqual(doctorCast.map(person=>person.name).sort(),["Jin Se-yeon","Kang So-ra","Lee Jong-suk","Park Hae-jin"]);
  for(const imagePath of [doctor.poster_url,doctor.backdrop_url]){const response=await fetch(base+imagePath);assert.equal(response.status,200);assert.match(response.headers.get("content-type")||"",/image\/jpeg/);}
  const doctorOnly=await request("/api/admin/catalog-import?slug=doctor-stranger",{method:"POST",cookie:adminCookie});
  assert.equal(doctorOnly.response.status,200);assert.equal(doctorOnly.data.created,0);assert.equal(doctorOnly.data.updated,0);assert.equal(doctorOnly.data.skipped,1,"targeted add leaves an existing title untouched");
 const rerun=await request("/api/admin/catalog-import",{method:"POST",cookie:adminCookie});assert.equal(rerun.response.status,200);
  assert.equal(rerun.data.created,0);assert.equal(rerun.data.updated,11);assert.equal(rerun.data.castLinked,0);
 const once=await request("/api/admin/titles",{cookie:adminCookie});assert.equal(once.data.items.filter(item=>item.slug==="queen-of-tears").length,1);
});

test("homepage uses the KVERSE navbar wordmark and renders its bundled hero backdrop",async()=>{
 const response=await fetch(base+"/");assert.equal(response.status,200);
 const html=await response.text(),header=html.match(/<header\b[\s\S]*?<\/header>/)?.[0]||"";
 assert.match(header,/KVERSE/);assert.doesNotMatch(header,/deardrama|stories that stay/i);
 assert.match(html,/<title>DearDrama · Stories that stay<\/title>/);
 assert.match(html,/property="og:site_name" content="DearDrama"/);
 assert.match(html,/rel="icon"/);
 assert.match(html,/class="route-transition"/);assert.match(html,/class="route-progress"/);
 assert.match(html,/business-proposal-backdrop\.jpg/);
});

test("SEO, reporting, offline, and PWA routes are reachable",async()=>{
 const [robots,sitemap,manifest,offline,serviceWorker,policy]=await Promise.all([
  fetch(base+"/robots.txt"),fetch(base+"/sitemap.xml"),fetch(base+"/manifest.webmanifest"),
  fetch(base+"/offline"),fetch(base+"/sw.js"),fetch(base+"/content-policy"),
 ]);
 const robotsText=await robots.text();
 assert.equal(robots.status,200);assert.match(robotsText,/Disallow: \/admin/);assert.match(robotsText,/sitemap\.xml/i);
 assert.equal(sitemap.status,200);assert.match(await sitemap.text(),/<loc>[^<]+<\/loc>/);
 assert.equal(manifest.status,200);const manifestData=await manifest.json();assert.equal(manifestData.short_name,"KVERSE");assert.equal(manifestData.display,"standalone");
 assert.equal(offline.status,200);assert.match(await offline.text(),/You’re offline right now/);
 assert.equal(serviceWorker.status,200);assert.match(await serviceWorker.text(),/kverse-offline-v1/);
 assert.equal(policy.status,200);assert.match(await policy.text(),/href="\/report"[^>]*>Submit a report/);
});

test("existing public discovery, information, auth, report, and watch routes remain reachable",async()=>{
 const paths=["/browse","/genres","/people","/new","/watchlist","/login","/register","/about","/contact","/help","/privacy","/terms","/content-policy","/report","/admin/login","/watch?slug=queen-of-tears"];
 const responses=await Promise.all(paths.map(async path=>({path,status:(await fetch(base+path)).status})));
 for(const result of responses)assert.equal(result.status,200,`${result.path} remains reachable`);
});

test("administrator can save several bundled drama backdrops for the rotating homepage hero",async()=>{
 const catalog=await request("/api/admin/titles",{cookie:adminCookie});
 const titles=catalog.data.items.filter(item=>Number(item.published)===1&&item.backdrop_url).slice(0,5);
 assert.equal(titles.length,5,"the supplied catalog contains five or more bundled backdrops");
 const slides=titles.map(item=>({id:"slide-"+randomUUID(),titleId:item.id,backdropUrl:item.backdrop_url}));
 const saved=await request("/api/admin/home-slides",{method:"PATCH",cookie:adminCookie,body:{slides}});
 assert.equal(saved.response.status,200,JSON.stringify(saved.data));assert.equal(saved.data.count,5);
 const homepage=await fetch(base+"/");assert.equal(homepage.status,200);const html=await homepage.text();
 assert.equal((html.match(/aria-label="Show featured story [0-9]+"/g)||[]).length,5);
 for(const item of titles)assert.ok(html.includes(item.backdrop_url.split("/").pop()),"homepage includes "+item.title+" backdrop");
});

test("admin creates and edits content; title, genre, and weekly schedule use saved data",async()=>{
 slug="test-title-"+randomUUID().slice(0,8);
 const body={title:"Test Spring Letters",type:"series",slug,synopsis:"A test record for CRUD verification.",releaseYear:2026,country:"South Korea",status:"ongoing",airDay:"Tuesday",sinhalaTitle:"වසන්ත ලිපි",hasSinhalaSubtitles:true,genres:["Romance","Test Genre"],published:true,featured:false,posterUrl:"/drama-media/queen-of-tears-poster.jpg",backdropUrl:"/drama-media/queen-of-tears-backdrop.jpg",videoUrl:"https://ia800.us.archive.org/download/test/episode.mp4",gallery:[{url:"https://ia800.us.archive.org/download/test/still.jpg",caption:"Test still",attribution:"Test collection"}],episodes:[{title:"Pilot",synopsis:"Test episode.",durationMinutes:28,videoUrl:"https://ia800.us.archive.org/download/test/episode.mp4"}]};
 const created=await request("/api/admin/titles",{method:"POST",cookie:adminCookie,body});assert.equal(created.response.status,201,JSON.stringify(created.data));titleId=created.data.id;
 const lookup=await request("/api/titles?q="+encodeURIComponent("Test Spring"));assert.equal(lookup.data.items[0].id,titleId);
 const sinhalaSearch=await request("/api/titles?q="+encodeURIComponent("වසන්ත ලිපි"));assert.ok(sinhalaSearch.data.items.some(item=>item.id===titleId),"Sinhala title search returns the matching drama");
 const sinhalaFilter=await request("/api/titles?hasSinhalaSubtitles=true");assert.ok(sinhalaFilter.data.items.some(item=>item.id===titleId),"Sinhala-subtitle filter includes tagged content");
 const genre=await request("/api/titles?genre="+encodeURIComponent("Test Genre"));assert.ok(genre.data.items.some(item=>item.id===titleId));
 const adminTitles=await request("/api/admin/titles",{cookie:adminCookie});const saved=adminTitles.data.items.find(x=>x.id===titleId);assert.ok(saved);assert.equal(saved.video_url,body.videoUrl);assert.equal(saved.episodes[0].video_url,body.episodes[0].videoUrl);episodeId=saved.episodes[0].id;
 assert.equal(saved.air_day,"Tuesday");assert.equal(Number(saved.has_sinhala_subtitles),1);
 const schedule=await fetch(base+"/schedule");assert.equal(schedule.status,200);const scheduleHtml=await schedule.text();assert.match(scheduleHtml,new RegExp(`/title/${slug}`));assert.match(scheduleHtml,/Tuesday/);assert.match(scheduleHtml,/සිංහල උපසිරැසි/);
 const episodeWatch=await fetch(`${base}/watch/${slug}/1-1`);assert.equal(episodeWatch.status,200);assert.match(await episodeWatch.text(),/"@type":"TVEpisode"/);
 const episodeSitemap=await fetch(base+"/sitemap.xml");assert.match(await episodeSitemap.text(),new RegExp(`/watch/${slug}/1-1`),"published episodes are listed in the dynamic sitemap");
 const edited=await request("/api/admin/titles",{method:"PUT",cookie:adminCookie,body:{...body,id:titleId,title:"Test Spring Letters — edited",status:"completed",episodes:body.episodes}});
 assert.equal(edited.response.status,200,JSON.stringify(edited.data));
 const refreshed=await request("/api/admin/titles",{cookie:adminCookie});episodeId=refreshed.data.items.find(x=>x.id===titleId).episodes[0].id;assert.equal(episodeId,saved.episodes[0].id,"editing a title preserves episode identity and playback progress links");
 const filtered=await request("/api/titles?status=completed&q=Test+Spring");assert.equal(filtered.data.items[0].title,"Test Spring Letters — edited");
 const savedTitle=refreshed.data.items.find(x=>x.id===titleId);assert.equal(savedTitle.gallery[0].image_url,body.gallery[0].url);
 castSlug="test-cast-"+randomUUID().slice(0,8);
 const cast=await request("/api/admin/cast",{method:"POST",cookie:adminCookie,body:{name:"Test Actor Profile",slug:castSlug,biography:"A temporary profile created by the integration test.",nationality:"South Korea",profession:"Actor",portraitUrl:"https://ia800.us.archive.org/download/test/portrait.jpg",gallery:[{url:"https://ia800.us.archive.org/download/test/portrait-still.jpg",caption:"Profile photo",attribution:"Test collection"}],credits:[{titleId,characterName:"Spring",roleType:"cast",sortOrder:0}]}});
 assert.equal(cast.response.status,201,JSON.stringify(cast.data));
 const profile=await fetch(base+"/people/"+castSlug);assert.equal(profile.status,200);const profileHtml=await profile.text();assert.match(profileHtml,/Test Actor Profile/);assert.match(profileHtml,/Test Spring Letters — edited/);assert.match(profileHtml,/Spring/);
 const castSearch=await request("/api/titles?q="+encodeURIComponent("Test Actor Profile"));assert.ok(castSearch.data.items.some(item=>item.id===titleId),"cast name search returns its credited drama");
 const detail=await fetch(base+"/title/"+slug);assert.equal(detail.status,200);const detailHtml=await detail.text();assert.match(detailHtml,/Cast &amp; crew/);assert.match(detailHtml,/Test Actor Profile/);assert.match(detailHtml,/Test still/);
});

test("watchlist and playback progress persist and reject invalid references",async()=>{
 const saved=await request("/api/watchlist",{method:"POST",cookie:userCookie,body:{titleId}});assert.equal(saved.response.status,200);
 const list=await request("/api/watchlist",{cookie:userCookie});assert.ok(list.data.items.some(x=>x.id===titleId));
 const watchlistPage=await fetch(base+"/watchlist",{headers:{Cookie:userCookie}});assert.equal(watchlistPage.status,200);assert.match(await watchlistPage.text(),/Remove from watchlist: Test Spring Letters/);
 const bad=await request("/api/progress",{method:"POST",cookie:userCookie,body:{titleId,episodeId:"missing-episode",positionSeconds:12,durationSeconds:400}});assert.equal(bad.response.status,400);
 const good=await request("/api/progress",{method:"POST",cookie:userCookie,body:{titleId,episodeId,positionSeconds:12,durationSeconds:400}});assert.equal(good.response.status,200,JSON.stringify(good.data));
 const progress=await request("/api/progress",{cookie:userCookie});assert.equal(progress.data.items[0].title_id,titleId);
 const account=await fetch(base+"/account",{headers:{Cookie:userCookie}});assert.equal(account.status,200);const accountHtml=await account.text();assert.match(accountHtml,/Recent viewing history/);assert.match(accountHtml,/Test Spring Letters/);assert.match(accountHtml,/Season 1 · Episode 1 · Pilot/);
 const remove=await request("/api/watchlist?titleId="+encodeURIComponent(titleId),{method:"DELETE",cookie:userCookie});assert.equal(remove.response.status,200);
});

test("movies retain title-level Sinhala subtitles through admin edits and expose them on the watch page",async()=>{
 const movieSlug="subtitle-feature-"+randomUUID().slice(0,8),subtitleUrl="https://ia800.us.archive.org/download/test/movie-si.vtt";
 const body={title:"Subtitle Feature Film",type:"movie",slug:movieSlug,synopsis:"A disposable movie subtitle integration fixture.",releaseYear:2026,country:"South Korea",status:"completed",runtimeMinutes:108,posterUrl:"/drama-media/queen-of-tears-poster.jpg",backdropUrl:"/drama-media/queen-of-tears-backdrop.jpg",videoUrl:"https://ia800.us.archive.org/download/test/movie.mp4",published:true,titleSubtitles:[{language:"si",label:"සිංහල",fileUrl:subtitleUrl,kind:"subtitles",isDefault:true,timingOffset:0.5}]};
 const created=await request("/api/admin/titles",{method:"POST",cookie:adminCookie,body});assert.equal(created.response.status,201,JSON.stringify(created.data));
 const editData=await request("/api/admin/titles?id="+encodeURIComponent(created.data.id),{cookie:adminCookie});assert.equal(editData.data.items[0].titleSubtitles[0].fileUrl,subtitleUrl,"movie subtitle data is returned when reopening the editor");
 const edited=await request("/api/admin/titles",{method:"PUT",cookie:adminCookie,body:{...body,id:created.data.id,title:"Subtitle Feature Film — edited"}});assert.equal(edited.response.status,200,JSON.stringify(edited.data));
 const watch=await fetch(`${base}/watch/${movieSlug}`);assert.equal(watch.status,200);const html=await watch.text();assert.ok(html.includes(subtitleUrl),"the movie player receives and renders its saved subtitle track");
 const removed=await request("/api/admin/titles?id="+encodeURIComponent(created.data.id),{method:"DELETE",cookie:adminCookie});assert.equal(removed.response.status,200);
});

test("streaming sources, downloads, reports, preferences, watched markers, and popularity use saved data",async()=>{
 const denied=await request("/api/admin/streaming");assert.equal(denied.response.status,403);
 const source=await request("/api/admin/streaming",{method:"POST",cookie:adminCookie,body:{action:"source",titleId,episodeId,kind:"mp4",quality:"720p",url:"https://ia800.us.archive.org/download/test/episode.mp4",priority:10}});
 assert.equal(source.response.status,201,JSON.stringify(source.data));
 const sourceForStatus=await request("/api/admin/streaming",{method:"POST",cookie:adminCookie,body:{action:"source",titleId,episodeId,kind:"mp4",quality:"720p",url:"https://ia800.us.archive.org/download/test/episode.mp4",priority:9}});
 assert.equal(sourceForStatus.response.status,201,JSON.stringify(sourceForStatus.data));
 const download=await request("/api/admin/streaming",{method:"POST",cookie:adminCookie,body:{action:"download",titleId,episodeId,quality:"720p",url:"https://ia800.us.archive.org/download/test/pilot-720p.mp4",hostLabel:"Archive",sizeMb:"125.5"}});
 assert.equal(download.response.status,201,JSON.stringify(download.data));
 const prepared=await fetch(`${base}/api/download/${download.data.id}`,{method:"HEAD",headers:{Origin:origin}});assert.equal(prepared.status,200,"a valid episode download passes the preflight check");
 const redirected=await fetch(`${base}/api/download/${download.data.id}`,{headers:{Origin:origin},redirect:"manual"});
 assert.equal(redirected.status,302);assert.equal(redirected.headers.get("location"),"https://ia800.us.archive.org/download/test/pilot-720p.mp4");
 const subtitleDownload=await request("/api/admin/streaming",{method:"POST",cookie:adminCookie,body:{action:"download",titleId,episodeId,quality:"subtitle",url:"https://ia800.us.archive.org/download/test/pilot-si.vtt",hostLabel:"Archive subtitles"}});
 assert.equal(subtitleDownload.response.status,201,JSON.stringify(subtitleDownload.data));
 const subtitleWatch=await fetch(`${base}/watch/${slug}/1-1`);assert.equal(subtitleWatch.status,200);assert.match(await subtitleWatch.text(),/Subtitle file/,"the episode page offers an admin-configured subtitle-only download");
 const subtitleRedirect=await fetch(`${base}/api/download/${subtitleDownload.data.id}`,{headers:{Origin:origin},redirect:"manual"});assert.equal(subtitleRedirect.status,302);assert.equal(subtitleRedirect.headers.get("location"),"https://ia800.us.archive.org/download/test/pilot-si.vtt");
 const watchableTitle=await request("/api/admin/titles?id="+encodeURIComponent(titleId),{cookie:adminCookie});
 const watchEpisode=watchableTitle.data.items[0]?.episodes.find(item=>item.id===episodeId);assert.ok(watchEpisode,"the edited title retains its playable episode");
 assert.equal(Number(watchEpisode.published),1);assert.equal(Number(watchEpisode.season_number),1);assert.equal(Number(watchEpisode.episode_number),1);
 const publicLookup=await request("/api/titles?q="+encodeURIComponent("Test Spring"));assert.equal(publicLookup.data.items[0]?.episode_count,1);assert.equal(publicLookup.data.items[0]?.first_playable_episode_id,episodeId);
 const watchPosition=`${watchEpisode.season_number}-${watchEpisode.episode_number}`;
 const legacyWatch=await fetch(`${base}/watch?slug=${encodeURIComponent(slug)}&episode=${encodeURIComponent(episodeId)}`);assert.equal(legacyWatch.status,200,"legacy episode watch URL remains available");
 const watchPage=await fetch(`${base}/watch/${slug}/${watchPosition}`);assert.equal(watchPage.status,200,`watch route resolves saved episode ${watchPosition}`);const watchHtml=await watchPage.text();assert.match(watchHtml,/720p download/);assert.match(watchHtml,/download-action is-idle/,"download control renders in its initial state before a user activates it");
 const titleDownload=await request("/api/admin/streaming",{method:"POST",cookie:adminCookie,body:{action:"download",titleId,quality:"480p",url:"https://ia800.us.archive.org/download/test/title-480p.mp4",hostLabel:"Archive"}});
 assert.equal(titleDownload.response.status,201,JSON.stringify(titleDownload.data));
 const preparedTitleDownload=await fetch(`${base}/api/download/${titleDownload.data.id}`,{method:"HEAD",headers:{Origin:origin}});assert.equal(preparedTitleDownload.status,200,"title-level downloads pass relationship validation");
 const titleRedirect=await fetch(`${base}/api/download/${titleDownload.data.id}`,{headers:{Origin:origin},redirect:"manual"});assert.equal(titleRedirect.status,302);assert.equal(titleRedirect.headers.get("location"),"https://ia800.us.archive.org/download/test/title-480p.mp4");
 const requireLogin=await request("/api/admin/streaming",{method:"POST",cookie:adminCookie,body:{action:"setting",login1080:true}});assert.equal(requireLogin.response.status,200);
 const highQuality=await request("/api/admin/streaming",{method:"POST",cookie:adminCookie,body:{action:"download",titleId,quality:"1080p",url:"https://ia800.us.archive.org/download/test/title-1080p.mp4",hostLabel:"Archive"}});assert.equal(highQuality.response.status,201);
 const deniedPrepare=await fetch(`${base}/api/download/${highQuality.data.id}`,{method:"HEAD",headers:{Origin:origin}});assert.equal(deniedPrepare.status,401,"preflight enforces the 1080p account setting");
 const allowedPrepare=await fetch(`${base}/api/download/${highQuality.data.id}`,{method:"HEAD",headers:{Origin:origin,Cookie:userCookie}});assert.equal(allowedPrepare.status,200,"signed-in users can prepare 1080p downloads");
 const deniedHighQuality=await fetch(`${base}/api/download/${highQuality.data.id}`,{headers:{Origin:origin},redirect:"manual"});assert.equal(deniedHighQuality.status,307);
 const disableDownload=await request("/api/admin/streaming",{method:"POST",cookie:adminCookie,body:{action:"status",entity:"download",id:titleDownload.data.id,status:"inactive"}});assert.equal(disableDownload.response.status,200);
 const inactivePrepare=await fetch(`${base}/api/download/${titleDownload.data.id}`,{method:"HEAD",headers:{Origin:origin}});assert.equal(inactivePrepare.status,404,"inactive download links are rejected during preflight");
 const restoreSetting=await request("/api/admin/streaming",{method:"POST",cookie:adminCookie,body:{action:"setting",login1080:false}});assert.equal(restoreSetting.response.status,200);
 const deniedPublish=await request("/api/admin/titles",{method:"POST",body:{title:"Publicly injected",type:"series"}});assert.equal(deniedPublish.response.status,403);
 const play=await request("/api/view-events",{method:"POST",cookie:userCookie,body:{titleId,episodeId}});assert.equal(play.response.status,200);
 const popular=await request("/api/titles?q=Test+Spring&sort=popular");assert.equal(popular.data.items[0].id,titleId);
 const report=await request("/api/report",{method:"POST",cookie:userCookie,body:{targetType:"video_source",targetId:source.data.id,reason:"broken_link",details:"Test report"}});assert.equal(report.response.status,200);
 const reports=await request("/api/admin/streaming",{cookie:adminCookie});assert.ok(reports.data.reports.some((item)=>item.target_id===source.data.id));
 const disableByStatus=await request("/api/admin/streaming",{method:"POST",cookie:adminCookie,body:{action:"status",entity:"source",id:sourceForStatus.data.id,status:"inactive"}});assert.equal(disableByStatus.response.status,200);
 const afterStatusDisable=await request("/api/admin/titles?id="+encodeURIComponent(titleId),{cookie:adminCookie});
 assert.equal(afterStatusDisable.data.items[0].video_url,"");assert.equal(afterStatusDisable.data.items[0].episodes[0].video_url,"","disabling a source clears matching legacy playback URLs");
 const sourceReport=reports.data.reports.find((item)=>item.target_id===source.data.id);assert.ok(sourceReport);
 const disableReportedSource=await request("/api/admin/streaming",{method:"POST",cookie:adminCookie,body:{action:"disable-report-target",id:sourceReport.id}});assert.equal(disableReportedSource.response.status,200);
 const disabledWatch=await fetch(`${base}/watch/${slug}/${watchPosition}`);const disabledWatchHtml=await disabledWatch.text();assert.doesNotMatch(disabledWatchHtml,/episode\.mp4/,"the watch page no longer exposes the disabled stream through a legacy fallback");
 const watched=await request("/api/watched-episodes",{method:"POST",cookie:userCookie,body:{episodeId,watched:true}});assert.equal(watched.response.status,200);
 const watchedList=await request("/api/watched-episodes",{cookie:userCookie});assert.ok(watchedList.data.items.some((item)=>item.episode_id===episodeId));
 const preference=await request("/api/playback-preferences",{method:"POST",cookie:userCookie,body:{volume:0.6,quality:"720p",subtitleLanguage:"si"}});assert.equal(preference.response.status,200);
 const savedPreference=await request("/api/playback-preferences",{cookie:userCookie});assert.equal(savedPreference.data.preferences.quality,"720p");
 const titleRequest=await request("/api/title-requests",{method:"POST",cookie:userCookie,body:{title:"Requested test series",details:"Test tracking"}});assert.equal(titleRequest.response.status,201);
 const requests=await request("/api/title-requests",{cookie:userCookie});assert.ok(requests.data.items.some((item)=>item.requested_title==="Requested test series"));
});

test("admin content changes are audited and removable",async()=>{
 const overview=await request("/api/admin/overview",{cookie:adminCookie});assert.equal(overview.response.status,200);assert.ok(overview.data.audit.some(x=>x.action==="content.update"));
 const deleted=await request("/api/admin/titles?id="+encodeURIComponent(titleId),{method:"DELETE",cookie:adminCookie});assert.equal(deleted.response.status,200);
 const notFound=await request("/api/titles?q="+encodeURIComponent("Test Spring Letters"));assert.equal(notFound.data.items.length,0);
});

after(async()=>{
 if(userCookie)await request("/api/account",{method:"DELETE",cookie:userCookie,body:{password:userPassword}});
});
