"use client";

// Google Identity Services "Sign in with Google" button for patients. It only produces an ID token; the
// backend verifies that token with Google and checks it was issued for OUR client id. No client secret exists
// in this flow. The client id is public configuration (NEXT_PUBLIC_GOOGLE_CLIENT_ID).

import React, { useEffect, useRef, useState } from "react";

export const GOOGLE_CLIENT_ID: string = (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "").trim();

interface GoogleId {
  initialize(cfg: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: string }): void;
  renderButton(el: HTMLElement, opts: Record<string, unknown>): void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

const SRC = "https://accounts.google.com/gsi/client";

function loadScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const existing = document.querySelector(`script[src="${SRC}"]`) as HTMLScriptElement | null;
    const el = existing ?? Object.assign(document.createElement("script"), { src: SRC, async: true, defer: true });
    el.addEventListener("load", () => resolve());
    el.addEventListener("error", () => reject(new Error("Could not load Google Sign-In")));
    if (!existing) document.head.appendChild(el);
  });
}

export function GoogleSignIn({ onCredential, label = "continue_with" }: { onCredential: (idToken: string) => void; label?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const cb = useRef(onCredential);
  useEffect(() => {
    cb.current = onCredential; // always call the latest handler
  }, [onCredential]);

  useEffect(() => {
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !box.current || !window.google) return;
        window.google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: (r) => cb.current(r.credential) });
        window.google.accounts.id.renderButton(box.current, { theme: "outline", size: "large", text: label, shape: "rectangular", width: 320 });
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [label]);

  if (failed) return <p className="text-xs text-rose-600">Google Sign-In could not be loaded. Check your connection / ad-blocker.</p>;
  return <div ref={box} className="flex min-h-[44px] justify-center" />;
}
