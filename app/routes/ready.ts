import { handleReady } from "./ready.server";

export async function loader() {
  return handleReady();
}
