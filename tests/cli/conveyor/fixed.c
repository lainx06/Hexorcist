// Same conveyor, fixed: STOP is read every 1 ms; the LED still blinks every 200 ms.
#include <avr/io.h>
#include <util/delay.h>
int main(void) {
  DDRB |= (1 << PB0) | (1 << PB5);
  PORTD |= (1 << PD2); // pull-up
  unsigned int ticks = 0;
  for (;;) {
    if (!(PIND & (1 << PD2))) {
      PORTB &= ~(1 << PB0);
    } else {
      PORTB |= (1 << PB0);
    }
    if (++ticks >= 200) {
      ticks = 0;
      PORTB ^= (1 << PB5);
    }
    _delay_ms(1);
  }
}
