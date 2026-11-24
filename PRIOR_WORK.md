# Prior work disclosure
All code in this repository was written during the Kiroween 2026 submission period (Oct 30 - Dec 4, 2026).
Ideas reused from the author's earlier projects, with no code copied:
- Laingate (stopped Nov 2026): checking firmware against stated pin rules before flashing; three-verdict reporting.
- A fault-injection test lab for robot software on QNX in QEMU (separate hackathon): named faults, replay, calibration.
Third-party open-source dependencies: avr8js (MIT). Dev tools: Vite (MIT), Vitest (MIT), fast-check (MIT), TypeScript (Apache-2.0), tsx (MIT). See package.json.
Algorithms re-implemented, no code copied: PCG32 XSH-RR (M. O'Neill; reference implementation is Apache-2.0; test vectors from imneme/pcg-c, `check-pcg32.out`) and the MurmurHash3 fmix32 finalizer (A. Appleby, public domain).