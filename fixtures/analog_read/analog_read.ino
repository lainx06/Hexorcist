// analog_read.ino
// Test sketch for the analog input path.
//
// Pins:
//   A0  (PC0) = analog input, the POT (channel 0)
//   D13 (PB5) = OUTPUT, the LED
//
// Behavior:
//   - loop() reads A0 on every pass and stores the count (0 to 1023) in a
//     volatile variable, so the compiler keeps the conversion in the binary.
//   - The LED (D13) is HIGH when the count is above 600, and LOW otherwise.

const int LED_PIN = 13;         // D13, PB5
const int POT_PIN = A0;         // A0, PC0, ADC channel 0

const int LED_THRESHOLD = 600;  // LED turns on above this count

volatile int reading = 0;       // last count from A0

void setup() {
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  reading = analogRead(POT_PIN);
  digitalWrite(LED_PIN, reading > LED_THRESHOLD ? HIGH : LOW);
}
