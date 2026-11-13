// floating_input.ino
// Test sketch for inputs that nothing drives from outside.
//
// Pins:
//   D13 (PB5) = OUTPUT, the LED
//   D3  (PD3) = INPUT, no pull-up, read on every pass of loop()
//   D4  (PD4) = INPUT for the earliest 100 ms, then INPUT_PULLUP (switched once)
//
// Behavior:
//   - D3 is read on every pass. The result goes into a volatile variable so
//     the compiler keeps the PIND read in the binary.
//   - D4 starts as a plain input. When millis() reaches 100, loop() turns on
//     its pull-up one time.
//   - The LED (D13) is HIGH when D4 reads HIGH, and LOW otherwise.

const int LED_PIN = 13;     // D13, PB5
const int FLOAT_PIN = 3;    // D3, PD3, plain input
const int LATE_PIN = 4;     // D4, PD4, pull-up is enabled after 100 ms

const unsigned long PULLUP_AT_MS = 100;

volatile int sink = 0;      // keeps the D3 read from being optimized away
bool pulledUp = false;

void setup() {
  pinMode(LED_PIN, OUTPUT);
  pinMode(FLOAT_PIN, INPUT);
  pinMode(LATE_PIN, INPUT);
}

void loop() {
  // Switch D4 to a pull-up input one time, once 100 ms have passed.
  if (!pulledUp && millis() >= PULLUP_AT_MS) {
    pinMode(LATE_PIN, INPUT_PULLUP);
    pulledUp = true;
  }

  // Read D3 on every pass.
  sink = digitalRead(FLOAT_PIN);

  // Mirror D4 on the LED.
  digitalWrite(LED_PIN, digitalRead(LATE_PIN) == HIGH ? HIGH : LOW);
}
