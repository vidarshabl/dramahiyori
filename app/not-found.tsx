import Link from "next/link";
export default function NotFound(){return <main className="page-shell"><div className="empty-state"><span>☾</span><h1>That page wandered off.</h1><p>Let’s find another story together.</p><Link href="/" className="button button-primary">Back home <span>↗</span></Link></div></main>}
