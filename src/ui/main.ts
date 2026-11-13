/**
 * Hexorcist UI — minimal interface for EmulatorBridge + ATmega328P blink_button firmware
 * 
 * This module does NOT import avr8js.
 * It communicates with the emulated chip ONLY through EmulatorBridge.
 */

import { EmulatorBridge, isBridgeError } from '../engine/emulator-bridge.js';
import type { Fixture, OutputEvent } from '../engine/types.js';
import hexData from '../../fixtures/blink_button/build/blink_button.ino.hex?raw';
import './style.css';

// ── Fixture ─────────────────────────────────────────────────────────────────

const FIXTURE: Fixture = {
  pins: [
    { signal: 'BUTTON', port: 'D', bit: 2, direction: 'input' },
    { signal: 'LED',    port: 'B', bit: 5, direction: 'output' },
  ],
};

const CLOCK_HZ = 16_000_000;
const FRAME_CYCLES = Math.floor(CLOCK_HZ / 60); // ~266667 cycles per 60fps frame

// ── State ───────────────────────────────────────────────────────────────────

let bridge: ReturnType<typeof EmulatorBridge.create> | null = null;
let isRunning = false;
let animationFrameId: number | null = null;
let eventLog: OutputEvent[] = [];

// ── DOM References (initialized after setupUI) ──────────────────────────────

let runPauseBtn: HTMLButtonElement;
let ledCircle: SVGCircleElement;
let timeDisplay: HTMLElement;
let eventTable: HTMLElement;

// ── Helper: Get element or throw ────────────────────────────────────────────

function getElement<T extends Element>(id: string): T {
  const elem = document.getElementById(id);
  if (!elem) {
    throw new Error(`Missing required DOM element with id: "${id}"`);
  }
  return elem as unknown as T;
}

// ── Initialize ──────────────────────────────────────────────────────────────

function initBridge() {
  // Create bridge with BUTTON scheduled to 1 at cycle 0 (SPIKE workaround: simulate released state)
  bridge = EmulatorBridge.create(hexData, FIXTURE, [
    { signal: 'BUTTON', value: 1, cycle: 0 },
  ]);

  if (isBridgeError(bridge)) {
    alert(`Failed to create bridge: ${bridge.message}`);
    return false;
  }

  // Prime the event log with initial state
  eventLog = [];
  const result = bridge.advance(0);
  if (!isBridgeError(result)) {
    eventLog.push(...result.outputEvents);
  }

  updateDisplay();
  return true;
}

// ── Frame Loop ──────────────────────────────────────────────────────────────

function tick() {
  if (!isRunning || bridge === null || isBridgeError(bridge)) return;

  const result = bridge.advance(FRAME_CYCLES);
  if (isBridgeError(result)) {
    alert(`Emulation error: ${result.message}`);
    stopSimulation();
    return;
  }

  eventLog.push(...result.outputEvents);
  // Keep only last 10 events
  if (eventLog.length > 10) {
    eventLog = eventLog.slice(-10);
  }

  updateDisplay();

  if (isRunning) {
    animationFrameId = requestAnimationFrame(tick);
  }
}

// ── Display ─────────────────────────────────────────────────────────────────

function updateDisplay() {
  if (bridge === null || isBridgeError(bridge)) return;

  // Update simulated time
  const simTime = bridge.cycleCount / CLOCK_HZ;
  timeDisplay.textContent = `${simTime.toFixed(3)}s`;

  // Update LED based on most recent LED event
  const ledEvent = [...eventLog].reverse().find(e => e.signal === 'LED');
  if (ledEvent) {
    updateLedDisplay(ledEvent.value);
  }

  // Update event log
  updateEventLog();
}

function updateLedDisplay(value: 0 | 1 | 'input') {
  if (value === 1) {
    // Bright red
    ledCircle.setAttribute('fill', '#ff3333');
  } else if (value === 0) {
    // Dark gray
    ledCircle.setAttribute('fill', '#333333');
  } else {
    // Dim blue (high-Z)
    ledCircle.setAttribute('fill', '#0066cc');
  }
}

function updateEventLog() {
  const rows = eventLog.map(e => {
    const simTime = (e.cycle / CLOCK_HZ).toFixed(3);
    const valueStr = e.value === 'input' ? 'input' : String(e.value);
    return `
      <tr>
        <td>${e.signal}</td>
        <td>${valueStr}</td>
        <td>${e.cycle}</td>
        <td>${simTime}s</td>
      </tr>
    `;
  }).join('');

  eventTable.innerHTML = rows;
}

