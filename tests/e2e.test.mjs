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
 const viewerOnImport=await request("/api/admin/catalog-import",{method:"POST",cookie:userCookie});assert.equal(viewerOnImport.response.status,403);
 const wrongPublic=await request("/api/auth/login",{method:"POST",body:{email:adminEmail,password:adminPassword}});
 assert.equal(wrongPublic.response.status,401,"admin credentials do not use the public user login");
});

test("administrator imports the supplied drama catalog idempotently with static artwork and metadata",async()=>{
 const imported=await request("/api/admin/catalog-import",{method:"POST",cookie:adminCookie});
 assert.equal(imported.response.status,200,JSON.stringify(imported.data));
 assert.equal(imported.data.created,10);assert.equal(imported.data.updated,0);assert.equal(imported.data.total,10);
 const saved=await request("/api/admin/titles",{cookie:adminCookie});
 const queen=saved.data.items.find(item=>item.slug==="queen-of-tears");assert.ok(queen);
 assert.equal(queen.imdb_rating,8.2);assert.equal(queen.total_episodes,16);assert.equal(queen.total_runtime_minutes,1120);
 assert.equal(queen.runtime_minutes,70);assert.equal(queen.poster_url,"/drama-media/queen-of-tears-poster.jpg");
 assert.ok(queen.genres.includes("Romance"));assert.deepEqual(queen.episodes,[]);
 const titlePage=await fetch(base+"/title/queen-of-tears");assert.equal(titlePage.status,200);
 const titleHtml=await titlePage.text();assert.match(titleHtml,/8\.2\/10/);assert.match(titleHtml,/1,120 min total/);assert.match(titleHtml,/16 episodes/);assert.match(titleHtml,/Kim Soo-hyun/);
 const artwork=await fetch(base+"/drama-media/queen-of-tears-poster.jpg");assert.equal(artwork.status,200);assert.match(artwork.headers.get("content-type")||"",/image\/jpeg/);
 const rerun=await request("/api/admin/catalog-import",{method:"POST",cookie:adminCookie});assert.equal(rerun.response.status,200);
 assert.equal(rerun.data.created,0);assert.equal(rerun.data.updated,10);assert.equal(rerun.data.castLinked,0);
 const once=await request("/api/admin/titles",{cookie:adminCookie});assert.equal(once.data.items.filter(item=>item.slug==="queen-of-tears").length,1);
});

