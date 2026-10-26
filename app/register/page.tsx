import Link from "next/link";
import {AuthForm} from "@/components/AuthForm";
export const metadata={title:"Create an account",robots:{index:false,follow:false}};
export default function RegisterPage(){return <main className="auth-scene"><section className="auth-card"><Link href="/" className="brand"><span className="brand-mark">✦</span><span>dear<span className="brand-script">drama</span><small>stories that stay</small></span></Link><span className="eyebrow">MAKE YOURSELF AT HOME</span><h1>Find your story.</h1><p className="auth-intro">A free account keeps your watchlist and place in a story together.</p><AuthForm mode="register"/><Link href="/" className="auth-return">← Explore without an account</Link></section></main>}
