# Requirements Document

## Introduction

The crosswalk sketch in exorcism-demo/sketch/sketch.ino must hold up under the Hexorcist check.

## Requirements

### Requirement 1: Sketch passes the Hexorcist check

**User Story:** As a maker, I want gremlins to attack the crosswalk sketch, so that I find its bugs before flashing a board.

#### Acceptance Criteria

1. WHEN `node exorcism-demo/build.mjs` has built the sketch, THE Hexorcist check tool SHALL run with hex `exorcism-demo/build/sketch.hex`, pins `examples/crosswalk/fixture.json`, rules `exorcism-demo/crosswalk-full-rules.txt`, gremlins `masher,bouncer`, runs 24 and seed 20261101.
2. THE check SHALL answer HELD for that run, and only exorcism-demo/sketch/sketch.ino SHALL be edited.
