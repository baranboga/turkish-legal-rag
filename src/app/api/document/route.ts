import { NextResponse } from "next/server";
import { getDocumentById } from "@/benchmark/core";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/** GET /api/document?id=<id> — bir kararin saklanan metnini (kisa hal) dondurur. */
export async function GET(req: Request): Promise<Response> {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json(
      { error: "Gecersiz id" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const doc = await getDocumentById(id);
  if (!doc) {
    return NextResponse.json(
      { error: `Dokuman bulunamadi: ${id}` },
      { status: 404, headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(doc, { headers: { "Cache-Control": "no-store" } });
}
