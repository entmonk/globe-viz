import { useEffect, useRef } from "react";
import { SceneInfo } from "./SceneInfo";
import type { Scene } from "../types/scene";

interface CanvasProps {
  scene: Scene;
  className?: string;
}

export function Canvas({
  scene,
  className = "fullscreen-canvas",
}: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let animationId: number;
    const startTime = performance.now();
    let lastTime = startTime;
    let isMouseDown = false;

    // Set canvas size to fill its container
    const resizeCanvas = () => {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;

      // Call scene's resize handler if it exists
      scene.resize?.(canvas);

      // Immediately redraw to prevent blank canvas flash
      // Note: Setting canvas.width/height automatically clears the canvas
      const currentTime = performance.now();
      scene.draw({ deltaTime: 0, totalTime: currentTime - startTime });
    };

    // Animation loop
    const animate = (currentTime: number) => {
      const deltaTime = currentTime - lastTime;
      const totalTime = currentTime - startTime;
      lastTime = currentTime;

      scene.draw({ deltaTime, totalTime });

      animationId = requestAnimationFrame(animate);
    };

    // Mouse event handlers
    const handleMouseDown = (event: MouseEvent) => {
      isMouseDown = true;
      scene.onMouseDown?.(event, canvas);
    };

    const handleMouseMove = (event: MouseEvent) => {
      scene.onMouseMove?.(event);
    };

    const handleMouseUp = (event: MouseEvent) => {
      isMouseDown = false;
      scene.onMouseUp?.(event);
    };

    // Handle mouse leaving canvas while dragging
    const handleMouseLeave = (event: MouseEvent) => {
      if (isMouseDown) {
        isMouseDown = false;
        scene.onMouseUp?.(event);
      }
    };

    // Wheel event handler
    const handleWheel = (event: WheelEvent) => {
      scene.onWheel?.(event);
    };

    // Initial setup
    resizeCanvas();
    scene.setup?.(canvas);
    animationId = requestAnimationFrame(animate);

    // This will fire when window resizes OR when the container itself changes
    const resizeObserver = new ResizeObserver(() => {
      // requestAnimationFrame ensures smooth resize by syncing with render
      requestAnimationFrame(() => {
        resizeCanvas();
      });
    });
    resizeObserver.observe(container);

    // Add mouse event listeners
    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseup", handleMouseUp);
    canvas.addEventListener("mouseleave", handleMouseLeave);
    canvas.addEventListener("wheel", handleWheel);

    // Cleanup
    return () => {
      resizeObserver.disconnect();
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseup", handleMouseUp);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      canvas.removeEventListener("wheel", handleWheel);
      cancelAnimationFrame(animationId);
      scene.cleanup?.();
    };
  }, [scene]);

  return (
    <div ref={containerRef} className={className}>
      <canvas ref={canvasRef} />
      <SceneInfo scene={scene} />
    </div>
  );
}
