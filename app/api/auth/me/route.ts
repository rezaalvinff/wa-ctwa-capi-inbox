import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/users";
import { jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

/** GET /api/auth/me - user yang sedang login (sudah divalidasi middleware). */
export async function GET(req: NextRequest) {
  const user = getRequestUser(req);
  if (!user) return jsonError("Belum login.", 401);
  return NextResponse.json({ ok: true, user });
}
