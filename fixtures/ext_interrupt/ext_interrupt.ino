// ext_interrupt: each change on PD2 (pin 2, INT0) toggles the LED on PB5 (pin 13).
// Target: ATmega328P at 16 MHz. INT0 is modelled by the emulator setup, so this program
// uses no unmodelled peripheral.

const int TRIGGER_PIN = 2; // PD2, INT0
const int LED_PIN = 13;    // PB5
volatile bool ledOn = false;

void onEdge() {
  ledOn = !ledOn;
  digitalWrite(LED_PIN, ledOn ? HIGH : LOW);
}

void setup() {
  pinMode(LED_PIN, OUTPUT);
  pinMode(TRIGGER_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(TRIGGER_PIN), onEdge, CHANGE);
}

void loop() {
}