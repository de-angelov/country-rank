declare module "*.module.css" {
  const classes: Record<string, string>;
  export default classes;
}

declare module "*.woff2?url" {
  const url: string;
  export default url;
}
