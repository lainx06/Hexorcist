
const byte REQUEST = 2;
const byte CAR_GREEN = 8;
const byte CAR_YELLOW = 9;
const byte CAR_RED = 10;
const byte WALK = 11;
const byte DONT_WALK = 12;

enum State {
  GREEN,
  YELLOW,
  RED_BEFORE,
  WALKING,
  RED_AFTER
};

State state = GREEN;
unsigned long stateStart = 0;
bool requestPending = false;

// Button debounce
bool lastRaw = HIGH;
bool stableButton = HIGH;
unsigned long lastChange = 0;

void setState(State next) {
  state = next;
  stateStart = millis();

  digitalWrite(CAR_GREEN, state == GREEN);
  digitalWrite(CAR_YELLOW, state == YELLOW);
  digitalWrite(CAR_RED, state == RED_BEFORE ||
                        state == WALKING ||
                        state == RED_AFTER);

  digitalWrite(WALK, state == WALKING);
  digitalWrite(DONT_WALK, state != WALKING);
}

void setup() {
  pinMode(REQUEST, INPUT_PULLUP);

  pinMode(CAR_GREEN, OUTPUT);
  pinMode(CAR_YELLOW, OUTPUT);
  pinMode(CAR_RED, OUTPUT);
  pinMode(WALK, OUTPUT);
  pinMode(DONT_WALK, OUTPUT);

  setState(GREEN);
}

void loop() {
  unsigned long now = millis();

  // Detect button presses at any time
  bool raw = digitalRead(REQUEST);

  if (raw != lastRaw) {
    lastChange = now;
    lastRaw = raw;
  }

  if (now - lastChange >= 20 && raw != stableButton) {
    stableButton = raw;

    if (stableButton == LOW) {
      requestPending = true;
    }
  }

  unsigned long elapsed = now - stateStart;

  switch (state) {
    case GREEN:
      if (requestPending) {
        requestPending = false;
        setState(YELLOW);
      }
      break;

    case YELLOW:
      if (elapsed >= 150) {
        setState(RED_BEFORE);
      }
      break;

    case RED_BEFORE:
      if (elapsed >= 50) {
        setState(WALKING);
      }
      break;

    case WALKING:
      if (elapsed >= 200) {
        setState(RED_AFTER);
      }
      break;

    case RED_AFTER:
      if (elapsed >= 50) {
        setState(GREEN);
      }
      break;
  }
}
