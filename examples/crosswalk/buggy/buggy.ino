// crosswalk, buggy build
// A pedestrian crossing on an ATmega328P at 16 MHz.
// Pin map:
//   REQUEST    PD2  input, INPUT_PULLUP, button to ground (active low)
//   CAR_GREEN  PB0  output
//   CAR_YELLOW PB1  output
//   CAR_RED    PB2  output
//   WALK       PB3  output
//   DONT_WALK  PB4  output
//
// Behavior:
//   - Cars see green until REQUEST is pressed.
//   - A press gives the cars yellow, then red. WALK shows inside the red phase.
//   - After a crossing, cars keep green for at least MIN_GREEN_MS.
//   - Every light change turns lights off before it turns one on.
//
// Implementation: millis()-based, no blocking waits.

const uint8_t REQUEST_PIN = 2;     // PD2
const uint8_t CAR_GREEN_PIN = 8;   // PB0
const uint8_t CAR_YELLOW_PIN = 9;  // PB1
const uint8_t CAR_RED_PIN = 10;    // PB2
const uint8_t WALK_PIN = 11;       // PB3
const uint8_t DONT_WALK_PIN = 12;  // PB4
const uint8_t NO_PIN = 255;        // no light on yet

const unsigned long YELLOW_MS = 150;     // cars: yellow
const unsigned long CLEAR_MS = 50;       // all red before and after WALK
const unsigned long WALK_MS = 200;       // pedestrians: WALK
const unsigned long MIN_GREEN_MS = 100;  // cars: least green time between crossings

bool crossing = false;
unsigned long crossStart = 0;  // car timeline of the crossing
unsigned long walkStart = 0;   // walk timeline of the crossing
unsigned long greenSince = 0;
bool lastRequest = HIGH;
uint8_t carLight = NO_PIN;
uint8_t walkLight = NO_PIN;

// Off before on: every car light goes LOW, then one goes HIGH.
void showCars(uint8_t pin) {
  if (pin == carLight) return;
  digitalWrite(CAR_GREEN_PIN, LOW);
  digitalWrite(CAR_YELLOW_PIN, LOW);
  digitalWrite(CAR_RED_PIN, LOW);
  digitalWrite(pin, HIGH);
  carLight = pin;
}

// Off before on: both walk lights go LOW, then one goes HIGH.
void showWalk(uint8_t pin) {
  if (pin == walkLight) return;
  digitalWrite(WALK_PIN, LOW);
  digitalWrite(DONT_WALK_PIN, LOW);
  digitalWrite(pin, HIGH);
  walkLight = pin;
}

void setup() {
  pinMode(REQUEST_PIN, INPUT_PULLUP);
  pinMode(CAR_GREEN_PIN, OUTPUT);
  pinMode(CAR_YELLOW_PIN, OUTPUT);
  pinMode(CAR_RED_PIN, OUTPUT);
  pinMode(WALK_PIN, OUTPUT);
  pinMode(DONT_WALK_PIN, OUTPUT);
  showWalk(DONT_WALK_PIN);
  showCars(CAR_GREEN_PIN);
  greenSince = millis();
}

void loop() {
  unsigned long now = millis();
  bool request = digitalRead(REQUEST_PIN);
  bool pressed = (request == LOW && lastRequest == HIGH);
  lastRequest = request;

  if (pressed && !crossing && now - greenSince >= MIN_GREEN_MS) {
    crossing = true;
    crossStart = now;
    walkStart = now;
  } else if (pressed && crossing) {
    walkStart = now;  // a new press restarts the walk countdown
  }

  if (!crossing) return;

  unsigned long t = now - crossStart;
  unsigned long w = now - walkStart;

  if (t < YELLOW_MS) {
    showCars(CAR_YELLOW_PIN);
  } else if (t < YELLOW_MS + CLEAR_MS + WALK_MS + CLEAR_MS) {
    showCars(CAR_RED_PIN);
  } else {
    showCars(CAR_GREEN_PIN);
    greenSince = now;
    crossing = false;
    return;
  }

  if (w >= YELLOW_MS + CLEAR_MS && w < YELLOW_MS + CLEAR_MS + WALK_MS) {
    showWalk(WALK_PIN);
  } else {
    showWalk(DONT_WALK_PIN);
  }
}
