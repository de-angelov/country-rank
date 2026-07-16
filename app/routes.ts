import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("votes", "routes/votes.ts"),
  route("webhooks/stripe", "routes/webhooks.stripe.ts"),
] satisfies RouteConfig;
