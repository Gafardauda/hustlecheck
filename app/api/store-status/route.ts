import { storeAvailable } from "@/lib/store";

// Temporary: reports whether report storage is configured on this deployment.
// Lists only the NAMES of matching env vars, never their values. Remove after verifying.
export function GET() {
  const names = Object.keys(process.env).filter((k) => /KV_|UPSTASH|REDIS/.test(k));
  return Response.json({ storeAvailable: storeAvailable(), matchingEnvNames: names });
}
