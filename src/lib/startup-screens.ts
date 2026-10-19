// iPhone screens that get a launch image, in CSS points and pixel ratio.
// iOS shows a home-screen app's launch image only when one matches the
// device exactly, otherwise it flashes white before the page paints.
export const STARTUP_SCREENS = [
  { width: 440, height: 956, ratio: 3 }, // 16 Pro Max
  { width: 402, height: 874, ratio: 3 }, // 16 Pro
  { width: 430, height: 932, ratio: 3 }, // 14 Pro Max, 15 Plus/Pro Max, 16 Plus
  { width: 393, height: 852, ratio: 3 }, // 14 Pro, 15, 15 Pro, 16
  { width: 428, height: 926, ratio: 3 }, // 12/13 Pro Max, 14 Plus
  { width: 390, height: 844, ratio: 3 }, // 12, 13, 14, 12/13 Pro
  { width: 375, height: 812, ratio: 3 }, // X, XS, 11 Pro, 12/13 mini
  { width: 414, height: 896, ratio: 3 }, // XS Max, 11 Pro Max
  { width: 414, height: 896, ratio: 2 }, // XR, 11
  { width: 375, height: 667, ratio: 2 }, // SE (2nd/3rd gen), 8
] as const;

export const startupPixels = (s: (typeof STARTUP_SCREENS)[number]) => `${s.width * s.ratio}x${s.height * s.ratio}`;

export const startupMedia = (s: (typeof STARTUP_SCREENS)[number]) =>
  `(device-width: ${s.width}px) and (device-height: ${s.height}px) and (-webkit-device-pixel-ratio: ${s.ratio}) and (orientation: portrait)`;
