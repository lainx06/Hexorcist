const uint8_t FWD_BTN = 2;
const uint8_t REV_BTN = 3;
const uint8_t STOP_BTN = 4;

const uint8_t FWD_OUT = 8;
const uint8_t REV_OUT = 9;

void setup() {
  // Set outputs LOW before enabling them so the motor never starts by accident
  digitalWrite(FWD_OUT, LOW);
  digitalWrite(REV_OUT, LOW);
  pinMode(FWD_OUT, OUTPUT);
  pinMode(REV_OUT, OUTPUT);

  pinMode(FWD_BTN, INPUT_PULLUP);
  pinMode(REV_BTN, INPUT_PULLUP);
  pinMode(STOP_BTN, INPUT_PULLUP);
}

void loop() {
  bool fwdPressed  = (digitalRead(FWD_BTN) == LOW);
  bool revPressed  = (digitalRead(REV_BTN) == LOW);
  bool stopPressed = (digitalRead(STOP_BTN) == LOW);

  if (stopPressed) {
    digitalWrite(FWD_OUT, LOW);
    digitalWrite(REV_OUT, LOW);
  } else if (fwdPressed) {
    // Turn the opposite switch off first so both are never HIGH together
    digitalWrite(REV_OUT, LOW);
    digitalWrite(FWD_OUT, HIGH);
  } else if (revPressed) {
    digitalWrite(FWD_OUT, LOW);
    digitalWrite(REV_OUT, HIGH);
  } else {
    digitalWrite(FWD_OUT, LOW);
    digitalWrite(REV_OUT, LOW);
  }
}