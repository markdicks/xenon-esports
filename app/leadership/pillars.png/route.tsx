import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { PillarsGraphic, pillarsGraphicSize } from "@/components/leadership/PillarsGraphic";

export const runtime = "nodejs";
export const dynamic = "force-static";

export async function GET() {
  const [logo, regular, bold] = await Promise.all([
    readFile(join(process.cwd(), "public/favicon.svg")),
    readFile(join(process.cwd(), "assets/fonts/space-grotesk/SpaceGrotesk-Regular.ttf")),
    readFile(join(process.cwd(), "assets/fonts/space-grotesk/SpaceGrotesk-Bold.ttf")),
  ]);
  return new ImageResponse(<PillarsGraphic logo={`data:image/svg+xml;base64,${logo.toString("base64")}`} />, {
    ...pillarsGraphicSize,
    fonts: [
      { name: "Space Grotesk", data: regular, weight: 400, style: "normal" },
      { name: "Space Grotesk", data: bold, weight: 700, style: "normal" },
    ],
    headers: {
      "Content-Disposition": 'inline; filename="xenon-leadership-pillars.png"',
      "Cache-Control": "public, max-age=300, must-revalidate",
    },
  });
}
