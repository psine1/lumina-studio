import { NextResponse } from "next/server";
import { publicModels } from "@/lib/magnific/models";

export async function GET() {
  return NextResponse.json({ models: publicModels() });
}
