const uint8_t PIN_FWD_SW = 8;
const uint8_t PIN_REV_SW = 9;

const uint8_t BTN_FWD = 2;
const uint8_t BTN_REV = 3;
const uint8_t BTN_STOP = 4;

enum MotorState { STOPPED, FORWARD, REVERSE };
MotorState currentState = STOPPED;

void setMotor(MotorState newState) {
  if (newState == currentState) return;

  // Break-before-make: turn both switches off first to prevent shoot-through
  digitalWrite(PIN_FWD_SW, LOW);
  digitalWrite(PIN_REV_SW, LOW);

  if (newState != STOPPED) {
    delay(10); // Dead-time for transistor turn-off
    if (newState == FORWARD) {
      digitalWrite(PIN_FWD_SW, HIGH);
    } else if (newState == REVERSE) {
      digitalWrite(PIN_REV_SW, HIGH);
    }
  }

  currentState = newState;
}

void setup() {
  digitalWrite(PIN_FWD_SW, LOW);
  digitalWrite(PIN_REV_SW, LOW);
  pinMode(PIN_FWD_SW, OUTPUT);
  pinMode(PIN_REV_SW, OUTPUT);

  pinMode(BTN_FWD, INPUT_PULLUP);
  pinMode(BTN_REV, INPUT_PULLUP);
  pinMode(BTN_STOP, INPUT_PULLUP);
}

void loop() {
  bool stopPressed = (digitalRead(BTN_STOP) == LOW);
  bool fwdPressed  = (digitalRead(BTN_FWD) == LOW);
  bool revPressed  = (digitalRead(BTN_REV) == LOW);

  if (stopPressed || (fwdPressed && revPressed)) {
    setMotor(STOPPED);
  } else if (fwdPressed) {
    setMotor(FORWARD);
  } else if (revPressed) {
    setMotor(REVERSE);
  }
}