import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home/home.tsx"),
  route("top-liked", "routes/top-liked/top-liked.tsx"),
  route("top-disliked", "routes/top-disliked/top-disliked.tsx"),
  route("votes", "routes/votes.ts"),
  route("checkout", "routes/checkout.ts"),
  route("checkout-status", "routes/checkout-status.ts"),
  route("health", "routes/health.ts"),
  route("ready", "routes/ready.ts"),
  route("webhooks/stripe", "routes/webhooks.stripe.ts"),
] satisfies RouteConfig;
