import type { ReactNode } from "react";

import { Button } from "~/components/ui/button";

import styles from "./app-shell.module.css";

const navigationLinks = [
  { href: "/", label: "Countries" },
  { href: "/top-liked", label: "Top Liked" },
  { href: "/top-disliked", label: "Top Disliked" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <a className={styles.brand} href="/">
            Country Ranking
          </a>
          <nav className={styles.nav} aria-label="Primary navigation">
            {navigationLinks.map((link) => (
              <Button
                asChild
                className={styles.navLink}
                key={link.href}
                variant="neutral"
              >
                <a href={link.href}>{link.label}</a>
              </Button>
            ))}
          </nav>
          <div
            className={styles.mediaPlaceholder}
            aria-label="Reserved meme media placeholder"
          >
            Meme media placeholder
          </div>
        </div>
      </header>
      <div className={styles.content}>{children}</div>
    </div>
  );
}
