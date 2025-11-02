// ============================================================================
// Packer Interfaces
// ============================================================================

export interface UniformPacker<TUniformData> {
  // Size of the uniform buffer in bytes
  readonly bufferSize: number;

  // Pack JavaScript data into GPU-compatible Float32Array
  pack(data: TUniformData, buffer: Float32Array, context: PackContext): void;

  // Generate WGSL code for the uniform struct and bindings
  generateBindings(): string;
}

export interface PackContext {
  canvasWidth: number;
  canvasHeight: number;
}

// ============================================================================
// WGSL Primitive Types
// ============================================================================

export type WGSLPrimitiveType =
  | "f32" // 4 bytes, 4-byte aligned
  | "u32" // 4 bytes, 4-byte aligned
  | "i32" // 4 bytes, 4-byte aligned
  | "vec2f" // 8 bytes, 8-byte aligned
  | "vec3f" // 12 bytes, 16-byte aligned (!)
  | "vec4f"; // 16 bytes, 16-byte aligned

interface TypeInfo {
  size: number; // Size in bytes
  alignment: number; // Required alignment in bytes
  floatCount: number; // Number of f32 values
}

const WGSL_TYPE_INFO: Record<WGSLPrimitiveType, TypeInfo> = {
  f32: { size: 4, alignment: 4, floatCount: 1 },
  u32: { size: 4, alignment: 4, floatCount: 1 },
  i32: { size: 4, alignment: 4, floatCount: 1 },
  vec2f: { size: 8, alignment: 8, floatCount: 2 },
  vec3f: { size: 12, alignment: 16, floatCount: 3 }, // vec3 needs 16-byte alignment!
  vec4f: { size: 16, alignment: 16, floatCount: 4 },
};

// ============================================================================
// Schema Definition Types
// ============================================================================

export interface ArrayDefinition {
  struct?: SchemaDefinition; // For struct arrays like array<Sphere, 8>
  primitive?: WGSLPrimitiveType; // For primitive arrays like array<f32, 10>
  length: number; // Maximum array size
}

export type SchemaFieldType =
  | WGSLPrimitiveType // Primitive type
  | { struct: SchemaDefinition } // Nested struct
  | { array: ArrayDefinition }; // Array type

export type SchemaDefinition = Record<string, SchemaFieldType>;

// ============================================================================
// Layout Calculation
// ============================================================================

interface FieldLayout {
  name: string;
  type: SchemaFieldType;
  offset: number; // Byte offset in buffer
  size: number; // Size in bytes
  floatOffset: number; // Offset in Float32Array
  floatCount: number; // Number of floats
  paddingAfter: number; // Padding floats needed after this field
  isArray?: boolean; // True if this field is an array
  arrayLength?: number; // Length of array if isArray is true
  arrayElementSize?: number; // Size in bytes of each array element
  arrayElementFloats?: number; // Number of floats per array element
}

interface StructLayout {
  fields: FieldLayout[];
  totalSize: number; // Total size in bytes
  totalFloats: number; // Total floats including padding
}

/**
 * Calculate the layout of a struct with proper GPU alignment
 */
