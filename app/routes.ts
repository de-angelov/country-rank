import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("top-liked", "routes/top-liked.tsx"),
  route("top-disliked", "routes/top-disliked.tsx"),
  route("votes", "routes/votes.ts"),
  route("webhooks/stripe", "routes/webhooks.stripe.ts"),
] satisfies RouteConfig;
