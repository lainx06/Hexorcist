// garage, buggy build
// A garage door opener on an ATmega328P at 16 MHz.
// Pin map:
//   CLOSE       PD2  input, INPUT_PULLUP, button to ground (active low)
//   BEAM_CLEAR  PD3  input, INPUT_PULLUP, reads HIGH when the beam is clear, LOW when blocked
//   MOTOR_CLOSE PB0  output
//   MOTOR_OPEN  PB1  output
//   LAMP        PB2  output, on while a motor runs
//
// Behavior:
//   - The door starts open. It closes when CLOSE is pressed or after AUTO_CLOSE_MS
//     open, both only with the beam clear. Once closed, it stays closed.
//   - Closing runs MOTOR_CLOSE for CLOSE_MS.
//   - A break of the beam while closing is confirmed DEBOUNCE_MS later; then the
//     door reverses (MOTOR_OPEN for OPEN_MS) and is open again.
//   - Every motor change turns both motors off before it turns one on.
//
// Implementation: millis()-based, no blocking waits.

const uint8_t CLOSE_PIN = 2;        // PD2
const uint8_t BEAM_PIN = 3;         // PD3
const uint8_t MOTOR_CLOSE_PIN = 8;  // PB0
const uint8_t MOTOR_OPEN_PIN = 9;   // PB1
const uint8_t LAMP_PIN = 10;        // PB2
const uint8_t NO_PIN = 255;         // both motors off

const unsigned long CLOSE_MS = 300;       // door travel, closing
const unsigned long OPEN_MS = 200;        // door travel, reversing
const unsigned long AUTO_CLOSE_MS = 300;  // door stays open this long, then closes
const unsigned long DEBOUNCE_MS = 10;     // a beam break is confirmed after this long

enum Phase { DOOR_OPEN, DOOR_CLOSING, DOOR_OPENING, DOOR_CLOSED };
Phase phase = DOOR_OPEN;
unsigned long phaseStart = 0;
bool closeWas = false;
bool wasBlocked = false;
unsigned int breaks = 0;     // beam breaks seen in this close
unsigned long breakAt = 0;   // time of the earliest break in this close

// Off before on: both motors go LOW, then one goes HIGH.
void runMotor(uint8_t pin) {
  digitalWrite(MOTOR_CLOSE_PIN, LOW);
  digitalWrite(MOTOR_OPEN_PIN, LOW);
  if (pin != NO_PIN) digitalWrite(pin, HIGH);
  digitalWrite(LAMP_PIN, pin != NO_PIN ? HIGH : LOW);
}

void enter(Phase next, unsigned long now) {
  phase = next;
  phaseStart = now;
  if (next == DOOR_CLOSING) {
    breaks = 0;
    runMotor(MOTOR_CLOSE_PIN);
  } else if (next == DOOR_OPENING) {
    runMotor(MOTOR_OPEN_PIN);
  } else {
    runMotor(NO_PIN);
  }
}

void setup() {
  pinMode(CLOSE_PIN, INPUT_PULLUP);
  pinMode(BEAM_PIN, INPUT_PULLUP);
  pinMode(MOTOR_CLOSE_PIN, OUTPUT);
  pinMode(MOTOR_OPEN_PIN, OUTPUT);
  pinMode(LAMP_PIN, OUTPUT);
  enter(DOOR_OPEN, millis());
}

void loop() {
  unsigned long now = millis();
  bool closeNow = (digitalRead(CLOSE_PIN) == LOW);
  bool closePressed = closeNow && !closeWas;
  closeWas = closeNow;
  bool blocked = (digitalRead(BEAM_PIN) == LOW);
  bool newBreak = blocked && !wasBlocked;
  wasBlocked = blocked;

  if (phase == DOOR_CLOSING) {
    if (newBreak) {
      if (breaks == 0) breakAt = now;
      breaks++;
    }
    if (now - phaseStart >= CLOSE_MS) {
      enter(DOOR_CLOSED, now);
    } else if (breaks > 0 && now - breakAt >= DEBOUNCE_MS) {
      if (breaks == 1) enter(DOOR_OPENING, now);  // several quick breaks look like noise
    }
    return;
  }

  if (closePressed && !blocked && phase != DOOR_CLOSED) {
    enter(DOOR_CLOSING, now);
  } else if (phase == DOOR_OPENING && now - phaseStart >= OPEN_MS) {
    enter(DOOR_OPEN, now);
  } else if (phase == DOOR_OPEN && !blocked && now - phaseStart >= AUTO_CLOSE_MS) {
    enter(DOOR_CLOSING, now);
  }
}
