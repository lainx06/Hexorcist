const byte REQUEST_PIN = 2;

const byte CAR_GREEN  = 8;
const byte CAR_YELLOW = 9;
const byte CAR_RED    = 10;
const byte PED_WALK   = 11;
const byte PED_STOP   = 12;

enum State {
  CARS_GREEN,
  CARS_YELLOW,
  ALL_RED_1,
  PED_CROSSING,
  ALL_RED_2
};

State state = CARS_GREEN;
unsigned long stateStart = 0;

bool lastButton = HIGH;
bool requestPending = false;

void setLights(bool green, bool yellow, bool red,
               bool walk, bool stop) {
  digitalWrite(CAR_GREEN, green);
  digitalWrite(CAR_YELLOW, yellow);
  digitalWrite(CAR_RED, red);
  digitalWrite(PED_WALK, walk);
  digitalWrite(PED_STOP, stop);
}

void changeState(State next) {
  state = next;
  stateStart = millis();

  switch (state) {
    case CARS_GREEN:
      setLights(HIGH, LOW, LOW, LOW, HIGH);
      break;

    case CARS_YELLOW:
      setLights(LOW, HIGH, LOW, LOW, HIGH);
      break;

    case ALL_RED_1:
    case ALL_RED_2:
      setLights(LOW, LOW, HIGH, LOW, HIGH);
      break;

    case PED_CROSSING:
      setLights(LOW, LOW, HIGH, HIGH, LOW);
      break;
  }
}

void setup() {
  pinMode(REQUEST_PIN, INPUT_PULLUP);

  pinMode(CAR_GREEN, OUTPUT);
  pinMode(CAR_YELLOW, OUTPUT);
  pinMode(CAR_RED, OUTPUT);
  pinMode(PED_WALK, OUTPUT);
  pinMode(PED_STOP, OUTPUT);

  changeState(CARS_GREEN);
}

void loop() {
  unsigned long now = millis();

  // Detect button press, including during a crossing
  bool button = digitalRead(REQUEST_PIN);

  if (lastButton == HIGH && button == LOW) {
    requestPending = true;
  }

  lastButton = button;

  // Non-blocking state machine
  switch (state) {
    case CARS_GREEN:
      if (requestPending) {
        requestPending = false;
        changeState(CARS_YELLOW);
      }
      break;

    case CARS_YELLOW:
      if (now - stateStart >= 150) {
        changeState(ALL_RED_1);
      }
      break;

    case ALL_RED_1:
      if (now - stateStart >= 50) {
        changeState(PED_CROSSING);
      }
      break;

    case PED_CROSSING:
      if (now - stateStart >= 200) {
        changeState(ALL_RED_2);
      }
      break;

    case ALL_RED_2:
      if (now - stateStart >= 50) {
        changeState(CARS_GREEN);
      }
      break;
  }
}