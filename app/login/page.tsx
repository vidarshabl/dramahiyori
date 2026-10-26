import Link from "next/link";
import {AuthForm} from "@/components/AuthForm";
export const metadata={title:"Sign in",robots:{index:false,follow:false}};
export default function LoginPage(){return <main className="auth-scene"><section className="auth-card"><Link href="/" className="brand"><span className="brand-mark">✦</span><span>dear<span className="brand-script">drama</span><small>stories that stay</small></span></Link><span className="eyebrow">WELCOME BACK</span><h1>Come on in.</h1><p className="auth-intro">Your next favorite story is right where you left it.</p><AuthForm mode="login"/><Link href="/" className="auth-return">← Browse as a guest</Link></section></main>}
