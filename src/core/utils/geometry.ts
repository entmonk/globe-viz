function normalizeAngleRadians(angle: number): number {
  const twoPi = Math.PI * 2;
  return ((angle % twoPi) + twoPi) % twoPi;
}

export { normalizeAngleRadians };
