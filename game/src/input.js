// Keyboard and mouse, and the pointer lock that turns the mouse into look. Plain
// browser APIs only. Keydown handlers are registered by main.js for one-shot actions
// (grenade, buy keys, mute); the held-key set is read every fixed step.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const state = { keys, locked: false, firing: false, triggerEdge: false, lookX: 0, lookY: 0 };
  const keyHandlers = new Map();

  function setKey(event, down) {
    if (down) keys.add(event.code);
    else keys.delete(event.code);
    if (event.code === 'Space') event.preventDefault();
  }

  window.addEventListener('keydown', (event) => {
    setKey(event, true);
    const handler = keyHandlers.get(event.code);
    if (handler && !event.repeat) handler();
  });
  window.addEventListener('keyup', (event) => setKey(event, false));
  window.addEventListener('blur', () => keys.clear());
  window.addEventListener('mousemove', (event) => {
    if (!state.locked) return;
    state.lookX += event.movementX;
    state.lookY += event.movementY;
  });
  window.addEventListener('mousedown', (event) => {
    if (state.locked && event.button === 0) {
      state.firing = true;
      state.triggerEdge = true;
    }
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.firing = false;
  });
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) {
      keys.clear();
      state.firing = false;
    }
    onLockChange(state.locked);
  });

  return {
    state,
    requestLock() {
      canvas.requestPointerLock();
    },
    onKey(code, handler) {
      keyHandlers.set(code, handler);
    },
    takeLook() {
      const x = state.lookX;
      const y = state.lookY;
      state.lookX = 0;
      state.lookY = 0;
      return { x, y };
    },
    // One fresh trigger pull for semi-automatic weapons; consumed on read.
    takeTrigger() {
      const edge = state.triggerEdge;
      state.triggerEdge = false;
      return edge;
    },
  };
}
