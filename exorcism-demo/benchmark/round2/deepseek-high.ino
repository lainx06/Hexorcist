// Pedestrian crossing for ATmega328P (Uno-compatible)
// REQUEST button: pin 2 -> GND (internal pull-up, active LOW)
// Car lights:      green 8, yellow 9, red 10
// Pedestrian:      WALK 11, DON'T WALK 12

const uint8_t PIN_REQUEST = 2;
const uint8_t PIN_CAR_G   = 8;
const uint8_t PIN_CAR_Y   = 9;
const uint8_t PIN_CAR_R   = 10;
const uint8_t PIN_WALK    = 11;
const uint8_t PIN_DONT    = 12;

enum State { S_GREEN, S_YELLOW, S_RED1, S_WALK, S_RED2 };
State state = S_GREEN;
uint32_t stateStart = 0;

bool requestPending = false;
bool lastButton = HIGH;

void setCars(bool g, bool y, bool r) {
  digitalWrite(PIN_CAR_G, g);
  digitalWrite(PIN_CAR_Y, y);
  digitalWrite(PIN_CAR_R, r);
}

void setPed(bool walk) {
  digitalWrite(PIN_WALK, walk);
  digitalWrite(PIN_DONT, !walk);
}

void enter(State s, uint32_t now) {
  state = s;
  stateStart = now;

  switch (s) {
    case S_GREEN:  setCars(HIGH, LOW, LOW);  setPed(false); break;
    case S_YELLOW: setCars(LOW, HIGH, LOW);  setPed(false); break;
    case S_RED1:   setCars(LOW, LOW, HIGH);  setPed(false); break;
    case S_WALK:   setCars(LOW, LOW, HIGH);  setPed(true);  break;
    case S_RED2:   setCars(LOW, LOW, HIGH);  setPed(false); break;
  }
}

void setup() {
  pinMode(PIN_REQUEST, INPUT_PULLUP);

  pinMode(PIN_CAR_G, OUTPUT);
  pinMode(PIN_CAR_Y, OUTPUT);
  pinMode(PIN_CAR_R, OUTPUT);
  pinMode(PIN_WALK, OUTPUT);
  pinMode(PIN_DONT, OUTPUT);

  enter(S_GREEN, millis());
}

void loop() {
  uint32_t now = millis();

  // Falling-edge detect: latch a request whenever the button is pressed,
  // even if it happens during an active crossing sequence.
  bool button = digitalRead(PIN_REQUEST);
  if (lastButton == HIGH && button == LOW) {
    requestPending = true;
  }
  lastButton = button;

  switch (state) {
    case S_GREEN:
      if (requestPending) {
        requestPending = false;
        enter(S_YELLOW, now);
      }
      break;

    case S_YELLOW:
      if (now - stateStart >= 150) enter(S_RED1, now);
      break;

    case S_RED1:
      if (now - stateStart >= 50) enter(S_WALK, now);
      break;

    case S_WALK:
      if (now - stateStart >= 200) enter(S_RED2, now);
      break;

    case S_RED2:
      if (now - stateStart >= 50) enter(S_GREEN, now);
      break;
  }
}