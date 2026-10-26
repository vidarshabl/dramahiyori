"use client";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode } from "react";

type User={id:string;email:string;display_name:string;role:string};
function Wordmark({brand,tagline,className=""}:{brand:string;tagline:string;className?:string}){return <Link href="/" className={"brand "+className} aria-label={brand+" home"}><span className="brand-mark">✦</span>{brand.trim().toLowerCase()==="deardrama"?<span>dear<span className="brand-script">drama</span><small>{tagline}</small></span>:<span className="custom-wordmark">{brand}<small>{tagline}</small></span>}</Link>}
export function SiteHeader() {
  const [user,setUser]=useState<User|null>(null), [open,setOpen]=useState(false), [menu,setMenu]=useState(false), [query,setQuery]=useState(""),[scrolled,setScrolled]=useState(false);
  const [brand,setBrand]=useState("DearDrama"),[tagline,setTagline]=useState("stories that stay");
  const pathname=usePathname(), router=useRouter();
  useEffect(()=>{fetch("/api/auth/me").then(r=>r.json()).then(d=>setUser(d.user)).catch(()=>{});},[pathname]);
  useEffect(()=>{fetch("/api/settings").then(r=>r.json()).then(d=>{if(d.settings?.brand)setBrand(d.settings.brand);if(d.settings?.tagline)setTagline(d.settings.tagline);}).catch(()=>{});},[]);
  useEffect(()=>{const onScroll=()=>setScrolled(window.scrollY>26);window.addEventListener("scroll",onScroll,{passive:true});onScroll();return()=>window.removeEventListener("scroll",onScroll);},[]);
  useEffect(()=>{setMenu(false);},[pathname]);
  function search(e:FormEvent) {e.preventDefault();router.push("/search"+(query.trim()?"?q="+encodeURIComponent(query.trim()):""));setOpen(false);}
  async function logout() {await fetch("/api/auth/logout",{method:"POST"});setUser(null);router.push("/");router.refresh();}
  return <>
    <header className={"site-header"+(scrolled?" is-scrolled":"")}><div className="header-inner">
      <Wordmark brand={brand} tagline={tagline}/>
      <nav className="desktop-nav" aria-label="Main navigation">
        <Link href="/">Home</Link><Link href="/browse?type=series">K-Dramas</Link><Link href="/browse?type=movie">Movies</Link><Link href="/browse?status=ongoing">Ongoing</Link><Link href="/genres">Genres</Link><Link href="/new">New releases</Link>
      </nav>
      <div className="header-actions">
        <button className="icon-button search-toggle" onClick={()=>setOpen(!open)} aria-label="Open search" aria-expanded={open}><Icon name="search"/></button>
        <Link href="/watchlist" className="icon-button watchlist-link" aria-label="Watchlist"><Icon name="bookmark"/></Link>
        {user ? <div className="account-wrap"><button className="avatar-button" onClick={()=>setMenu(!menu)} aria-expanded={menu} aria-label="Account menu">{user.display_name.slice(0,1).toUpperCase()}</button>{menu&&<div className="account-popover"><span className="popover-name">{user.display_name}</span><Link href="/account">Your account</Link><Link href="/watchlist">Watchlist</Link>{user.role==="admin"&&<Link href="/admin/dashboard">Admin dashboard</Link>}<button onClick={logout}>Sign out</button></div>}</div>
          : <div className="auth-links"><Link href="/login">Sign in</Link><Link href="/register" className="nav-join">Join free</Link></div>}
        <button className="icon-button mobile-menu-button" onClick={()=>setMenu(!menu)} aria-label={menu?"Close menu":"Open menu"} aria-expanded={menu}><Icon name={menu?"close":"menu"}/></button>
      </div>
    </div>
    {open&&<form className="header-search" onSubmit={search}><Icon name="search"/><input autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find your next favorite story" aria-label="Search dramas and movies"/><button type="submit" className="button button-small">Search</button></form>}
    {menu&&<nav className="mobile-nav" aria-label="Mobile navigation"><Link href="/">Home</Link><Link href="/browse?type=series">K-Dramas</Link><Link href="/browse?type=movie">Movies</Link><Link href="/genres">Genres &amp; moods</Link><Link href="/new">New releases</Link><Link href="/watchlist">My watchlist</Link>{user?<><Link href="/account">My account</Link>{user.role==="admin"&&<Link href="/admin/dashboard">Admin dashboard</Link>}<button onClick={logout}>Sign out</button></>:<><Link href="/login">Sign in</Link><Link href="/register">Create account</Link></>}</nav>}
    </header>
  </>;
}
export function SiteFooter(){const [brand,setBrand]=useState("DearDrama"),[tagline,setTagline]=useState("A little room for the stories that stay.");useEffect(()=>{fetch("/api/settings").then(r=>r.json()).then(d=>{if(d.settings?.brand)setBrand(d.settings.brand);if(d.settings?.tagline)setTagline(d.settings.tagline);}).catch(()=>{});},[]);return <footer className="site-footer"><div className="footer-top"><Wordmark brand={brand} tagline={tagline} className="footer-brand"/><p>{tagline}</p><Link href="/admin/login" className="admin-entry">Administrator sign in <span>↗</span></Link></div><div className="footer-links"><Link href="/about">About</Link><Link href="/contact">Contact</Link><Link href="/help">Help</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/content-policy">Content policy</Link><Link href="/report">Report content</Link></div><div className="footer-bottom"><span>© {new Date().getFullYear()} {brand}</span><span>Independent discovery · Demonstration catalog</span></div></footer>}
export function PublicChrome({children}:{children:ReactNode}){const pathname=usePathname();if(pathname.startsWith("/admin"))return <>{children}</>;return <><SiteHeader/>{children}<SiteFooter/></>}

export function Icon({name}:{name:"search"|"bookmark"|"menu"|"close"|"play"|"arrow"|"chevron"|"spark"|"heart"|"clock"|"lock"}) {
  const paths:Record<string,React.ReactNode>={search:<><circle cx="10.8" cy="10.8" r="6.7"/><path d="m16 16 4 4"/></>,bookmark:<path d="M6 4.7A1.7 1.7 0 0 1 7.7 3h8.6A1.7 1.7 0 0 1 18 4.7V21l-6-3.5L6 21z"/>,menu:<><path d="M4 7h16M4 12h16M4 17h16"/></>,close:<path d="m6 6 12 12M18 6 6 18"/>,play:<path d="m8 5 11 7-11 7z"/>,arrow:<><path d="M4 12h15"/><path d="m13 6 6 6-6 6"/></>,chevron:<path d="m7 10 5 5 5-5"/>,spark:<><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/></>,heart:<path d="M20.8 8.7c0 5.2-8.8 10.3-8.8 10.3S3.2 13.9 3.2 8.7A4.3 4.3 0 0 1 12 6.9a4.3 4.3 0 0 1 8.8 1.8Z"/>,clock:<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,lock:<><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>};
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" className="icon">{paths[name]}</svg>;
}
