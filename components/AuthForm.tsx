"use client";
import Link from "next/link";
import {FormEvent,useState} from "react";
import {useRouter} from "next/navigation";

export function AuthForm({mode}:{mode:"login"|"register"|"admin"}) {
 const [show,setShow]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[success,setSuccess]=useState("");
 const router=useRouter(), signup=mode==="register", admin=mode==="admin";
 async function submit(e:FormEvent<HTMLFormElement>) {
  e.preventDefault();setError("");setSuccess("");setBusy(true);
  const form=new FormData(e.currentTarget), data=Object.fromEntries(form.entries());
  if(signup&&data.password!==data.confirmPassword){setError("Those passwords don’t match.");setBusy(false);return;}
  if(signup&&data.terms!=="on"){setError("Please agree to the Terms and Privacy Policy.");setBusy(false);return;}
  try {
   const response=await fetch(admin?"/api/auth/admin-login":signup?"/api/auth/register":"/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});
   const result=await response.json();if(!response.ok)throw new Error(result.error||"Please try again.");
   setSuccess(signup?"Your account is ready. Welcome in.":"You’re signed in.");
   const next=new URLSearchParams(location.search).get("next");
   setTimeout(()=>{router.push(next&&next.startsWith("/")&&!next.startsWith("//")?next:admin?"/admin/dashboard":"/");router.refresh();},400);
  } catch(err){setError(err instanceof Error?err.message:"We couldn’t reach the server. Please try again.");} finally{setBusy(false);}
 }
 return <form onSubmit={submit} className="auth-form">
  {signup&&<label>Display name<input name="displayName" autoComplete="name" minLength={2} maxLength={50} required placeholder="How should we call you?"/></label>}
  <label>Email address<input name="email" type="email" autoComplete="email" maxLength={254} required placeholder="you@example.com"/></label>
  <label>Password<span className="password-wrap"><input name="password" type={show?"text":"password"} autoComplete={signup?"new-password":admin?"current-password":"current-password"} minLength={signup?12:1} maxLength={128} required placeholder={signup?"At least 12 characters":"Your password"}/><button type="button" onClick={()=>setShow(!show)} aria-label={show?"Hide password":"Show password"}>{show?"Hide":"Show"}</button></span>{signup&&<small>Use at least 12 characters. A longer, unique phrase is even better.</small>}</label>
  {signup&&<label>Confirm password<input name="confirmPassword" type={show?"text":"password"} autoComplete="new-password" minLength={12} maxLength={128} required placeholder="Type it again"/></label>}
  {signup&&<label className="terms-check"><input name="terms" type="checkbox" required/><span>I agree to the <Link href="/terms">Terms</Link> and have read the <Link href="/privacy">Privacy Policy</Link>.</span></label>}
  {!signup&&!admin&&<div className="form-extra"><span className="session-note">Your session lasts 30 days on this device.</span><Link href="/forgot-password">Forgot password?</Link></div>}
  {error&&<p className="form-feedback error-feedback" role="alert">{error}</p>}{success&&<p className="form-feedback success-feedback" role="status">{success}</p>}
  <button className="button button-primary auth-submit" disabled={busy}>{busy?<><span className="spinner"/> Please wait…</>:admin?"Sign in to admin":signup?"Create my account":"Sign in"} <span>↗</span></button>
  <p className="auth-footnote">{admin?"Administrator access is granted only through the secure first-admin setup command.":signup?"Already have an account? ":"New around here? "}{!admin&&<Link href={signup?"/login":"/register"}>{signup?"Sign in":"Create an account"}</Link>}</p>
 </form>;
}

export function AccountPanel({user}:{user:{display_name:string;email:string}}) {
 const [message,setMessage]=useState(""),[error,setError]=useState("");
 async function update(e:FormEvent<HTMLFormElement>){e.preventDefault();setError("");setMessage("");const data=Object.fromEntries(new FormData(e.currentTarget).entries());const response=await fetch("/api/account",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});const result=await response.json();if(!response.ok)setError(result.error);else setMessage("Profile updated.");}
 async function changePassword(e:FormEvent<HTMLFormElement>){e.preventDefault();setError("");setMessage("");const data=Object.fromEntries(new FormData(e.currentTarget).entries());if(data.password!==data.confirmPassword){setError("Those passwords don’t match.");return;}const response=await fetch("/api/account/password",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});const result=await response.json();if(!response.ok)setError(result.error);else{setMessage("Password changed. Other signed-in sessions were ended.");e.currentTarget.reset();}}
 async function removeAccount(){const password=prompt("Enter your password to permanently delete your account.");if(!password)return;const response=await fetch("/api/account",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({password})});if(response.ok)location.assign("/");else{const result=await response.json();setError(result.error||"Account could not be deleted.");}}
 return <div className="account-panels"><form className="settings-card" onSubmit={update}><span className="eyebrow">YOUR DETAILS</span><h2>Profile</h2><label>Display name<input name="displayName" defaultValue={user.display_name} minLength={2} maxLength={50} required/></label><label>Email address<input value={user.email} readOnly/><small>Changing your email needs a verified email service.</small></label><button className="button button-primary">Save changes</button></form><form className="settings-card" onSubmit={changePassword}><span className="eyebrow">KEEP IT YOURS</span><h2>Change password</h2><label>Current password<input name="currentPassword" type="password" required/></label><label>New password<input name="password" type="password" minLength={12} maxLength={128} required/><small>Use at least 12 characters.</small></label><label>Confirm new password<input name="confirmPassword" type="password" minLength={12} maxLength={128} required/></label><button className="button button-primary">Update password</button></form>{(message||error)&&<p className={"form-feedback "+(error?"error-feedback":"success-feedback")} role={error?"alert":"status"}>{error||message}</p>}<div className="settings-card danger-card"><span className="eyebrow">A LAST GOODBYE</span><h2>Delete your account</h2><p>This permanently removes your profile, watchlist and viewing progress.</p><button className="button button-danger" onClick={removeAccount}>Delete account</button></div></div>;
}
