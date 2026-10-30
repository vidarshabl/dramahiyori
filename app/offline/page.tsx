import Link from "next/link";

export const metadata = { title: "You’re offline", robots: { index: false, follow: false } };

export default function OfflinePage() {
  return <main className="offline-page"><span className="eyebrow">A QUIET PAUSE</span><h1>You’re offline right now.</h1><p>Reconnect to continue exploring KVERSE. The pages you have already opened may still be available in your browser.</p><Link className="button button-primary" href="/">Try again</Link></main>;
}
