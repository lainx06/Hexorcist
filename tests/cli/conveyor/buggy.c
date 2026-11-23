// Conveyor with a STOP button (PD2, pressed = low) and a status LED (PB5). MOTOR on PB0.
// Bug on purpose: STOP is read only once every 200 ms, so a press can wait up to 200 ms.
#include <avr/io.h>
#include <util/delay.h>
int main(void) {
  DDRB |= (1 << PB0) | (1 << PB5);
  PORTD |= (1 << PD2); // pull-up
  for (;;) {
    if (!(PIND & (1 << PD2))) {
      PORTB &= ~(1 << PB0); // STOP pressed: motor off
    } else {
      PORTB |= (1 << PB0);
    }
    PORTB ^= (1 << PB5);
    _delay_ms(200);
  }
}
