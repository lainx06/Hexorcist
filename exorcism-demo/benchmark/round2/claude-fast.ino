// Pedestrian crossing controller for ATmega328P (Uno-compatible)
// Non-blocking: uses millis() and a state machine, so the button is always responsive.

const uint8_t BTN_PIN     = 2;   // REQUEST button, other side to GND
const uint8_t CAR_GREEN   = 8;
const uint8_t CAR_YELLOW  = 9;
const uint8_t CAR_RED     = 10;
const uint8_t PED_WALK    = 11;
const uint8_t PED_DONT    = 12;

// Phase durations in ms
const unsigned long YELLOW_MS   = 150;
const unsigned long ALLRED1_MS  = 50;
const unsigned long WALK_MS     = 200;
const unsigned long ALLRED2_MS  = 50;
const unsigned long DEBOUNCE_MS = 20;

enum State { CARS_GREEN, CARS_YELLOW, ALL_RED_1, PED_WALK_S, ALL_RED_2 };
State state = CARS_GREEN;
unsigned long stateStart = 0;

void setLights(bool cg, bool cy, bool cr, bool pw, bool pd) {
  digitalWrite(CAR_GREEN,  cg);
  digitalWrite(CAR_YELLOW, cy);
  digitalWrite(CAR_RED,    cr);
  digitalWrite(PED_WALK,   pw);
  digitalWrite(PED_DONT,   pd);
}

void applyState(State s) {
  switch (s) {
    case CARS_GREEN:  setLights(1, 0, 0, 0, 1); break;
    case CARS_YELLOW: setLights(0, 1, 0, 0, 1); break;
    case ALL_RED_1:   setLights(0, 0, 1, 0, 1); break;
    case PED_WALK_S:  setLights(0, 0, 1, 1, 0); break;
    case ALL_RED_2:   setLights(0, 0, 1, 0, 1); break;
  }
}

void changeState(State s, unsigned long now) {
  state = s;
  stateStart = now;
  applyState(s);
}

void setup() {
  pinMode(BTN_PIN, INPUT_PULLUP);
  pinMode(CAR_GREEN, OUTPUT);
  pinMode(CAR_YELLOW, OUTPUT);
  pinMode(CAR_RED, OUTPUT);
  pinMode(PED_WALK, OUTPUT);
  pinMode(PED_DONT, OUTPUT);
  changeState(CARS_GREEN, millis());
}

void loop() {
  unsigned long now = millis();

  // --- Button read with simple debounce (active LOW) ---
  static bool lastReading = HIGH;
  static bool stableLevel = HIGH;
  static unsigned long lastChange = 0;

  bool reading = digitalRead(BTN_PIN);
  if (reading != lastReading) {
    lastReading = reading;
    lastChange = now;
  }
  if ((now - lastChange) >= DEBOUNCE_MS && reading != stableLevel) {
    stableLevel = reading;
    // Falling edge = press. Only starts a crossing when cars have green.
    // Presses during a crossing are ignored, so the cycle always completes safely.
    if (stableLevel == LOW && state == CARS_GREEN) {
      changeState(CARS_YELLOW, now);
    }
  }

  // --- Timed phase advance (no delay()) ---
  unsigned long elapsed = now - stateStart;  // unsigned math handles millis() rollover
  switch (state) {
    case CARS_YELLOW:
      if (elapsed >= YELLOW_MS)  changeState(ALL_RED_1, now);
      break;
    case ALL_RED_1:
      if (elapsed >= ALLRED1_MS) changeState(PED_WALK_S, now);
      break;
    case PED_WALK_S:
      if (elapsed >= WALK_MS)    changeState(ALL_RED_2, now);
      break;
    case ALL_RED_2:
      if (elapsed >= ALLRED2_MS) changeState(CARS_GREEN, now);
      break;
    case CARS_GREEN:
      break;  // waiting for REQUEST
  }
}