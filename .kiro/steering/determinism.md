---
inclusion: always
---
# Determinism
- Simulated time is integer CPU cycles. Never use Date.now, performance.now, or setTimeout for rule timing.
- All randomness comes from one seeded PRNG passed in explicitly. No Math.random in engine code.
- Replay = fresh emulator + same HEX + same fixture + same ordered event list. No snapshots.
- The checker contains no AI and makes no network calls.