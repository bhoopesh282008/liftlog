// Vanta and three.js r134 ship without types. Only the onboarding
// background uses them, through the narrow surface below.
declare module "vanta/dist/vanta.fog.min" {
  const FOG: (options: Record<string, unknown>) => { destroy: () => void };
  export default FOG;
}
declare module "three";