function calculateStructLayout(schema: SchemaDefinition): StructLayout {
  const fields: FieldLayout[] = [];
  let currentOffset = 0;
  let currentFloatOffset = 0;

  for (const [name, fieldType] of Object.entries(schema)) {
    let typeInfo: TypeInfo;
    let nestedLayout: StructLayout | null = null;
    let isArray = false;
    let arrayLength = 0;
    let arrayElementSize = 0;
    let arrayElementFloats = 0;

    if (typeof fieldType === "string") {
      // Primitive type
      typeInfo = WGSL_TYPE_INFO[fieldType];
    } else if ("struct" in fieldType) {
      // Nested struct
      nestedLayout = calculateStructLayout(fieldType.struct);
      typeInfo = {
        size: nestedLayout.totalSize,
        alignment: 16, // Structs are 16-byte aligned in uniform buffers
        floatCount: nestedLayout.totalFloats,
      };
    } else if ("array" in fieldType) {
      // Array type
      isArray = true;
      arrayLength = fieldType.array.length;

      if (fieldType.array.struct) {
        // Array of structs
        const elementLayout = calculateStructLayout(fieldType.array.struct);
        // Each array element must be 16-byte aligned
        const alignedElementSize = Math.ceil(elementLayout.totalSize / 16) * 16;
        arrayElementSize = alignedElementSize;
        arrayElementFloats = alignedElementSize / 4;

        typeInfo = {
          size: alignedElementSize * arrayLength,
          alignment: 16, // Arrays are 16-byte aligned
          floatCount: arrayElementFloats * arrayLength,
        };
      } else if (fieldType.array.primitive) {
        // Array of primitives
        const primitiveInfo = WGSL_TYPE_INFO[fieldType.array.primitive];
        // Each array element must be 16-byte aligned (array stride rule)
        const alignedElementSize = Math.max(16, primitiveInfo.size);
        arrayElementSize = alignedElementSize;
        arrayElementFloats = alignedElementSize / 4;

        typeInfo = {
          size: alignedElementSize * arrayLength,
          alignment: 16, // Arrays are 16-byte aligned
          floatCount: arrayElementFloats * arrayLength,
        };
      } else {
        throw new Error(
          `Array definition for field '${name}' must have either 'struct' or 'primitive'`
        );
      }
    } else {
      throw new Error(`Unknown field type for '${name}'`);
    }

    // Calculate padding needed to align this field
    const alignmentOffset = currentOffset % typeInfo.alignment;
    const paddingBytes =
      alignmentOffset === 0 ? 0 : typeInfo.alignment - alignmentOffset;
    const paddingFloats = paddingBytes / 4;

    currentOffset += paddingBytes;
    currentFloatOffset += paddingFloats;

    // Add field
    fields.push({
      name,
      type: fieldType,
      offset: currentOffset,
      size: typeInfo.size,
      floatOffset: currentFloatOffset,
      floatCount: typeInfo.floatCount,
      paddingAfter: 0, // Will calculate below for non-array fields
      isArray,
      arrayLength: isArray ? arrayLength : undefined,
      arrayElementSize: isArray ? arrayElementSize : undefined,
      arrayElementFloats: isArray ? arrayElementFloats : undefined,
    });

    currentOffset += typeInfo.size;
    currentFloatOffset += typeInfo.floatCount;

    // Calculate padding needed after this field to maintain alignment for next field
    // For vec3f, we need to pad to 16-byte boundary (only for non-array fields)
    if (!isArray && typeof fieldType === "string" && fieldType === "vec3f") {
      const paddingForVec3 = 1; // vec3f needs 1 float of padding to reach 16 bytes
      fields[fields.length - 1].paddingAfter = paddingForVec3;
      currentOffset += paddingForVec3 * 4;
      currentFloatOffset += paddingForVec3;
    }
  }

  // Final padding to align struct to 16 bytes (required for uniform buffers)
  const totalAlignmentOffset = currentOffset % 16;
  const finalPaddingBytes =
    totalAlignmentOffset === 0 ? 0 : 16 - totalAlignmentOffset;
  const finalPaddingFloats = finalPaddingBytes / 4;

  currentOffset += finalPaddingBytes;
  currentFloatOffset += finalPaddingFloats;

  return {
    fields,
    totalSize: currentOffset,
    totalFloats: currentFloatOffset,
  };
}

// ============================================================================
// WGSL Code Generation
// ============================================================================

/**
 * Generate WGSL struct definition from schema
 */
