"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useState } from "react";

type ConsentChoice = "essential" | "advertising";
const CONSENT_KEY = "kverse-consent-v1";

export function CookieConsent() {
  const [choice, setChoice] = useState<ConsentChoice | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(CONSENT_KEY);
      if (saved === "essential" || saved === "advertising") {
        setChoice(saved);
      } else {
        setOpen(true);
      }
    } catch {
      setOpen(true);
    }

    const openPreferences = () => setOpen(true);
    window.addEventListener("kverse:open-consent", openPreferences);
    return () => window.removeEventListener("kverse:open-consent", openPreferences);
  }, []);

  function saveChoice(next: ConsentChoice) {
    const previous = choice;
    try {
      window.localStorage.setItem(CONSENT_KEY, next);
    } catch {
      // Keep the choice for this page view even if browser storage is unavailable.
    }
    setChoice(next);
    setOpen(false);

    // A loaded third-party tag cannot be reliably unloaded; reload when it is revoked.
    if (previous === "advertising" && next === "essential") window.location.reload();
  }

  return <>
    {choice === "advertising" && <Script
      src="https://nap5k.com/tag.min.js"
      data-zone="12139234"
      strategy="lazyOnload"
    />}
    {open && <aside className="consent-panel" aria-label="Privacy and advertising choices">
      <div className="consent-copy">
        <strong>Your privacy, your choice</strong>
        <p>Sign-in uses an essential cookie. Optional advertising loads only if you allow it. You can change this choice at any time.</p>
        <Link href="/privacy#cookies" onClick={() => setOpen(false)}>Privacy details <span aria-hidden="true">↗</span></Link>
      </div>
      <div className="consent-actions">
        <button type="button" className="button button-outline" onClick={() => saveChoice("essential")}>Essential only</button>
        <button type="button" className="button button-primary" onClick={() => saveChoice("advertising")}>Allow advertising</button>
      </div>
    </aside>}
  </>;
}
