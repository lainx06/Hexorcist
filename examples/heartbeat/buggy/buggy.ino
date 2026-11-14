// heartbeat, buggy build
// A heartbeat LED next to a pulse input on an ATmega328P at 16 MHz.
// Pin map:
//   PULSE      PD2  input, INPUT_PULLUP, sensor pulls it to ground during a pulse (active low)
//   HEARTBEAT  PB0  output
//
// Behavior:
//   - HEARTBEAT toggles every BEAT_MS to show the program is running.
//   - While PULSE is LOW the sketch waits for the pulse to end and times it.
//   - At startup: HEARTBEAT is LOW.
//
// Implementation: millis()-based toggling; the pulse wait is a busy loop.

const uint8_t PULSE_PIN = 2;       // PD2
const uint8_t HEARTBEAT_PIN = 8;   // PB0

const unsigned long BEAT_MS = 200;           // HEARTBEAT toggle interval
const unsigned long PULSE_TIMEOUT_MS = 100;  // longest wait for one pulse

unsigned long lastToggle = 0;
bool beat = LOW;
unsigned long lastPulseMs = 0;  // length of the latest pulse

void setup() {
  pinMode(PULSE_PIN, INPUT_PULLUP);
  pinMode(HEARTBEAT_PIN, OUTPUT);
  digitalWrite(HEARTBEAT_PIN, beat);
  lastToggle = millis();
}

void loop() {
  unsigned long now = millis();
  if (now - lastToggle >= BEAT_MS) {
    beat = !beat;
    digitalWrite(HEARTBEAT_PIN, beat);
    lastToggle = now;
  }

  if (digitalRead(PULSE_PIN) == LOW) {
    unsigned long start = millis();
    while (digitalRead(PULSE_PIN) == LOW) {  // wait for the pulse to end
    }
    lastPulseMs = millis() - start;
  }
}