function generateWGSLStruct(
  name: string,
  layout: StructLayout,
  skipArrays: boolean = false
): string {
  const lines: string[] = [`struct ${name} {`];

  let paddingCounter = 1;
  for (const field of layout.fields) {
    if (field.isArray) {
      // Arrays are declared in the main struct, not in nested structs
      if (!skipArrays) {
        const fieldType = field.type;
        if (
          typeof fieldType === "object" &&
          "array" in fieldType &&
          fieldType.array.struct
        ) {
          // Array of structs
          lines.push(
            `  ${field.name}: array<${capitalize(field.name)}Element, ${
              field.arrayLength
            }>,`
          );
        } else if (
          typeof fieldType === "object" &&
          "array" in fieldType &&
          fieldType.array.primitive
        ) {
          // Array of primitives
          lines.push(
            `  ${field.name}: array<${fieldType.array.primitive}, ${field.arrayLength}>,`
          );
        }
      }
    } else if (typeof field.type === "string") {
      // Primitive type
      lines.push(`  ${field.name}: ${field.type},`);

      // Add padding fields
      for (let i = 0; i < field.paddingAfter; i++) {
        lines.push(`  _padding${paddingCounter++}: f32,`);
      }
    } else if ("struct" in field.type) {
      // Nested struct - use the struct type name
      lines.push(`  ${field.name}: ${capitalize(field.name)},`);
    }
  }

  // Add final padding if needed (only for non-array fields)
  if (!skipArrays) {
    const lastField = layout.fields[layout.fields.length - 1];
    if (lastField && !lastField.isArray) {
      const lastFieldEnd =
        lastField.floatOffset + lastField.floatCount + lastField.paddingAfter;
      const finalPaddingCount = layout.totalFloats - lastFieldEnd;
      for (let i = 0; i < finalPaddingCount; i++) {
        lines.push(`  _padding${paddingCounter++}: f32,`);
      }
    }
  }

  lines.push("}");
  return lines.join("\n");
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Generate complete WGSL bindings code
 */
function generateWGSLBindings(schema: SchemaDefinition): string {
  const layout = calculateStructLayout(schema);

  // Generate nested struct definitions first
  const nestedStructs: string[] = [];
  for (const [name, fieldType] of Object.entries(schema)) {
    if (typeof fieldType !== "string") {
      if ("struct" in fieldType) {
        // Regular nested struct
        const nestedLayout = calculateStructLayout(fieldType.struct);
        const nestedStruct = generateWGSLStruct(capitalize(name), nestedLayout);
        nestedStructs.push(nestedStruct);
      } else if ("array" in fieldType && fieldType.array.struct) {
        // Array of structs - generate the element struct
        const elementLayout = calculateStructLayout(fieldType.array.struct);
        const elementStruct = generateWGSLStruct(
          capitalize(name) + "Element",
          elementLayout,
          true // Skip arrays in nested structs
        );
        nestedStructs.push(elementStruct);
      }
    }
  }

  // Generate main struct
  const mainStruct = generateWGSLStruct("Uniforms", layout);

  // Combine everything
  const parts = [
    ...nestedStructs,
    "",
    mainStruct,
    "",
    "@binding(0) @group(0) var<uniform> uniforms: Uniforms;",
    "@binding(1) @group(0) var outputTexture: texture_storage_2d<rgba8unorm, write>;",
  ];

  return parts.join("\n");
}

// ============================================================================
// Data Packing
// ============================================================================

type DataValue = number | number[] | { [key: string]: DataValue };

/**
 * Pack data into Float32Array buffer according to schema
 */
function packData(
  data: Record<string, DataValue>,
  layout: StructLayout,
  buffer: Float32Array,
  context: PackContext
): void {
  for (const field of layout.fields) {
    const value =
      field.name === "screenResolution"
        ? [context.canvasWidth, context.canvasHeight]
        : data[field.name];

    if (field.isArray) {
      // Array type
      const fieldType = field.type;
      if (
        typeof fieldType === "string" ||
        !("array" in fieldType) ||
        !fieldType
      ) {
        continue; // Skip if not an array type (shouldn't happen)
      }

      const arrayData = value as DataValue[];
      const arrayDef = fieldType.array;
      const arrayLength = field.arrayLength!;
      const elementFloats = field.arrayElementFloats!;

      if (arrayDef.struct) {
        // Array of structs
        const elementLayout = calculateStructLayout(arrayDef.struct);

        for (let i = 0; i < arrayLength; i++) {
          const elementOffset = field.floatOffset + i * elementFloats;

          if (arrayData && i < arrayData.length) {
            // Pack actual data
            const elementBuffer = new Float32Array(
              buffer.buffer,
              buffer.byteOffset + elementOffset * 4,
              elementFloats
            );
            packData(
              arrayData[i] as Record<string, DataValue>,
              elementLayout,
              elementBuffer,
              context
            );
          } else {
            // Fill unused slots with zeros
            for (let j = 0; j < elementFloats; j++) {
              buffer[elementOffset + j] = 0;
            }
          }
        }
      } else if (arrayDef.primitive) {
        // Array of primitives
        const primitiveInfo = WGSL_TYPE_INFO[arrayDef.primitive];

        for (let i = 0; i < arrayLength; i++) {
          const elementOffset = field.floatOffset + i * elementFloats;

          if (arrayData && i < arrayData.length) {
            const elementValue = arrayData[i];

            if (Array.isArray(elementValue)) {
              // Vector primitive (e.g., vec3f)
              for (let j = 0; j < primitiveInfo.floatCount; j++) {
                buffer[elementOffset + j] = elementValue[j] as number;
              }
            } else {
              // Scalar primitive (e.g., f32, i32, u32)
              if (
                arrayDef.primitive === "i32" ||
                arrayDef.primitive === "u32"
              ) {
                // Write integer bits correctly
                const dataView = new DataView(buffer.buffer, buffer.byteOffset);
                const byteOffset = elementOffset * 4;
                if (arrayDef.primitive === "i32") {
                  dataView.setInt32(byteOffset, elementValue as number, true);
                } else {
                  dataView.setUint32(byteOffset, elementValue as number, true);
                }
              } else {
                buffer[elementOffset] = elementValue as number;
              }
            }

            // Fill padding within each array element
            for (let j = primitiveInfo.floatCount; j < elementFloats; j++) {
              buffer[elementOffset + j] = 0;
            }
          } else {
            // Fill unused slots with zeros
            for (let j = 0; j < elementFloats; j++) {
              buffer[elementOffset + j] = 0;
            }
          }
        }
      }
    } else if (typeof field.type === "string") {
      // Primitive type
      const typeInfo = WGSL_TYPE_INFO[field.type];

      if (Array.isArray(value)) {
        // Vector type
        for (let i = 0; i < typeInfo.floatCount; i++) {
          buffer[field.floatOffset + i] = value[i] as number;
        }
      } else {
        // Scalar type
        // For i32/u32, we need to write the integer bits correctly
        if (field.type === "i32" || field.type === "u32") {
          // Create a DataView to write integer bits correctly
          const dataView = new DataView(buffer.buffer, buffer.byteOffset);
          const byteOffset = field.floatOffset * 4;
          if (field.type === "i32") {
            dataView.setInt32(byteOffset, value as number, true); // true = little-endian
          } else {
            dataView.setUint32(byteOffset, value as number, true);
          }
        } else {
          buffer[field.floatOffset] = value as number;
        }
      }

      // Add padding
      for (let i = 0; i < field.paddingAfter; i++) {
        buffer[field.floatOffset + typeInfo.floatCount + i] = 0;
      }
    } else if ("struct" in field.type) {
      // Nested struct
      const nestedData = value as Record<string, DataValue>;
      const nestedLayout = calculateStructLayout(field.type.struct);

      // Create a view into the buffer at the correct offset
      const nestedBuffer = new Float32Array(
        buffer.buffer,
        buffer.byteOffset + field.floatOffset * 4,
        field.floatCount
      );

      packData(nestedData, nestedLayout, nestedBuffer, context);
    }
  }

  // Fill final padding with zeros
  const lastField = layout.fields[layout.fields.length - 1];
  if (lastField && !lastField.isArray) {
    const lastFieldEnd =
      lastField.floatOffset + lastField.floatCount + lastField.paddingAfter;
    for (let i = lastFieldEnd; i < layout.totalFloats; i++) {
      buffer[i] = 0;
    }
  }
}

// ============================================================================
// Public API
// ============================================================================

export interface UniformSchema<TData> {
  schema: SchemaDefinition;
  layout: StructLayout;
  createPacker(): UniformPacker<TData>;
}

/**
 * Define a uniform schema and get automatic buffer management
 */
export function defineUniformSchema<TData>(
  schema: SchemaDefinition
): UniformSchema<TData> {
  const layout = calculateStructLayout(schema);

  return {
    schema,
    layout,
    createPacker(): UniformPacker<TData> {
      return {
        bufferSize: layout.totalSize,

        pack(data: TData, buffer: Float32Array, context: PackContext): void {
          packData(data as Record<string, DataValue>, layout, buffer, context);
        },

        generateBindings(): string {
          return generateWGSLBindings(schema);
        },
      };
    },
  };
}
