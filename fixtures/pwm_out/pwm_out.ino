// pwm_out.ino
// Test sketch for timer PWM outputs and one plain digital output on an ATmega328P.
//
// Pins:
//   pin 6  (PD6) = OUTPUT, Timer0 compare output A (OC0A), duty set with analogWrite
//   pin 9  (PB1) = OUTPUT, Timer1 compare output A (OC1A), duty set with analogWrite
//   pin 13 (PB5) = OUTPUT, plain level set with digitalWrite
//
// Behavior:
//   - Every 50 ms both duty values move one step through a five-step table and
//     wrap around, so the pattern repeats every 250 ms.
//       PD6: 0, 64, 128, 192, 255
//       PB1: 255, 192, 128, 64, 0
//     A duty of 0 or 255 makes the core turn the timer output off and write the
//     pin as a plain LOW or HIGH, so the same pins are also driven through PORTx.
//   - Every 100 ms PB5 toggles.
//   - No input pin is read.
//
// Timing uses millis() with next += interval, so the periods do not drift.
const uint8_t PWM_A_PIN = 6;   // PD6, OC0A
const uint8_t PWM_B_PIN = 9;   // PB1, OC1A
const uint8_t LED_PIN = 13;    // PB5
const uint8_t STEPS = 5;
const uint8_t DUTY_A[STEPS] = {0, 64, 128, 192, 255};
const uint8_t DUTY_B[STEPS] = {255, 192, 128, 64, 0};
const unsigned long DUTY_MS = 50;   // 800,000 cycles at 16 MHz
const unsigned long LED_MS = 100;   // 1,600,000 cycles at 16 MHz
uint8_t step = 0;
uint8_t ledLevel = LOW;
unsigned long nextDuty = 0;
unsigned long nextLed = 0;
void applyStep() {
  analogWrite(PWM_A_PIN, DUTY_A[step]);
  analogWrite(PWM_B_PIN, DUTY_B[step]);
}
void setup() {
  pinMode(PWM_A_PIN, OUTPUT);
  pinMode(PWM_B_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  step = 0;
  applyStep();
  unsigned long now = millis();
  nextDuty = now + DUTY_MS;
  nextLed = now + LED_MS;
}
void loop() {
  unsigned long now = millis();
  if ((long)(now - nextDuty) >= 0) {
    nextDuty += DUTY_MS;
    step = (step + 1) % STEPS;
    applyStep();
  }
  if ((long)(now - nextLed) >= 0) {
    nextLed += LED_MS;
    ledLevel = (ledLevel == LOW) ? HIGH : LOW;
    digitalWrite(LED_PIN, ledLevel);
  }
}