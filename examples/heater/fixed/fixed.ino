// heater, fixed build
// A heater controller on an ATmega328P at 16 MHz.
// Pin map:
//   TEMP    ADC0 (PC0)  analog input, 0..1023
//   HEATER  PB0         output
//
// Behavior:
//   - Every loop reads TEMP and looks up HEATER in a 10-entry table, one entry
//     per 100 counts: entries 0..8 heat, entry 9 (900 and up) does not.
//
// Implementation: polling with analogRead(); no blocking waits.

const uint8_t TEMP_CHANNEL = A0;  // ADC0, PC0
const uint8_t HEATER_PIN = 8;     // PB0

const uint8_t HEAT_TABLE[10] = { 1, 1, 1, 1, 1, 1, 1, 1, 1, 0 };
uint8_t heaterLevel = 1;  // last level written to HEATER

void setup() {
  pinMode(HEATER_PIN, OUTPUT);
  digitalWrite(HEATER_PIN, heaterLevel);
}

void loop() {
  int temp = analogRead(TEMP_CHANNEL);
  int index = temp / 100;
  if (index > 9) index = 9;  // 1000..1023 use the last entry
  heaterLevel = HEAT_TABLE[index];
  digitalWrite(HEATER_PIN, heaterLevel ? HIGH : LOW);
}
