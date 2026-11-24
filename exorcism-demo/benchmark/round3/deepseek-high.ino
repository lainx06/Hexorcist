const uint8_t FORWARD_SWITCH = 8;
const uint8_t REVERSE_SWITCH = 9;
const uint8_t FORWARD_BUTTON = 2;
const uint8_t REVERSE_BUTTON = 3;
const uint8_t STOP_BUTTON = 4;

void motorOff() {
  digitalWrite(FORWARD_SWITCH, LOW);
  digitalWrite(REVERSE_SWITCH, LOW);
}

void motorForward() {
  digitalWrite(REVERSE_SWITCH, LOW);
  digitalWrite(FORWARD_SWITCH, HIGH);
}

void motorReverse() {
  digitalWrite(FORWARD_SWITCH, LOW);
  digitalWrite(REVERSE_SWITCH, HIGH);
}

void setup() {
  pinMode(FORWARD_SWITCH, OUTPUT);
  pinMode(REVERSE_SWITCH, OUTPUT);
  motorOff();

  pinMode(FORWARD_BUTTON, INPUT_PULLUP);
  pinMode(REVERSE_BUTTON, INPUT_PULLUP);
  pinMode(STOP_BUTTON, INPUT_PULLUP);
}

void loop() {
  bool forwardPressed = digitalRead(FORWARD_BUTTON) == LOW;
  bool reversePressed = digitalRead(REVERSE_BUTTON) == LOW;
  bool stopPressed = digitalRead(STOP_BUTTON) == LOW;

  if (stopPressed || (forwardPressed && reversePressed)) {
    motorOff();
  } else if (forwardPressed) {
    motorForward();
  } else if (reversePressed) {
    motorReverse();
  } else {
    motorOff();
  }
}