test("homepage uses the KVERSE navbar wordmark and renders its bundled hero backdrop",async()=>{
 const response=await fetch(base+"/");assert.equal(response.status,200);
 const html=await response.text(),header=html.match(/<header\b[\s\S]*?<\/header>/)?.[0]||"";
 assert.match(header,/KVERSE/);assert.doesNotMatch(header,/deardrama|stories that stay/i);
 assert.match(html,/business-proposal-backdrop\.jpg/);
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

test("admin creates and edits content; title and genre filters use saved data",async()=>{
 slug="test-title-"+randomUUID().slice(0,8);
 const body={title:"Test Spring Letters",type:"series",slug,synopsis:"A test record for CRUD verification.",releaseYear:2026,country:"South Korea",status:"ongoing",genres:["Romance","Test Genre"],published:true,featured:false,posterUrl:"/drama-media/queen-of-tears-poster.jpg",backdropUrl:"/drama-media/queen-of-tears-backdrop.jpg",videoUrl:"https://ia800.us.archive.org/download/test/video.mp4",gallery:[{url:"https://ia800.us.archive.org/download/test/still.jpg",caption:"Test still",attribution:"Test collection"}],episodes:[{title:"Pilot",synopsis:"Test episode.",durationMinutes:28,videoUrl:"https://ia800.us.archive.org/download/test/episode.mp4"}]};
 const created=await request("/api/admin/titles",{method:"POST",cookie:adminCookie,body});assert.equal(created.response.status,201,JSON.stringify(created.data));titleId=created.data.id;
 const lookup=await request("/api/titles?q="+encodeURIComponent("Test Spring"));assert.equal(lookup.data.items[0].id,titleId);
 const genre=await request("/api/titles?genre="+encodeURIComponent("Test Genre"));assert.ok(genre.data.items.some(item=>item.id===titleId));
 const adminTitles=await request("/api/admin/titles",{cookie:adminCookie});const saved=adminTitles.data.items.find(x=>x.id===titleId);assert.ok(saved);assert.equal(saved.video_url,body.videoUrl);assert.equal(saved.episodes[0].video_url,body.episodes[0].videoUrl);episodeId=saved.episodes[0].id;
 const edited=await request("/api/admin/titles",{method:"PUT",cookie:adminCookie,body:{...body,id:titleId,title:"Test Spring Letters — edited",status:"completed",episodes:body.episodes}});
 assert.equal(edited.response.status,200,JSON.stringify(edited.data));
 const refreshed=await request("/api/admin/titles",{cookie:adminCookie});episodeId=refreshed.data.items.find(x=>x.id===titleId).episodes[0].id;assert.equal(episodeId,saved.episodes[0].id,"editing a title preserves episode identity and playback progress links");
 const filtered=await request("/api/titles?status=completed&q=Test+Spring");assert.equal(filtered.data.items[0].title,"Test Spring Letters — edited");
 const savedTitle=refreshed.data.items.find(x=>x.id===titleId);assert.equal(savedTitle.gallery[0].image_url,body.gallery[0].url);
 castSlug="test-cast-"+randomUUID().slice(0,8);
 const cast=await request("/api/admin/cast",{method:"POST",cookie:adminCookie,body:{name:"Test Actor Profile",slug:castSlug,biography:"A temporary profile created by the integration test.",nationality:"South Korea",profession:"Actor",portraitUrl:"https://ia800.us.archive.org/download/test/portrait.jpg",gallery:[{url:"https://ia800.us.archive.org/download/test/portrait-still.jpg",caption:"Profile photo",attribution:"Test collection"}],credits:[{titleId,characterName:"Spring",roleType:"cast",sortOrder:0}]}});
 assert.equal(cast.response.status,201,JSON.stringify(cast.data));
 const profile=await fetch(base+"/people/"+castSlug);assert.equal(profile.status,200);const profileHtml=await profile.text();assert.match(profileHtml,/Test Actor Profile/);assert.match(profileHtml,/Test Spring Letters — edited/);assert.match(profileHtml,/Spring/);
 const detail=await fetch(base+"/title/"+slug);assert.equal(detail.status,200);const detailHtml=await detail.text();assert.match(detailHtml,/Cast &amp; crew/);assert.match(detailHtml,/Test Actor Profile/);assert.match(detailHtml,/Test still/);
});

test("watchlist and playback progress persist and reject invalid references",async()=>{
 const saved=await request("/api/watchlist",{method:"POST",cookie:userCookie,body:{titleId}});assert.equal(saved.response.status,200);
 const list=await request("/api/watchlist",{cookie:userCookie});assert.ok(list.data.items.some(x=>x.id===titleId));
 const watchlistPage=await fetch(base+"/watchlist",{headers:{Cookie:userCookie}});assert.equal(watchlistPage.status,200);assert.match(await watchlistPage.text(),/Remove from watchlist: Test Spring Letters/);
 const bad=await request("/api/progress",{method:"POST",cookie:userCookie,body:{titleId,episodeId:"missing-episode",positionSeconds:12,durationSeconds:400}});assert.equal(bad.response.status,400);
 const good=await request("/api/progress",{method:"POST",cookie:userCookie,body:{titleId,episodeId,positionSeconds:12,durationSeconds:400}});assert.equal(good.response.status,200,JSON.stringify(good.data));
 const progress=await request("/api/progress",{cookie:userCookie});assert.equal(progress.data.items[0].title_id,titleId);
 const remove=await request("/api/watchlist?titleId="+encodeURIComponent(titleId),{method:"DELETE",cookie:userCookie});assert.equal(remove.response.status,200);
});

test("admin content changes are audited and removable",async()=>{
 const overview=await request("/api/admin/overview",{cookie:adminCookie});assert.equal(overview.response.status,200);assert.ok(overview.data.audit.some(x=>x.action==="content.update"));
 const deleted=await request("/api/admin/titles?id="+encodeURIComponent(titleId),{method:"DELETE",cookie:adminCookie});assert.equal(deleted.response.status,200);
 const notFound=await request("/api/titles?q="+encodeURIComponent("Test Spring Letters"));assert.equal(notFound.data.items.length,0);
});

after(async()=>{
 if(userCookie)await request("/api/account",{method:"DELETE",cookie:userCookie,body:{password:userPassword}});
});