// ── Controls ────────────────────────────────────────────────────────────────

function toggleRun() {
  if (isRunning) {
    stopSimulation();
  } else {
    startSimulation();
  }
}

function startSimulation() {
  isRunning = true;
  runPauseBtn.textContent = 'Pause';
  if (animationFrameId === null) {
    animationFrameId = requestAnimationFrame(tick);
  }
}

function stopSimulation() {
  isRunning = false;
  runPauseBtn.textContent = 'Run';
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

// ── Button Input ────────────────────────────────────────────────────────────

/**
 * SPIKE workaround for avr8js not modeling internal pull-up:
 * 
 * Normally, INPUT_PULLUP should keep the pin high when not externally driven.
 * avr8js doesn't model pull-up, so we manually schedule BUTTON events:
 * 
 * - At init: BUTTON = 1 (released, simulating pull-up)
 * - On pointerdown: schedule BUTTON = 0 (pressed)
 * - On pointerup/leave: schedule BUTTON = 1 (released)
 * 
 * Same for Space key to allow keyboard control.
 */
function scheduleButtonDown() {
  if (bridge !== null && !isBridgeError(bridge)) {
    bridge.schedule({ signal: 'BUTTON', value: 0, cycle: bridge.cycleCount });
  }
}

function scheduleButtonUp() {
  if (bridge !== null && !isBridgeError(bridge)) {
    bridge.schedule({ signal: 'BUTTON', value: 1, cycle: bridge.cycleCount });
  }
}

// ── DOM Setup ───────────────────────────────────────────────────────────────

function setupUI() {
  const app = document.getElementById('app');
  if (!app) {
    throw new Error('Missing required DOM element with id: "app"');
  }

  app.innerHTML = `
    <div class="container">
      <h1>Hexorcist (spike)</h1>
      <p class="subtitle">ATmega328P emulator + blink_button firmware</p>

      <div class="controls">
        <button id="runPause" class="btn btn-primary">Run</button>
      </div>

      <div class="display-section">
        <div class="time-box">
          <div class="label">Simulated Time</div>
          <div id="timeDisplay" class="time-value">0.000s</div>
        </div>

        <div class="led-section">
          <div class="label">LED Output</div>
          <svg width="100" height="100" viewBox="0 0 100 100" class="led-svg">
            <circle id="ledCircle" cx="50" cy="50" r="40" fill="#0066cc" />
          </svg>
          <p class="led-info">Port B bit 5</p>
        </div>

        <div class="button-section">
          <div class="label">Button Input</div>
          <button id="buttonControl" class="btn btn-secondary">Press (or Space key)</button>
          <p class="button-info">Port D bit 2 — drag to hold, or use Space</p>
        </div>
      </div>

      <div class="event-log-section">
        <div class="label">Last 10 Events</div>
        <table class="event-table">
          <thead>
            <tr>
              <th>Signal</th>
              <th>Value</th>
              <th>Cycle</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody id="eventTable"></tbody>
        </table>
      </div>
    </div>
  `;
}

// ── Event Listeners ─────────────────────────────────────────────────────────

function attachEventListeners() {
  runPauseBtn.addEventListener('click', toggleRun);

  const buttonControl = getElement<HTMLButtonElement>('buttonControl');
  buttonControl.addEventListener('pointerdown', scheduleButtonDown);
  buttonControl.addEventListener('pointerup', scheduleButtonUp);
  buttonControl.addEventListener('pointerleave', scheduleButtonUp);

  // Space key support
  window.addEventListener('keydown', e => {
    if (e.code === 'Space') {
      e.preventDefault();
      scheduleButtonDown();
    }
  });

  window.addEventListener('keyup', e => {
    if (e.code === 'Space') {
      e.preventDefault();
      scheduleButtonUp();
    }
  });
}

// ── Entry Point ─────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', () => {
  setupUI();

  // Now that setupUI has created the elements, look them up
  try {
    runPauseBtn = getElement<HTMLButtonElement>('runPause');
    ledCircle = getElement<SVGCircleElement>('ledCircle');
    timeDisplay = getElement<HTMLElement>('timeDisplay');
    eventTable = getElement<HTMLElement>('eventTable');
  } catch (error) {
    console.error(error);
    alert(`Failed to initialize UI: ${error instanceof Error ? error.message : 'unknown error'}`);
    return;
  }

  attachEventListeners();

  if (initBridge()) {
    // Ready to run
  }
});