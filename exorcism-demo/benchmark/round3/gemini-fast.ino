const int PIN_FWD_SW = 8;
const int PIN_REV_SW = 9;

const int BTN_FWD  = 2;
const int BTN_REV  = 3;
const int BTN_STOP = 4;

enum State { STOPPED, FORWARD, REVERSE };
State currentState = STOPPED;

void setMotor(State newState) {
  if (newState == currentState) return;

  // Break-before-make: ensure both switches are OFF first
  digitalWrite(PIN_FWD_SW, LOW);
  digitalWrite(PIN_REV_SW, LOW);
  delayMicroseconds(50); // Dead-time to prevent shoot-through

  if (newState == FORWARD) {
    digitalWrite(PIN_FWD_SW, HIGH);
  } else if (newState == REVERSE) {
    digitalWrite(PIN_REV_SW, HIGH);
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
  if (digitalRead(BTN_STOP) == LOW) {
    setMotor(STOPPED);
  } else if (digitalRead(BTN_FWD) == LOW) {
    setMotor(FORWARD);
  } else if (digitalRead(BTN_REV) == LOW) {
    setMotor(REVERSE);
  }
}