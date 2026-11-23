const uint8_t BUTTON_PIN = 2;
const uint8_t CAR_GREEN  = 8;
const uint8_t CAR_YELLOW = 9;
const uint8_t CAR_RED    = 10;
const uint8_t PED_WALK   = 11;
const uint8_t PED_DONT   = 12;

enum State {
  IDLE_GREEN,
  CAR_YELLOW_STATE,
  ALL_RED_1,
  PED_WALK_STATE,
  ALL_RED_2
};

State currentState = IDLE_GREEN;
unsigned long stateStartTime = 0;
bool requestPending = false;

void setLights(bool cg, bool cy, bool cr, bool pw, bool pd) {
  digitalWrite(CAR_GREEN, cg);
  digitalWrite(CAR_YELLOW, cy);
  digitalWrite(CAR_RED, cr);
  digitalWrite(PED_WALK, pw);
  digitalWrite(PED_DONT, pd);
}

void setup() {
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(CAR_GREEN, OUTPUT);
  pinMode(CAR_YELLOW, OUTPUT);
  pinMode(CAR_RED, OUTPUT);
  pinMode(PED_WALK, OUTPUT);
  pinMode(PED_DONT, OUTPUT);

  setLights(HIGH, LOW, LOW, LOW, HIGH);
}

void loop() {
  unsigned long now = millis();

  if (digitalRead(BUTTON_PIN) == LOW) {
    requestPending = true;
  }

  switch (currentState) {
    case IDLE_GREEN:
      if (requestPending) {
        requestPending = false;
        currentState = CAR_YELLOW_STATE;
        stateStartTime = now;
        setLights(LOW, HIGH, LOW, LOW, HIGH);
      }
      break;

    case CAR_YELLOW_STATE:
      if (now - stateStartTime >= 150) {
        currentState = ALL_RED_1;
        stateStartTime = now;
        setLights(LOW, LOW, HIGH, LOW, HIGH);
      }
      break;

    case ALL_RED_1:
      if (now - stateStartTime >= 50) {
        currentState = PED_WALK_STATE;
        stateStartTime = now;
        setLights(LOW, LOW, HIGH, HIGH, LOW);
      }
      break;

    case PED_WALK_STATE:
      if (now - stateStartTime >= 200) {
        currentState = ALL_RED_2;
        stateStartTime = now;
        setLights(LOW, LOW, HIGH, LOW, HIGH);
      }
      break;

    case ALL_RED_2:
      if (now - stateStartTime >= 50) {
        currentState = IDLE_GREEN;
        setLights(HIGH, LOW, LOW, LOW, HIGH);
      }
      break;
  }
}