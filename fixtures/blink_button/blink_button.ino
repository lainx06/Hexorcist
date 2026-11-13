// blink_button.ino
// GPIO setup:
//   D2 (PD2) = INPUT_PULLUP (external button, active-low)
//   D13 (PB5) = OUTPUT (LED)
//
// Behavior:
//   - When button is held (D2 reads LOW): LED toggles every 100 ms
//   - When button is released (D2 reads HIGH): LED toggles every 500 ms
//   - At startup: LED is OFF (D13 drives LOW initially)
//
// Implementation: Uses millis()-based non-blocking timing

const int BUTTON_PIN = 2;  // D2, PD2
const int LED_PIN = 13;    // D13, PB5

const unsigned long HELD_INTERVAL = 100;   // ms, when button is held
const unsigned long RELEASED_INTERVAL = 500; // ms, when button is released

unsigned long lastToggle = 0;
bool ledState = LOW;  // LED starts OFF

void setup() {
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, ledState);  // Ensure LED is OFF at startup
  lastToggle = millis();
}

void loop() {
  unsigned long now = millis();
  
  // Determine button state
  bool buttonPressed = (digitalRead(BUTTON_PIN) == LOW);
  
  // Select interval based on button state
  unsigned long interval = buttonPressed ? HELD_INTERVAL : RELEASED_INTERVAL;
  
  // Check if it's time to toggle
  if ((now - lastToggle) >= interval) {
    ledState = !ledState;
    digitalWrite(LED_PIN, ledState);
    lastToggle = now;
  }
}
