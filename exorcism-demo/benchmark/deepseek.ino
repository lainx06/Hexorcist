const uint8_t STOP_BTN = 2;
const uint8_t MOTOR = 8;
const uint8_t LED = 13;
const unsigned long BLINK_INTERVAL = 200;

bool ledState = false;
unsigned long lastBlink = 0;

void setup() {
pinMode(STOP_BTN, INPUT_PULLUP);
pinMode(MOTOR, OUTPUT);
pinMode(LED, OUTPUT);

digitalWrite(MOTOR, LOW);
digitalWrite(LED, LOW);
}

void loop() {
if (digitalRead(STOP_BTN) == LOW) {
digitalWrite(MOTOR, LOW);
digitalWrite(LED, LOW);
ledState = false;
lastBlink = millis();
} else {
digitalWrite(MOTOR, HIGH);

unsigned long now = millis();
if (now - lastBlink >= BLINK_INTERVAL) {
lastBlink = now;
ledState = !ledState;
digitalWrite(LED, ledState ? HIGH : LOW);
}
}
}