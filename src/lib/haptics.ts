import { hapticTrigger } from "ios-haptics";

// Safari has no vibration API. On iPhone, ios-haptics lays an invisible
// native switch over the button, so the tap itself plays the system haptic.
// Use as a ref: <button ref={hapticRef} ...>. Elsewhere it does nothing.
export const hapticRef = (el: HTMLElement | null) => {
  if (el) hapticTrigger(el);
};

// Android and other browsers with the vibration API: a short tick on tap.
export const buzz = (ms = 10) => {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(ms);
};
