import type {
  PackContext,
  UniformPacker,
  UniformSchema,
} from "../utils/uniformSchema";

export interface ComputeRendererConfig<TUniformData> {
  // User-provided compute shader code (the main compute logic)
  computeShader: string;

  // Uniform schema defining data layout
  uniformSchema: UniformSchema<TUniformData>;

  // Workgroup size [x, y] (default: [8, 8])
  workgroupSize?: [number, number];

  // Maximum number of textures to support (default: 0, max: 8)
  // If > 0, textures will be bound to slots 2-(maxTextures+1) and sampler at (maxTextures+2)
  maxTextures?: number;
}

export class ComputeRenderer<TUniformData> {
  private canvas: HTMLCanvasElement;
  private device!: GPUDevice;
  private context!: GPUCanvasContext;
  private presentationFormat!: GPUTextureFormat;
  private canvasWidth: number;
  private canvasHeight: number;

  private computeShaderCode: string;
  private uniformPacker: UniformPacker<TUniformData>;
  private workgroupSize: [number, number];
  private maxTextures: number;

  // Reusable buffer for packing uniform data
  private uniformDataBuffer: Float32Array;

  // Texture management
  private textures: GPUTexture[] = [];
  private textureCache: Map<string, number> = new Map();
  private textureSampler!: GPUSampler;
  private dummyTexture!: GPUTexture;

  // GPU resources
  private verticesBuffer!: GPUBuffer;
  private outputTexture!: GPUTexture;
  private computePipeline!: GPUComputePipeline;
  private displayPipeline!: GPURenderPipeline;
  private uniformBuffer!: GPUBuffer;
  private sampler!: GPUSampler;
  private computeBindGroup!: GPUBindGroup;
  private displayBindGroup!: GPUBindGroup;
  private renderPassDescriptor!: GPURenderPassDescriptor;
  private colorAttachment!: GPURenderPassColorAttachment;

  constructor(
    canvas: HTMLCanvasElement,
    config: ComputeRendererConfig<TUniformData>,
    width?: number,
    height?: number,
    useDevicePixelRatio: boolean = true
  ) {
    this.canvas = canvas;
    this.computeShaderCode = config.computeShader;
    this.workgroupSize = config.workgroupSize || [8, 8];
    this.maxTextures = Math.min(config.maxTextures ?? 0, 8); // Clamp to [0, 8]

    // Create packer from schema and allocate reusable buffer
    this.uniformPacker = config.uniformSchema.createPacker();
    this.uniformDataBuffer = new Float32Array(
      this.uniformPacker.bufferSize / 4
    );

    // Configure canvas dimensions
    const pixelRatio = useDevicePixelRatio ? window.devicePixelRatio : 1;
    this.canvasWidth = width ?? canvas.clientWidth * pixelRatio;
    this.canvasHeight = height ?? canvas.clientHeight * pixelRatio;

    this.canvas.width = this.canvasWidth;
    this.canvas.height = this.canvasHeight;
  }

  async initialize(
    options: { maxTextureDimension?: number } = {}
  ): Promise<void> {
    // Request WebGPU adapter
    const adapter = await navigator.gpu?.requestAdapter();
    if (!adapter) {
      throw new Error("Failed to get WebGPU adapter");
    }

    // Request device with higher texture dimension and buffer limits if specified
    // This allows loading larger textures (up to adapter's max capability)
    if (options.maxTextureDimension) {
      const requestedTextureDim = Math.min(
        adapter.limits.maxTextureDimension2D,
        options.maxTextureDimension
      );
      const requestedBufferSize = Math.min(
        adapter.limits.maxBufferSize,
        4294967296 // 4GB
      );

      this.device = await adapter.requestDevice({
        requiredLimits: {
          maxTextureDimension2D: requestedTextureDim,
          maxBufferSize: requestedBufferSize,
        },
      });
    } else {
      this.device = await adapter.requestDevice();
    }
    if (!this.device) {
      throw new Error("Failed to get WebGPU device");
    }

    this.context = this.canvas.getContext("webgpu") as GPUCanvasContext;
    if (!this.context) {
      throw new Error("Failed to get WebGPU context");
    }

    this.presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({
      device: this.device,
      format: this.presentationFormat,
    });

    await this.createResources();
  }

