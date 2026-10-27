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
 const wrongPublic=await request("/api/auth/login",{method:"POST",body:{email:adminEmail,password:adminPassword}});
 assert.equal(wrongPublic.response.status,401,"admin credentials do not use the public user login");
});

test("admin creates and edits content; title and genre filters use saved data",async()=>{
 slug="test-title-"+randomUUID().slice(0,8);
 const body={title:"Test Spring Letters",type:"series",slug,synopsis:"A test record for CRUD verification.",releaseYear:2026,country:"South Korea",status:"ongoing",genres:["Romance","Test Genre"],published:true,featured:false,videoUrl:"https://ia800.us.archive.org/download/test/video.mp4",gallery:[{url:"https://ia800.us.archive.org/download/test/still.jpg",caption:"Test still",attribution:"Test collection"}],episodes:[{title:"Pilot",synopsis:"Test episode.",durationMinutes:28,videoUrl:"https://ia800.us.archive.org/download/test/episode.mp4"}]};
 const created=await request("/api/admin/titles",{method:"POST",cookie:adminCookie,body});assert.equal(created.response.status,201,JSON.stringify(created.data));titleId=created.data.id;
 const lookup=await request("/api/titles?q="+encodeURIComponent("Test Spring"));assert.equal(lookup.data.items[0].id,titleId);
 const genre=await request("/api/titles?genre="+encodeURIComponent("Test Genre"));assert.ok(genre.data.items.some(item=>item.id===titleId));
 const adminTitles=await request("/api/admin/titles",{cookie:adminCookie});const saved=adminTitles.data.items.find(x=>x.id===titleId);assert.ok(saved);assert.equal(saved.video_url,body.videoUrl);assert.equal(saved.episodes[0].video_url,body.episodes[0].videoUrl);episodeId=saved.episodes[0].id;
 const edited=await request("/api/admin/titles",{method:"PUT",cookie:adminCookie,body:{...body,id:titleId,title:"Test Spring Letters — edited",status:"completed",episodes:body.episodes}});
 assert.equal(edited.response.status,200,JSON.stringify(edited.data));
 const refreshed=await request("/api/admin/titles",{cookie:adminCookie});episodeId=refreshed.data.items.find(x=>x.id===titleId).episodes[0].id;
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
