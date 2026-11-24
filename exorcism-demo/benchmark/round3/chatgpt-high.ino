const byte FWD_SWITCH = 8;
const byte REV_SWITCH = 9;

const byte FWD_BUTTON = 2;
const byte REV_BUTTON = 3;
const byte STOP_BUTTON = 4;

// Adjust dead time to suit transistor turn-off characteristics.
// Use hardware interlocking and external pull-downs for safety.
const unsigned int DEAD_TIME_MS = 10;

enum Direction { STOPPED, FORWARD, REVERSE };
Direction current = STOPPED;

void setMotor(Direction next) {
  if (next == current) return;

  // Break before make: always turn BOTH switches off first.
  digitalWrite(FWD_SWITCH, LOW);
  digitalWrite(REV_SWITCH, LOW);
  current = STOPPED;

  if (next == STOPPED) return;

  delay(DEAD_TIME_MS);

  // Check STOP again before energizing either switch.
  if (digitalRead(STOP_BUTTON) == LOW) return;

  if (next == FORWARD) {
    digitalWrite(FWD_SWITCH, HIGH);
  } else if (next == REVERSE) {
    digitalWrite(REV_SWITCH, HIGH);
  }

  current = next;
}

void setup() {
  digitalWrite(FWD_SWITCH, LOW);
  digitalWrite(REV_SWITCH, LOW);

  pinMode(FWD_SWITCH, OUTPUT);
  pinMode(REV_SWITCH, OUTPUT);

  pinMode(FWD_BUTTON, INPUT_PULLUP);
  pinMode(REV_BUTTON, INPUT_PULLUP);
  pinMode(STOP_BUTTON, INPUT_PULLUP);
}

void loop() {
  bool fwd = digitalRead(FWD_BUTTON) == LOW;
  bool rev = digitalRead(REV_BUTTON) == LOW;
  bool stop = digitalRead(STOP_BUTTON) == LOW;

  // STOP takes priority. Conflicting commands also stop.
  if (stop || (fwd && rev)) {
    setMotor(STOPPED);
  } else if (fwd) {
    setMotor(FORWARD);
  } else if (rev) {
    setMotor(REVERSE);
  }
}