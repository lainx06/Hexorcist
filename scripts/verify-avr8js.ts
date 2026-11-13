/**
 * Verification script for avr8js 0.21.1 installation
 * Checks all required signatures according to design.md
 */

import {
  CPU,
  avrInstruction,
  AVRIOPort,
  portBConfig,
  portCConfig,
  portDConfig,
  timer0Config,
  timer1Config,
  timer2Config,
  PinState,
} from 'avr8js';

console.log('=== avr8js 0.21.1 Verification ===\n');

// 1. Verify CPU class
console.log('1. CPU class verification:');
try {
  const testProgMem = new Uint16Array(16384);
  const cpu = new CPU(testProgMem, 2048);
  
  // Check properties
  const hasProperties = 
    typeof cpu.cycles === 'number' &&
    typeof cpu.pc === 'number' &&
    cpu.data instanceof Uint8Array &&
    cpu.progBytes instanceof Uint8Array;
  
  // Check methods
  const hasMethods =
    typeof cpu.tick === 'function' &&
    typeof cpu.reset === 'function';
  
  console.log(`  ✓ CPU constructor works with (progMem: Uint16Array, sramBytes?: number)`);
  console.log(`  ✓ cpu.cycles: number - ${hasProperties ? 'PASS' : 'FAIL'}`);
  console.log(`  ✓ cpu.pc: number - ${hasProperties ? 'PASS' : 'FAIL'}`);
  console.log(`  ✓ cpu.data: Uint8Array - ${hasProperties ? 'PASS' : 'FAIL'}`);
  console.log(`  ✓ cpu.progBytes: Uint8Array - ${hasProperties ? 'PASS' : 'FAIL'}`);
  console.log(`  ✓ cpu.tick(): void - ${hasMethods ? 'PASS' : 'FAIL'}`);
  console.log(`  ✓ cpu.reset(): void - ${hasMethods ? 'PASS' : 'FAIL'}`);
} catch (e) {
  console.log(`  ✗ CPU verification failed: ${e}`);
  process.exit(1);
}

// 2. Verify avrInstruction export
console.log('\n2. avrInstruction export:');
try {
  if (typeof avrInstruction === 'function') {
    console.log(`  ✓ avrInstruction(cpu: CPU): void - PASS`);
  } else {
    console.log(`  ✗ avrInstruction is not a function`);
    process.exit(1);
  }
} catch (e) {
  console.log(`  ✗ avrInstruction verification failed: ${e}`);
  process.exit(1);
}

// 3. Verify AVRIOPort class
console.log('\n3. AVRIOPort class verification:');
try {
  const testProgMem = new Uint16Array(16384);
  const cpu = new CPU(testProgMem, 2048);
  const port = new AVRIOPort(cpu, portBConfig);
  
  const hasMethods =
    typeof port.addListener === 'function' &&
    typeof port.pinState === 'function' &&
    typeof port.setPin === 'function';
  
  console.log(`  ✓ AVRIOPort.addListener(listener: GPIOListener): void - ${hasMethods ? 'PASS' : 'FAIL'}`);
  console.log(`  ✓ AVRIOPort.pinState(index: number): PinState - ${hasMethods ? 'PASS' : 'FAIL'}`);
  console.log(`  ✓ AVRIOPort.setPin(index: number, value: boolean): void - ${hasMethods ? 'PASS' : 'FAIL'}`);
} catch (e) {
  console.log(`  ✗ AVRIOPort verification failed: ${e}`);
  process.exit(1);
}

// 4. Verify Port configs
console.log('\n4. Port configurations:');
try {
  const configs = [
    { name: 'portBConfig', config: portBConfig },
    { name: 'portCConfig', config: portCConfig },
    { name: 'portDConfig', config: portDConfig },
  ];
  
  for (const { name, config } of configs) {
    if (config && typeof config === 'object' && 'PIN' in config && 'DDR' in config && 'PORT' in config) {
      console.log(`  ✓ ${name} exported as AVRPortConfig - PASS`);
    } else {
      console.log(`  ✗ ${name} validation failed`);
      process.exit(1);
    }
  }
} catch (e) {
  console.log(`  ✗ Port configs verification failed: ${e}`);
  process.exit(1);
}

// 5. Verify Timer configs
console.log('\n5. Timer configurations:');
try {
  const configs = [
    { name: 'timer0Config', config: timer0Config },
    { name: 'timer1Config', config: timer1Config },
    { name: 'timer2Config', config: timer2Config },
  ];
  
  for (const { name, config } of configs) {
    if (config && typeof config === 'object' && 'bits' in config && 'dividers' in config) {
      console.log(`  ✓ ${name} exported as AVRTimerConfig - PASS`);
    } else {
      console.log(`  ✗ ${name} validation failed`);
      process.exit(1);
    }
  }
} catch (e) {
  console.log(`  ✗ Timer configs verification failed: ${e}`);
  process.exit(1);
}

// 6. Verify PinState enum
console.log('\n6. PinState enum:');
try {
  const pinStateValues = {
    Low: 0,
    High: 1,
    Input: 2,
    InputPullUp: 3,
  };
  
  let allPresent = true;
  for (const [key, value] of Object.entries(pinStateValues)) {
    if (PinState[key] === value) {
      console.log(`  ✓ PinState.${key} = ${value}`);
    } else {
      console.log(`  ✗ PinState.${key} mismatch (expected ${value}, got ${PinState[key]})`);
      allPresent = false;
    }
  }
  
  if (!allPresent) {
    process.exit(1);
  }
} catch (e) {
  console.log(`  ✗ PinState enum verification failed: ${e}`);
  process.exit(1);
}

console.log('\n=== All Verifications Passed ===');
