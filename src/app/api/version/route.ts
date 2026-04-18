import { APP_VERSION } from "@/lib/version";

export async function GET() {
  return Response.json({ version: APP_VERSION });
}
