"use client";

import { useEffect, useRef } from "react";

export function useScrollReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
      element.classList.add("is-revealed");
      return;
    }

    let frame = 0;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry) return;
      element.classList.add("reveal-prepared");
      if (entry.isIntersecting) {
        frame = window.requestAnimationFrame(() => element.classList.add("is-revealed"));
        observer.disconnect();
      }
    }, { threshold: 0.08, rootMargin: "0px 0px -6% 0px" });

    observer.observe(element);
    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return ref;
}
