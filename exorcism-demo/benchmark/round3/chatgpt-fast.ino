const byte FWD = 8;
const byte REV = 9;

const byte BTN_FWD  = 2;
const byte BTN_REV  = 3;
const byte BTN_STOP = 4;

void setup() {
  digitalWrite(FWD, LOW);
  digitalWrite(REV, LOW);

  pinMode(FWD, OUTPUT);
  pinMode(REV, OUTPUT);

  pinMode(BTN_FWD, INPUT_PULLUP);
  pinMode(BTN_REV, INPUT_PULLUP);
  pinMode(BTN_STOP, INPUT_PULLUP);
}

void loop() {
  bool forward = digitalRead(BTN_FWD) == LOW;
  bool reverse = digitalRead(BTN_REV) == LOW;
  bool stop    = digitalRead(BTN_STOP) == LOW;

  if (stop || (forward && reverse)) {
    digitalWrite(FWD, LOW);
    digitalWrite(REV, LOW);
  }
  else if (forward) {
    digitalWrite(REV, LOW);
    delay(10);  // Dead time; verify against hardware turn-off time
    digitalWrite(FWD, HIGH);
  }
  else if (reverse) {
    digitalWrite(FWD, LOW);
    delay(10);  // Dead time; verify against hardware turn-off time
    digitalWrite(REV, HIGH);
  }
}

// Use external pull-down resistors on both switch controls
// to keep them OFF during startup and reset.
// Use a hardware interlock for guaranteed shoot-through protection.