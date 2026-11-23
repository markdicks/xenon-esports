export function SocialIcon({ kind }: { kind: string }) {
  const paths: Record<string, React.ReactNode> = {
    instagram: <><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r=".6" fill="currentColor" /></>,
    youtube: <><rect x="2" y="5" width="20" height="14" rx="4" /><path d="m10 9 5 3-5 3Z" fill="currentColor" stroke="none" /></>,
    tiktok: <><path d="M14 3v12.5a4.5 4.5 0 1 1-4-4.47M14 3c.4 4 2.4 6 6 6V6c-2.7-.2-3.9-1.7-4-3Z" /></>,
    twitch: <><path d="M4 3h17v12l-6 6h-5v-4H4ZM10 7v5m5-5v5" /></>,
    discord: <><path d="M7 5a18 18 0 0 1 10 0l1 2 2 1 2 10-5 2-1-3H8l-1 3-5-2L4 8l2-1Z" /><circle cx="8.5" cy="12" r="1" /><circle cx="15.5" cy="12" r="1" /></>,
    website: <><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18" /></>,
    custom: <><path d="m10 13 4-4m-6 6-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 3 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" /></>,
  };
  return <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind] || paths.custom}</svg>;
}
