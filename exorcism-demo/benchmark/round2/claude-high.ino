const uint8_t BTN      = 2;
const uint8_t CAR_G    = 8;
const uint8_t CAR_Y    = 9;
const uint8_t CAR_R    = 10;
const uint8_t PED_WALK = 11;
const uint8_t PED_DONT = 12;

const unsigned long YELLOW_MS   = 150;
const unsigned long ALL_RED_MS  = 50;
const unsigned long WALK_MS     = 200;
const unsigned long DEBOUNCE_MS = 20;

enum State { CARS_GREEN, CARS_YELLOW, ALL_RED_1, WALK, ALL_RED_2 };

State state;
unsigned long stateStart;
bool request = false;

void setLights(bool g, bool y, bool r, bool walk) {
  digitalWrite(CAR_G, g);
  digitalWrite(CAR_Y, y);
  digitalWrite(CAR_R, r);
  digitalWrite(PED_WALK, walk);
  digitalWrite(PED_DONT, !walk);
}

void enter(State s) {
  state = s;
  stateStart = millis();
  switch (s) {
    case CARS_GREEN:  setLights(1, 0, 0, 0); break;
    case CARS_YELLOW: setLights(0, 1, 0, 0); break;
    case ALL_RED_1:   setLights(0, 0, 1, 0); break;
    case WALK:        setLights(0, 0, 1, 1); request = false; break;
    case ALL_RED_2:   setLights(0, 0, 1, 0); break;
  }
}

void readButton() {
  static bool lastRead = HIGH;
  static bool stable = HIGH;
  static unsigned long changedAt = 0;

  bool r = digitalRead(BTN);
  if (r != lastRead) {
    lastRead = r;
    changedAt = millis();
  }
  if (millis() - changedAt >= DEBOUNCE_MS && r != stable) {
    stable = r;
    if (stable == LOW) request = true;   // latch the press
  }
}

void setup() {
  pinMode(BTN, INPUT_PULLUP);
  pinMode(CAR_G, OUTPUT);
  pinMode(CAR_Y, OUTPUT);
  pinMode(CAR_R, OUTPUT);
  pinMode(PED_WALK, OUTPUT);
  pinMode(PED_DONT, OUTPUT);
  enter(CARS_GREEN);
}

void loop() {
  readButton();
  unsigned long t = millis() - stateStart;

  switch (state) {
    case CARS_GREEN:  if (request)          enter(CARS_YELLOW); break;
    case CARS_YELLOW: if (t >= YELLOW_MS)   enter(ALL_RED_1);   break;
    case ALL_RED_1:   if (t >= ALL_RED_MS)  enter(WALK);        break;
    case WALK:        if (t >= WALK_MS)     enter(ALL_RED_2);   break;
    case ALL_RED_2:   if (t >= ALL_RED_MS)  enter(CARS_GREEN);  break;
  }
}