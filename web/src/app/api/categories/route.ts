import { NextResponse } from "next/server";
import { API_URL } from "../auth/_session";

export async function GET() {
  const upstream = await fetch(`${API_URL}/categories`, { cache: "no-store" });
  const data = await upstream.json();
  return NextResponse.json(data, { status: upstream.status });
}
