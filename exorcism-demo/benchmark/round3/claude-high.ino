// DC motor direction control - ATmega328P (Uno-compatible)
// Outputs: pin 8 = FORWARD switch, pin 9 = REVERSE switch (HIGH = on)
// Buttons (to GND, internal pull-ups): pin 2 = FORWARD, pin 3 = REVERSE, pin 4 = STOP
//
// Shoot-through protection:
//  - Outputs are driven LOW before they are made outputs, so neither can glitch on at reset.
//  - Every state change turns BOTH switches off first.
//  - When reversing directly, a dead-time delay lets the old transistor fully
//    turn off before the other one is switched on.
//  - Only one switch is ever written HIGH, and only after both have been written LOW.

const byte FWD_OUT  = 8;
const byte REV_OUT  = 9;
const byte FWD_BTN  = 2;
const byte REV_BTN  = 3;
const byte STOP_BTN = 4;

const unsigned long DEAD_TIME_MS = 100;  // pause between directions; increase if your switches are slow

enum MotorState { STOPPED, FORWARD, REVERSE };
MotorState state = STOPPED;

void allOff() {
  digitalWrite(FWD_OUT, LOW);
  digitalWrite(REV_OUT, LOW);
}

void setState(MotorState newState) {
  if (newState == state) return;

  allOff();                          // always break before make

  if (state != STOPPED && newState != STOPPED) {
    delay(DEAD_TIME_MS);             // direct reversal: wait for the old switch to turn off
  }

  if (newState == FORWARD) {
    digitalWrite(FWD_OUT, HIGH);
  } else if (newState == REVERSE) {
    digitalWrite(REV_OUT, HIGH);
  }

  state = newState;
}

void setup() {
  // Set output levels LOW before enabling the outputs
  digitalWrite(FWD_OUT, LOW);
  digitalWrite(REV_OUT, LOW);
  pinMode(FWD_OUT, OUTPUT);
  pinMode(REV_OUT, OUTPUT);

  pinMode(FWD_BTN, INPUT_PULLUP);
  pinMode(REV_BTN, INPUT_PULLUP);
  pinMode(STOP_BTN, INPUT_PULLUP);
}

void loop() {
  bool fwdPressed  = digitalRead(FWD_BTN)  == LOW;
  bool revPressed  = digitalRead(REV_BTN)  == LOW;
  bool stopPressed = digitalRead(STOP_BTN) == LOW;

  if (stopPressed || (fwdPressed && revPressed)) {
    setState(STOPPED);               // STOP wins; pressing both directions also stops
  } else if (fwdPressed) {
    setState(FORWARD);
  } else if (revPressed) {
    setState(REVERSE);
  }
  // No button pressed: keep the current state
}