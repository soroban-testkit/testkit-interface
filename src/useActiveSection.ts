import { useEffect, useState } from "react";

/**
 * Tracks which page section is currently in view so navigation links can
 * show where the reader is. Scrolling updates the value through an
 * IntersectionObserver; pointer clicks and keyboard focus call the returned
 * setter directly so the highlight responds immediately.
 */
export function useActiveSection(sectionIds: readonly string[]) {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;

    const sections = sectionIds
      .map((id) => document.getElementById(id))
      .filter((section): section is HTMLElement => section !== null);
    if (sections.length === 0) return;

    // Only the band near the top third of the viewport counts as "in view".
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const id = entry.target.id;
          setActiveId((current) => {
            if (entry.isIntersecting) return id;
            return current === id ? null : current;
          });
        });
      },
      { rootMargin: "-40% 0px -55% 0px" }
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [sectionIds]);

  return [activeId, setActiveId] as const;
}
