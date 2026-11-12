---
inclusion: always
---
# Scope and IP
- Target: ATmega328P at 16 MHz via avr8js only. No compile server. Input = precompiled examples or uploaded .hex.
- Keep avr8js code behind an EmulatorBridge interface. Pin maps are fixture data.
- Language: TypeScript everywhere (UI, engine, Node CLI). Build: Vite. Hosting: GitHub Pages (static).
- Original SVG/CSS art only. No third-party logos, names, or music. Say "ATmega328P", not a board brand.
- All code is written new during Oct 30 - Dec 4, 2026. Prior ideas are listed in PRIOR_WORK.md.