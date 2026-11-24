const uint8_t FWD_SW = 8;
const uint8_t REV_SW = 9;
const uint8_t FWD_BTN = 2;
const uint8_t REV_BTN = 3;
const uint8_t STOP_BTN = 4;

void allOff() {
  digitalWrite(FWD_SW, LOW);
  digitalWrite(REV_SW, LOW);
}

void setup() {
  pinMode(FWD_SW, OUTPUT);
  pinMode(REV_SW, OUTPUT);
  allOff();

  pinMode(FWD_BTN, INPUT_PULLUP);
  pinMode(REV_BTN, INPUT_PULLUP);
  pinMode(STOP_BTN, INPUT_PULLUP);
}

void loop() {
  if (digitalRead(STOP_BTN) == LOW) {
    allOff();
  } else if (digitalRead(FWD_BTN) == LOW) {
    digitalWrite(REV_SW, LOW);
    digitalWrite(FWD_SW, HIGH);
  } else if (digitalRead(REV_BTN) == LOW) {
    digitalWrite(FWD_SW, LOW);
    digitalWrite(REV_SW, HIGH);
  }
}