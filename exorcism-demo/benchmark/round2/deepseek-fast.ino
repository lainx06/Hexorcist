const uint8_t REQUEST_PIN = 2;
const uint8_t CAR_GREEN = 8;
const uint8_t CAR_YELLOW = 9;
const uint8_t CAR_RED = 10;
const uint8_t WALK = 11;
const uint8_t DONT_WALK = 12;

enum State {
  CARS_GREEN,
  CARS_YELLOW,
  ALL_RED_1,
  PED_WALK,
  ALL_RED_2
};

State state = CARS_GREEN;
unsigned long stateStart = 0;
bool requestPending = false;

void setOutputs() {
  digitalWrite(CAR_GREEN, state == CARS_GREEN ? HIGH : LOW);
  digitalWrite(CAR_YELLOW, state == CARS_YELLOW ? HIGH : LOW);
  digitalWrite(CAR_RED, (state == ALL_RED_1 || state == ALL_RED_2) ? HIGH : LOW);
  digitalWrite(WALK, state == PED_WALK ? HIGH : LOW);
  digitalWrite(DONT_WALK, state == PED_WALK ? LOW : HIGH);
}

void enterState(State s) {
  state = s;
  stateStart = millis();
  setOutputs();
}

void setup() {
  pinMode(REQUEST_PIN, INPUT_PULLUP);
  pinMode(CAR_GREEN, OUTPUT);
  pinMode(CAR_YELLOW, OUTPUT);
  pinMode(CAR_RED, OUTPUT);
  pinMode(WALK, OUTPUT);
  pinMode(DONT_WALK, OUTPUT);
  enterState(CARS_GREEN);
}

void loop() {
  if (digitalRead(REQUEST_PIN) == LOW) {
    requestPending = true;
  }

  unsigned long elapsed = millis() - stateStart;

  switch (state) {
    case CARS_GREEN:
      if (requestPending) {
        requestPending = false;
        enterState(CARS_YELLOW);
      }
      break;

    case CARS_YELLOW:
      if (elapsed >= 150) enterState(ALL_RED_1);
      break;

    case ALL_RED_1:
      if (elapsed >= 50) enterState(PED_WALK);
      break;

    case PED_WALK:
      if (elapsed >= 200) enterState(ALL_RED_2);
      break;

    case ALL_RED_2:
      if (elapsed >= 50) enterState(CARS_GREEN);
      break;
  }
}