# Spike Results

## S5: Benchmark (Node, avr8js)

- **Node version:** v26.13.1
- **avr8js version:** 0.21.1
- **OS:** Windows_NT 10.0.26200 (x64)
- **Total cycles:** 160,000,000
- **Wall seconds:** 3.393
- **Simulated seconds per real second:** 2.95
- **Date:** 2026-11-13

## Browser observations (user, 2026-11-12)

- S1 PASS: LED toggles 31.484 / 31.984 / 32.483 / 32.983 s simulated; cycle gaps 8,011,824 and 7,995,334.
- S2 PASS: holding the button gave toggles 0.1 s apart (30.483 to 30.983 s); cycle gap 1,605,688.
- Console: no errors.

## S3/S4

released run = BROKE at onCycle + 4,800,000 (LED on longer than 300 ms); held run = no violation; replay in chunks of 1,000 / 160,000 / one call = same violation cycle; LED still on at run end is detected (test 4).
