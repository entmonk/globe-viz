export class Vec3 {
  x: number;
  y: number;
  z: number;

  constructor(x: number = 0, y: number = 0, z: number = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  // Static factory methods
  static zero(): Vec3 {
    return new Vec3(0, 0, 0);
  }

  static one(): Vec3 {
    return new Vec3(1, 1, 1);
  }

  static up(): Vec3 {
    return new Vec3(0, 1, 0);
  }

  static right(): Vec3 {
    return new Vec3(1, 0, 0);
  }

  static forward(): Vec3 {
    return new Vec3(0, 0, 1);
  }

  static fromArray(array: [number, number, number]): Vec3 {
    return new Vec3(array[0], array[1], array[2]);
  }

  // Basic operations
  add(other: Vec3): Vec3 {
    return new Vec3(this.x + other.x, this.y + other.y, this.z + other.z);
  }

  subtract(other: Vec3): Vec3 {
    return new Vec3(this.x - other.x, this.y - other.y, this.z - other.z);
  }

  multiply(scalar: number): Vec3 {
    return new Vec3(this.x * scalar, this.y * scalar, this.z * scalar);
  }

  divide(scalar: number): Vec3 {
    if (scalar === 0) throw new Error("Division by zero");
    return new Vec3(this.x / scalar, this.y / scalar, this.z / scalar);
  }

  // Vector operations
  dot(other: Vec3): number {
    return this.x * other.x + this.y * other.y + this.z * other.z;
  }

  cross(other: Vec3): Vec3 {
    return new Vec3(
      this.y * other.z - this.z * other.y,
      this.z * other.x - this.x * other.z,
      this.x * other.y - this.y * other.x
    );
  }

  // Magnitude and normalization
  magnitude(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  }

  magnitudeSquared(): number {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }

  normalize(): Vec3 {
    const mag = this.magnitude();
    if (mag === 0) return Vec3.zero();
    return this.divide(mag);
  }

  // Distance methods
  distance(other: Vec3): number {
    return this.subtract(other).magnitude();
  }

  distanceSquared(other: Vec3): number {
    return this.subtract(other).magnitudeSquared();
  }

  // Utility methods
  clone(): Vec3 {
    return new Vec3(this.x, this.y, this.z);
  }

  equals(other: Vec3, tolerance: number = 1e-10): boolean {
    return (
      Math.abs(this.x - other.x) < tolerance &&
      Math.abs(this.y - other.y) < tolerance &&
      Math.abs(this.z - other.z) < tolerance
    );
  }

  negate(): Vec3 {
    return new Vec3(-this.x, -this.y, -this.z);
  }

  // Linear interpolation
  lerp(other: Vec3, t: number): Vec3 {
    return this.add(other.subtract(this).multiply(t));
  }

  // Component-wise operations
  min(other: Vec3): Vec3 {
    return new Vec3(
      Math.min(this.x, other.x),
      Math.min(this.y, other.y),
      Math.min(this.z, other.z)
    );
  }

  max(other: Vec3): Vec3 {
    return new Vec3(
      Math.max(this.x, other.x),
      Math.max(this.y, other.y),
      Math.max(this.z, other.z)
    );
  }

  // String representation
  toString(): string {
    return `Vec3(${this.x}, ${this.y}, ${this.z})`;
  }

  // Array conversion
  toArray(): [number, number, number] {
    return [this.x, this.y, this.z];
  }

  // Set methods for in-place operations
  set(x: number, y: number, z: number): this {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  copy(other: Vec3): this {
    this.x = other.x;
    this.y = other.y;
    this.z = other.z;
    return this;
  }

  // Angle between vectors
  angleTo(other: Vec3): number {
    const dot = this.dot(other);
    const mag = this.magnitude() * other.magnitude();
    if (mag === 0) return 0;
    return Math.acos(Math.max(-1, Math.min(1, dot / mag)));
  }

  // Reflection
  reflect(normal: Vec3): Vec3 {
    return this.subtract(normal.multiply(2 * this.dot(normal)));
  }

  // Project vector onto another
  project(onto: Vec3): Vec3 {
    const ontoMagSq = onto.magnitudeSquared();
    if (ontoMagSq === 0) return Vec3.zero();
    return onto.multiply(this.dot(onto) / ontoMagSq);
  }

  // Rotation methods
  /**
   * Rotate this vector around an arbitrary axis by an angle (right-hand rule)
   * @param axis The axis to rotate around (should be normalized)
   * @param angleRadians The angle to rotate in radians
   * @returns Rotated vector
   */
  rotateAroundAxis(axis: Vec3, angleRadians: number): Vec3 {
    const normalizedAxis = axis.normalize();
    const cos = Math.cos(angleRadians);
    const sin = Math.sin(angleRadians);
    const oneMinusCos = 1 - cos;

    // Rodrigues' rotation formula
    const dotProduct = this.dot(normalizedAxis);
    const crossProduct = normalizedAxis.cross(this);

    return this.multiply(cos)
      .add(crossProduct.multiply(sin))
      .add(normalizedAxis.multiply(dotProduct * oneMinusCos));
  }

  /**
   * Rotate around X-axis
   * @param angleRadians Angle in radians
   * @returns Rotated vector
   */
  rotateX(angleRadians: number): Vec3 {
    const cos = Math.cos(angleRadians);
    const sin = Math.sin(angleRadians);
    return new Vec3(
      this.x,
      this.y * cos - this.z * sin,
      this.y * sin + this.z * cos
    );
  }

  /**
   * Rotate around Y-axis
   * @param angleRadians Angle in radians
   * @returns Rotated vector
   */
  rotateY(angleRadians: number): Vec3 {
    const cos = Math.cos(angleRadians);
    const sin = Math.sin(angleRadians);
    return new Vec3(
      this.x * cos + this.z * sin,
      this.y,
      -this.x * sin + this.z * cos
    );
  }

  /**
   * Rotate around Z-axis
   * @param angleRadians Angle in radians
   * @returns Rotated vector
   */
  rotateZ(angleRadians: number): Vec3 {
    const cos = Math.cos(angleRadians);
    const sin = Math.sin(angleRadians);
    return new Vec3(
      this.x * cos - this.y * sin,
      this.x * sin + this.y * cos,
      this.z
    );
  }

  // Coordinate transformation methods

  /**
   * Translate this vector by moving the coordinate system origin
   * @param offset The offset to subtract (new origin position in old coordinates)
   * @returns New vector in the translated coordinate system
   */
  translate(offset: Vec3): Vec3 {
    return this.subtract(offset);
  }

  /**
   * Transform this vector to camera space
   * @param cameraWorldPosition Position of camera in world coordinates
   * @returns Vector in camera space (camera at origin)
   */
  toCameraSpace(cameraWorldPosition: Vec3): Vec3 {
    return this.translate(cameraWorldPosition);
  }

  // 2D operations (in XZ plane)

  /**
   * Calculate distance in the XZ plane only (ignoring Y)
   * @param other The other vector
   * @returns Distance in XZ plane
   */
  distanceXZ(other: Vec3): number {
    const dx = this.x - other.x;
    const dz = this.z - other.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  /**
   * Normalize this vector in the XZ plane (Y component unchanged)
   * @returns New vector normalized in XZ plane
   */
  normalizeXZ(): Vec3 {
    const magXZ = Math.sqrt(this.x * this.x + this.z * this.z);
    if (magXZ === 0) return this.clone();
    return new Vec3(this.x / magXZ, this.y, this.z / magXZ);
  }

  /**
   * Create a vector perpendicular to this one in the XZ plane (rotated 90° counterclockwise)
   * Useful for creating east/west directions from north/south
   * @returns New perpendicular vector in XZ plane
   */
  perpendicularXZ(): Vec3 {
    return new Vec3(-this.z, this.y, this.x);
  }

  // Factory methods for creating vectors from polar/spherical coordinates

  /**
   * Create a vector from polar coordinates (2D in XZ plane)
   * @param radius Distance from origin
   * @param angle Angle in radians (0 = +X axis, π/2 = +Z axis)
   * @param y Optional Y component (default 0)
   * @returns New vector
   */
  static fromPolar(radius: number, angle: number, y: number = 0): Vec3 {
    return new Vec3(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
  }

  /**
   * Create a vector from spherical coordinates (altitude/azimuth style)
   * @param distance Distance from origin
   * @param altitude Angle above horizon in radians
   * @param azimuth Horizontal angle in radians (0 = +X, π/2 = +Z)
   * @returns New vector
   */
  static fromSpherical(
    distance: number,
    altitude: number,
    azimuth: number
  ): Vec3 {
    const horizontalDistance = distance * Math.cos(altitude);
    return new Vec3(
      horizontalDistance * Math.cos(azimuth),
      distance * Math.sin(altitude),
      horizontalDistance * Math.sin(azimuth)
    );
  }
}
