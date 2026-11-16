// serial_hello: prints a greeting on the serial port and blinks one LED.
// Target: ATmega328P at 16 MHz. LED on PB5 (pin 13).
// The serial port (USART0) is not modelled by the emulator setup, so a check of this
// program gives COULDN'T TELL. In the emulator the transmit buffer never drains, so
// Serial.print waits forever once the buffer is full.

const int LED_PIN = 13; // PB5
bool ledOn = false;

void setup() {
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  Serial.print("hello ");
  ledOn = !ledOn;
  digitalWrite(LED_PIN, ledOn ? HIGH : LOW);
  delay(100);
}