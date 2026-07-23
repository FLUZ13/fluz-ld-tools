import { ExternalLink, Heart, ShieldCheck } from "lucide-react";

export function Credits() {
  return (
    <main className="credits-page">
      <section className="credits-hero"><img src="/assets/ui/rune-smith.png" alt="" /><div><span>FLUZ Tools</span><h1>Built for the Lucky Defense community</h1><p>Created and maintained by FLUZ, with community research turned into practical tools.</p></div></section>
      <section className="credits-columns"><div><Heart /><h2>Project creator</h2><p>FLUZ conceived the platform, collected and reviewed the game data, supplied the asset archive, and maintains the recommendation matrix.</p></div><div><ShieldCheck /><h2>Independent project</h2><p>This is an unofficial community tool and is not affiliated with or endorsed by the game publisher. Game names and assets belong to their respective owners.</p></div><div><ExternalLink /><h2>Source code</h2><p><a href="https://github.com/FLUZ13/fluz-ld-tools" target="_blank" rel="noreferrer">View FLUZ Tools on GitHub</a>.</p></div></section>
      <a className="secondary-button" href="/rune-builder">Return to the tools</a>
    </main>
  );
}
