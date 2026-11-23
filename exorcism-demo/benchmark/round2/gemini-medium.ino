const uint8_t PIN_BTN       = 2;
const uint8_t PIN_CAR_GRN   = 8;
const uint8_t PIN_CAR_YEL   = 9;
const uint8_t PIN_CAR_RED   = 10;
const uint8_t PIN_PED_WALK  = 11;
const uint8_t PIN_PED_DONT  = 12;

enum State {
  CAR_GREEN,
  CAR_YELLOW,
  ALL_RED_1,
  PED_WALK,
  ALL_RED_2
};

State state = CAR_GREEN;
unsigned long stateStart = 0;
bool requestPending = false;
bool lastBtnState = HIGH;

void setLights(bool carG, bool carY, bool carR, bool pedW, bool pedD) {
  digitalWrite(PIN_CAR_GRN,  carG);
  digitalWrite(PIN_CAR_YEL,  carY);
  digitalWrite(PIN_CAR_RED,  carR);
  digitalWrite(PIN_PED_WALK, pedW);
  digitalWrite(PIN_PED_DONT, pedD);
}

void setup() {
  pinMode(PIN_BTN,      INPUT_PULLUP);
  pinMode(PIN_CAR_GRN,  OUTPUT);
  pinMode(PIN_CAR_YEL,  OUTPUT);
  pinMode(PIN_CAR_RED,  OUTPUT);
  pinMode(PIN_PED_WALK, OUTPUT);
  pinMode(PIN_PED_DONT, OUTPUT);

  setLights(HIGH, LOW, LOW, LOW, HIGH);
}

void loop() {
  unsigned long now = millis();

  bool btnState = digitalRead(PIN_BTN);
  if (lastBtnState == HIGH && btnState == LOW) {
    requestPending = true;
  }
  lastBtnState = btnState;

  switch (state) {
    case CAR_GREEN:
      if (requestPending) {
        requestPending = false;
        state = CAR_YELLOW;
        stateStart = now;
        setLights(LOW, HIGH, LOW, LOW, HIGH);
      }
      break;

    case CAR_YELLOW:
      if (now - stateStart >= 150) {
        state = ALL_RED_1;
        stateStart = now;
        setLights(LOW, LOW, HIGH, LOW, HIGH);
      }
      break;

    case ALL_RED_1:
      if (now - stateStart >= 50) {
        state = PED_WALK;
        stateStart = now;
        setLights(LOW, LOW, HIGH, HIGH, LOW);
      }
      break;

    case PED_WALK:
      if (now - stateStart >= 200) {
        state = ALL_RED_2;
        stateStart = now;
        setLights(LOW, LOW, HIGH, LOW, HIGH);
      }
      break;

    case ALL_RED_2:
      if (now - stateStart >= 50) {
        state = CAR_GREEN;
        stateStart = now;
        setLights(HIGH, LOW, LOW, LOW, HIGH);
      }
      break;
  }
}