---
name: check-firmware
description: Check an ATmega328P HEX file against plain-English rules with the Hexorcist MCP server before it goes on a board.
---

# Check firmware with Hexorcist

Use this when you wrote or changed firmware for an ATmega328P and want gremlins to attack it on an emulated chip before anyone flashes it.

1. Call `capabilities` before any other tool. It lists the rule sentence forms, the gremlin ids and the peripherals the emulator does not model.
2. Write rules only in the five sentence forms `capabilities` returns. Do not invent other wording.
3. Call `check` after the rules are written, with the HEX file, the pins file and the rules file.
4. Report the verdict as it came back.
   - HELD: quote the HELD text word for word: "No violation found in N emulated runs of this gremlin set. Not a proof."
   - BROKE: show the trace. Call the reduced list "the smallest replay this reducer found".
   - COULDN'T TELL: give the reason as returned. Do not guess.

## Result field: reasonTruncated

`reasonTruncated`: true when the reason reached the 200-character limit, so it may have been cut

A passing check is evidence from the emulated runs, not proof the firmware is correct.
