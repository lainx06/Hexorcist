---
inclusion: always
---
# Verdicts (exact strings, nothing else)
- BROKE: a monitor observed a violation; always show the trace that caused it.
- HELD: "No violation found in N runs of this gremlin set. Not a proof." N is the real count.
- COULDN'T TELL: the rule cannot be checked with the signals, peripherals, or run length available. Say why.
Unbounded "eventually" is COULDN'T TELL. Unmapped pins or unsupported peripherals are COULDN'T TELL, never a guess.
The shrinker shows "the smallest replay this reducer found", never "the shortest".