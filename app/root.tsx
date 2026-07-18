import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import type { LinksFunction } from "react-router";

import type { Route } from "./+types/root";
import { AppShell } from "./components/app-shell/app-shell";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card } from "./components/ui/card";
import "./app.css";
import geistLatinExtWoff2 from "@fontsource-variable/geist/files/geist-latin-ext-wght-normal.woff2?url";
import geistLatinWoff2 from "@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url";

const geistFontPreloads = [geistLatinWoff2, geistLatinExtWoff2] as const;
export const fontMetricStableClassName = "font-metric-stable";

export const links: LinksFunction = () =>
  geistFontPreloads.map((href) => ({
    rel: "preload",
    href,
    as: "font",
    type: "font/woff2",
    crossOrigin: "anonymous",
  }));

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className={fontMetricStableClassName}>
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
      <main className="mx-auto flex min-h-[calc(100vh-18rem)] w-full max-w-3xl items-center px-4 py-12">
        <Card
          asChild
          className="w-full gap-0 bg-secondary-background p-6 sm:p-8"
          aria-labelledby="error-title"
        >
          <section>
            <Badge variant="noShadow" className="mb-3">
              country-rank.online
            </Badge>
            <h1
              id="error-title"
              className="mb-3 text-3xl font-heading leading-tight sm:text-4xl"
            >
              {message}
            </h1>
            <p className="mb-6 max-w-prose text-base leading-7">{details}</p>
            <Button asChild variant="neutral">
              <a href="/">Back to countries</a>
            </Button>
            {stack && (
              <pre className="mt-6 max-h-72 overflow-auto rounded-base border-2 border-border bg-background p-4 text-sm leading-6">
                <code>{stack}</code>
              </pre>
            )}
          </section>
        </Card>
      </main>
    </AppShell>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RootErrorPage params={{}} error={error} />;
}
