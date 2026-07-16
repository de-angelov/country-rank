import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import { AppShell } from "./components/app-shell/app-shell";
import { Button } from "./components/ui/button";
import "./app.css";
import styles from "./root.module.css";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

export function RootErrorPage({ error }: Route.ErrorBoundaryProps) {
  let message = "Something went wrong";
  let details = "Please try again in a moment.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "Page not found" : message;
    details =
      error.status === 404
        ? "The requested page could not be found."
        : details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <AppShell>
      <main className={styles.errorPage}>
        <section
          className={styles.errorPanel}
          aria-labelledby="error-title"
        >
          <p className={styles.errorEyebrow}>
            Country Ranking
          </p>
          <h1
            id="error-title"
            className={styles.errorTitle}
          >
            {message}
          </h1>
          <p className={styles.errorDetails}>{details}</p>
          <Button asChild variant="neutral">
            <a href="/">Back to countries</a>
          </Button>
          {stack && (
            <pre className={styles.errorStack}>
              <code>{stack}</code>
            </pre>
          )}
        </section>
      </main>
    </AppShell>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RootErrorPage error={error} />;
}
