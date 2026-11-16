// eeprom_boot: reads one byte from the data EEPROM at start-up and uses it to pick the
// blink rate of the LED on PB5 (pin 13).
// Target: ATmega328P at 16 MHz. The data EEPROM is not modelled by the emulator setup,
// so a check of this program gives COULDN'T TELL.

#include <EEPROM.h>

const int LED_PIN = 13; // PB5
unsigned long halfPeriodMs = 250;
bool ledOn = false;

void setup() {
  pinMode(LED_PIN, OUTPUT);
  byte stored = EEPROM.read(0);
  // An erased chip reads 0xFF: blink fast. Any stored value: blink slowly.
  halfPeriodMs = (stored == 0xFF) ? 100 : 250;
}

void loop() {
  ledOn = !ledOn;
  digitalWrite(LED_PIN, ledOn ? HIGH : LOW);
  delay(halfPeriodMs);
}