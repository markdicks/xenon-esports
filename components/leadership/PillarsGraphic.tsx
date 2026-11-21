/* eslint-disable @next/next/no-img-element -- ImageResponse needs a native image element. */
import { staffRoleDefinitions } from "@/data/roles";

export const pillarsGraphicSize = { width: 1080, height: 1350 };

// Only public portfolio definitions enter the graphic; Discord members are never loaded.
export function PillarsGraphic({ logo }: { logo: string }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: 48, backgroundColor: "#090a0f", backgroundImage: "radial-gradient(ellipse at top right, #233019 0%, #090a0f 65%)", color: "#f6f7fb", fontFamily: "Space Grotesk" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <img src={logo} alt="" width={62} height={64} />
          <span style={{ fontSize: 25, fontWeight: 700, letterSpacing: 3 }}>XENON ESPORTS</span>
        </div>
        <div style={{ display: "flex", width: 86, height: 6, backgroundColor: "#d8ff3d" }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 28, fontSize: 72, fontWeight: 700, lineHeight: 1.02, letterSpacing: -3 }}>
        <span>OUR LEADERSHIP</span>
        <span style={{ color: "#d8ff3d" }}>PILLARS.</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 18, marginTop: 32 }}>
        {staffRoleDefinitions.map((role) => (
          <div key={role.id} style={{ width: 483, height: 264, padding: 24, display: "flex", flexDirection: "column", backgroundColor: "#11151b", border: "1px solid #3a4426", borderTop: "3px solid #d8ff3d", borderRadius: 8 }}>
            <span style={{ color: "#d8ff3d", fontSize: 21, lineHeight: 1.2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 2 }}>{role.department}</span>
            <span style={{ fontSize: 30, lineHeight: 1.2, fontWeight: 700, marginTop: 12 }}>{role.title}</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 20, color: "#c0c8d5", fontSize: 20, lineHeight: 1.3 }}>
              {role.responsibilities.map((responsibility) => (
                <div key={responsibility} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ display: "flex", width: 6, height: 6, flexShrink: 0, marginTop: 10, backgroundColor: "#d8ff3d" }} />
                  <span style={{ flex: 1 }}>{responsibility}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "auto", paddingTop: 20, fontSize: 18, color: "#aeb7c7" }}>
        <span>Six portfolios. One Xenon.</span>
        <span style={{ color: "#d8ff3d" }}>xenonesports.online</span>
      </div>
    </div>
  );
}