  private async createResources(): Promise<void> {
    // Create vertex buffer for fullscreen quad
    const quadVertexArray = this.createFullscreenQuad();
    this.verticesBuffer = this.device.createBuffer({
      size: quadVertexArray.byteLength,
      usage: GPUBufferUsage.VERTEX,
      mappedAtCreation: true,
    });
    new Float32Array(this.verticesBuffer.getMappedRange()).set(quadVertexArray);
    this.verticesBuffer.unmap();

    // Create output texture for compute shader
    this.outputTexture = this.device.createTexture({
      size: [this.canvasWidth, this.canvasHeight],
      format: "rgba8unorm",
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });

    // Create compute pipeline with user's shader
    const computeShaderCode = this.buildComputeShader();
    this.computePipeline = this.device.createComputePipeline({
      layout: "auto",
      compute: {
        module: this.device.createShaderModule({
          code: computeShaderCode,
        }),
      },
    });

    // Create display pipeline
    this.displayPipeline = this.device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module: this.device.createShaderModule({
          code: this.getVertexShaderCode(),
        }),
        buffers: [
          {
            arrayStride: 4 * 4, // 4 floats per vertex
            attributes: [
              {
                shaderLocation: 0,
                offset: 0,
                format: "float32x2", // position
              },
              {
                shaderLocation: 1,
                offset: 4 * 2,
                format: "float32x2", // uv
              },
            ],
          },
        ],
      },
      fragment: {
        module: this.device.createShaderModule({
          code: this.getFragmentShaderCode(),
        }),
        targets: [
          {
            format: this.presentationFormat,
          },
        ],
      },
      primitive: {
        topology: "triangle-list",
        cullMode: "none",
      },
    });

    // Create uniform buffer
    this.uniformBuffer = this.device.createBuffer({
      size: this.uniformPacker.bufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Create sampler for display
    this.sampler = this.device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
    });

    // Create texture resources if texture support is enabled
    if (this.maxTextures > 0) {
      // Create texture sampler for ray tracing
      this.textureSampler = this.device.createSampler({
        magFilter: "linear",
        minFilter: "linear",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
      });

      // Create a dummy 1x1 white texture for unused slots
      this.dummyTexture = this.device.createTexture({
        size: [1, 1, 1],
        format: "rgba8unorm",
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.RENDER_ATTACHMENT,
        label: "DummyTexture",
      });

      // Fill dummy texture with white
      const dummyData = new Uint8Array([255, 255, 255, 255]);
      this.device.queue.writeTexture(
        { texture: this.dummyTexture },
        dummyData,
        { bytesPerRow: 4 },
        [1, 1, 1]
      );
    }

    // Create bind groups
    this.computeBindGroup = this.device.createBindGroup({
      layout: this.computePipeline.getBindGroupLayout(0),
      entries: this.createComputeBindGroupEntries(),
    });

    this.displayBindGroup = this.device.createBindGroup({
      layout: this.displayPipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: this.outputTexture.createView(),
        },
        {
          binding: 1,
          resource: this.sampler,
        },
      ],
    });

    // Create render pass descriptor with reusable color attachment
    this.colorAttachment = {
      view: this.context.getCurrentTexture().createView(),
      clearValue: [0.0, 0.0, 0.0, 1.0],
      loadOp: "clear",
      storeOp: "store",
    };

    this.renderPassDescriptor = {
      colorAttachments: [this.colorAttachment],
    };
  }

  private createFullscreenQuad(): Float32Array {
    // Two triangles covering the screen in normalized device coordinates
    // Each vertex: [x, y, u, v]
    return new Float32Array([
      // Triangle 1
      -1,
      -1,
      0,
      0, // bottom-left
      1,
      -1,
      1,
      0, // bottom-right
      -1,
      1,
      0,
      1, // top-left
      // Triangle 2
      -1,
      1,
      0,
      1, // top-left
      1,
      -1,
      1,
      0, // bottom-right
      1,
      1,
      1,
      1, // top-right
    ]);
  }

  private buildComputeShader(): string {
    // Combine generated bindings with user's compute shader code
    const bindings = this.uniformPacker.generateBindings();
    const textureBindings = this.generateTextureBindings();
    return `${bindings}\n${textureBindings}\n${this.computeShaderCode}`;
  }

  private generateTextureBindings(): string {
    if (this.maxTextures === 0) {
      return "";
    }

    let code = "// Texture bindings (auto-generated)\n";

    // Generate individual texture declarations (bindings 2 to 2+maxTextures-1)
    for (let i = 0; i < this.maxTextures; i++) {
      code += `@binding(${
        2 + i
      }) @group(0) var computeTexture${i} : texture_2d<f32>;\n`;
    }

    // Add sampler binding (after all textures)
    code += `@binding(${
      2 + this.maxTextures
    }) @group(0) var computeTextureSampler : sampler;\n\n`;

    // Generate helper function to sample by index
    code += `// Helper function to sample texture by index\n`;
    code += `fn sampleTextureByIndex(textureIndex: i32, uv: vec2f, lod: f32) -> vec4f {\n`;

    for (let i = 0; i < this.maxTextures; i++) {
      if (i === 0) {
        code += `  if (textureIndex == ${i}) {\n`;
      } else {
        code += `  } else if (textureIndex == ${i}) {\n`;
      }
      code += `    return textureSampleLevel(computeTexture${i}, computeTextureSampler, uv, lod);\n`;
    }

    code += `  } else {\n`;
    code += `    // Default to texture 0 if invalid index\n`;
    code += `    return textureSampleLevel(computeTexture0, computeTextureSampler, uv, lod);\n`;
    code += `  }\n`;
    code += `}\n`;

    return code;
  }

  private createComputeBindGroupEntries(): GPUBindGroupEntry[] {
    const entries: GPUBindGroupEntry[] = [
      {
        binding: 0,
        resource: { buffer: this.uniformBuffer },
      },
      {
        binding: 1,
        resource: this.outputTexture.createView(),
      },
    ];

    // Add texture bindings if texture support is enabled
    if (this.maxTextures > 0) {
      // Add individual texture bindings (bindings 2 to 2+maxTextures-1)
      for (let i = 0; i < this.maxTextures; i++) {
        entries.push({
          binding: 2 + i,
          resource: (i < this.textures.length
            ? this.textures[i]
            : this.dummyTexture
          ).createView(),
        });
      }

      // Add sampler binding (after all textures)
      entries.push({
        binding: 2 + this.maxTextures,
        resource: this.textureSampler,
      });
    }

    return entries;
  }

  private updateComputeBindGroup(): void {
    if (!this.device || !this.computePipeline) {
      return;
    }

    this.computeBindGroup = this.device.createBindGroup({
      layout: this.computePipeline.getBindGroupLayout(0),
      entries: this.createComputeBindGroupEntries(),
    });
  }

  private getVertexShaderCode(): string {
    return `
      struct VertexOutput {
        @builtin(position) position: vec4f,
        @location(0) uv: vec2f,
      };

      @vertex
      fn main(
        @location(0) position: vec2f,
        @location(1) uv: vec2f
      ) -> VertexOutput {
        var output: VertexOutput;
        output.position = vec4f(position, 0.0, 1.0);
        output.uv = uv;
        return output;
      }
    `;
  }

  private getFragmentShaderCode(): string {
    return `
      @group(0) @binding(0) var outputTexture: texture_2d<f32>;
      @group(0) @binding(1) var textureSampler: sampler;

      @fragment
      fn main(@location(0) uv: vec2f) -> @location(0) vec4f {
        return textureSample(outputTexture, textureSampler, uv);
      }
    `;
  }

  resize(width: number, height: number): void {
    if (!this.device) {
      console.warn("ComputeRenderer not initialized. Cannot resize.");
      return;
    }

    // Update dimensions
    // Note: Canvas dimensions are managed by CanvasRenderer, not here
    this.canvasWidth = width;
    this.canvasHeight = height;

    // Destroy and recreate output texture
    if (this.outputTexture) {
      this.outputTexture.destroy();
    }

    this.outputTexture = this.device.createTexture({
      size: [this.canvasWidth, this.canvasHeight],
      format: "rgba8unorm",
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });

    // Recreate bind groups with new texture
    this.computeBindGroup = this.device.createBindGroup({
      layout: this.computePipeline.getBindGroupLayout(0),
      entries: this.createComputeBindGroupEntries(),
    });

    this.displayBindGroup = this.device.createBindGroup({
      layout: this.displayPipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: this.outputTexture.createView(),
        },
        {
          binding: 1,
          resource: this.sampler,
        },
      ],
    });
  }

  draw(uniformData: TUniformData): void {
    if (!this.device) {
      throw new Error(
        "ComputeRenderer not initialized. Call initialize() first."
      );
    }

    // Pack uniform data into reusable buffer
    const packContext: PackContext = {
      canvasWidth: this.canvasWidth,
      canvasHeight: this.canvasHeight,
    };
    this.uniformPacker.pack(uniformData, this.uniformDataBuffer, packContext);

    // Upload to GPU
    this.device.queue.writeBuffer(
      this.uniformBuffer,
      0,
      this.uniformDataBuffer.buffer,
      this.uniformDataBuffer.byteOffset,
      this.uniformDataBuffer.byteLength
    );

    // Create command encoder
    const commandEncoder = this.device.createCommandEncoder();

    // Compute pass: Run user's compute shader
    const computePass = commandEncoder.beginComputePass();
    computePass.setPipeline(this.computePipeline);
    computePass.setBindGroup(0, this.computeBindGroup);

    // Dispatch workgroups to cover the canvas
    const workgroupsX = Math.ceil(this.canvasWidth / this.workgroupSize[0]);
    const workgroupsY = Math.ceil(this.canvasHeight / this.workgroupSize[1]);
    computePass.dispatchWorkgroups(workgroupsX, workgroupsY);
    computePass.end();

    // Render pass: Display the computed texture
    // Update the color attachment view for the current frame
    this.colorAttachment.view = this.context.getCurrentTexture().createView();

    const renderPass = commandEncoder.beginRenderPass(
      this.renderPassDescriptor
    );
    renderPass.setPipeline(this.displayPipeline);
    renderPass.setBindGroup(0, this.displayBindGroup);
    renderPass.setVertexBuffer(0, this.verticesBuffer);
    renderPass.draw(6); // 6 vertices for 2 triangles
    renderPass.end();

    // Submit command buffer
    this.device.queue.submit([commandEncoder.finish()]);
  }

  isReady(): boolean {
    return this.device !== undefined;
  }

  /**
   * Load a texture from an image URL.
   * @param imageUrl - URL or path to the image file
   * @returns Promise that resolves to an object with texture index and metadata, or null if loading fails
   * @throws Error if texture support is not enabled or max textures exceeded
   */
  async loadTexture(imageUrl: string): Promise<{
    index: number;
    width: number;
    height: number;
    minValue?: number;
    maxValue?: number;
  } | null> {
    if (this.maxTextures === 0) {
      throw new Error(
        "Texture support not enabled. Set maxTextures > 0 in config."
      );
    }

    if (!this.device) {
      throw new Error(
        "ComputeRenderer not initialized. Call initialize() first."
      );
    }

    // Check cache - note: cached textures won't have min/max metadata
    if (this.textureCache.has(imageUrl)) {
      const cachedIndex = this.textureCache.get(imageUrl)!;
      const cachedTexture = this.textures[cachedIndex];
      return {
        index: cachedIndex,
        width: cachedTexture.width,
        height: cachedTexture.height,
      };
    }

    // Check limit
    if (this.textures.length >= this.maxTextures) {
      throw new Error(
        `Maximum number of textures (${this.maxTextures}) already loaded.`
      );
    }

    try {
      // Fetch and decode image
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }

      const blob = await response.blob();

      let imageBitmap: ImageBitmap;
      let width: number;
      let height: number;
      let minValue: number | undefined;
      let maxValue: number | undefined;

      // if (isTiff) {
      //   // Handle TIFF files using utility function
      //   const tiffData = await loadTiffFromBlob(blob);
      //   imageBitmap = tiffData.imageBitmap;
      //   width = tiffData.width;
      //   height = tiffData.height;
      //   minValue = tiffData.minValue;
      //   maxValue = tiffData.maxValue;
      // } else {
      // Handle standard web formats (PNG, JPEG, etc.)
      imageBitmap = await createImageBitmap(blob);
      width = imageBitmap.width;
      height = imageBitmap.height;
      // }

      // Check GPU texture size limits and downsample if necessary
      const maxTextureSize = this.device.limits.maxTextureDimension2D;
      if (width > maxTextureSize || height > maxTextureSize) {
        console.log(
          `Texture too large (${width}x${height}), downsampling to fit GPU limit (${maxTextureSize}x${maxTextureSize})`
        );

        // Calculate new dimensions maintaining aspect ratio
        const scale = Math.min(maxTextureSize / width, maxTextureSize / height);
        const newWidth = Math.floor(width * scale);
        const newHeight = Math.floor(height * scale);

        // Use createImageBitmap with resize options to downsample
        imageBitmap = await createImageBitmap(imageBitmap, {
          resizeWidth: newWidth,
          resizeHeight: newHeight,
          resizeQuality: "high",
        });

        width = newWidth;
        height = newHeight;
        console.log(`Texture downsampled to ${width}x${height}`);
      }

      // Create GPU texture
      const texture = this.device.createTexture({
        size: [width, height, 1],
        format: "rgba8unorm",
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.RENDER_ATTACHMENT,
        label: `Texture_${this.textures.length}`,
      });

      // Copy image data to GPU texture
      this.device.queue.copyExternalImageToTexture(
        { source: imageBitmap },
        { texture: texture },
        [width, height, 1]
      );

      // Store texture and cache
      const textureIndex = this.textures.length;
      this.textures.push(texture);
      this.textureCache.set(imageUrl, textureIndex);

      // Recreate compute bind group to include new texture
      this.updateComputeBindGroup();

      return {
        index: textureIndex,
        width,
        height,
        minValue,
        maxValue,
      };
    } catch (error) {
      console.error("Failed to load texture:", error);
      return null;
    }
  }

  destroy(): void {
    // Destroy all GPU resources
    this.outputTexture?.destroy();
    this.verticesBuffer?.destroy();
    this.uniformBuffer?.destroy();

    // Destroy loaded textures
    for (const texture of this.textures) {
      texture.destroy();
    }
    this.textures = [];
    this.textureCache.clear();

    // Destroy dummy texture
    if (this.dummyTexture) {
      this.dummyTexture.destroy();
    }

    // Note: Pipelines, bind groups, and samplers don't need explicit destruction
  }
}
