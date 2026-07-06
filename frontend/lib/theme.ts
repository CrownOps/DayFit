"use client";

import { useEffect, useState } from "react";

export type ThemePref = "light" | "dark" | "system";

const KEY = "dayfit-theme";

function applyTheme(pref: ThemePref) {
  const root = document.documentElement;
  if (pref === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", pref);
  }
}

export function useTheme() {
  const [pref, setPref] = useState<ThemePref>("system");

  useEffect(() => {
    const stored = (localStorage.getItem(KEY) as ThemePref | null) ?? "system";
    setPref(stored);
  }, []);

  const setTheme = (next: ThemePref) => {
    setPref(next);
    if (next === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
    applyTheme(next);
  };

  return { pref, setTheme };
}

/**
 * Resolves the *effective* theme ("light" | "dark") accounting for the
 * `system` preference and live changes to both the OS setting and the
 * `data-theme` attribute. Returns null until mounted (avoids SSR mismatch).
 */
export function useEffectiveTheme(): "light" | "dark" | null {
  const [effective, setEffective] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");

    const resolve = () => {
      const attr = document.documentElement.getAttribute("data-theme");
      if (attr === "light" || attr === "dark") {
        setEffective(attr);
      } else {
        setEffective(mql.matches ? "dark" : "light");
      }
    };

    resolve();
    mql.addEventListener("change", resolve);

    const observer = new MutationObserver(resolve);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    return () => {
      mql.removeEventListener("change", resolve);
      observer.disconnect();
    };
  }, []);

  return effective;
}
