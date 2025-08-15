import { Injectable, OnDestroy } from '@angular/core';
import Konva from 'konva';
import { DrawingStateService } from './drawing-state.service';
import { GeometryService } from './geometry.service';

@Injectable({
  providedIn: 'root',
})
export class InteractionService implements OnDestroy {
  private stage: Konva.Stage | undefined;
  private layer: Konva.Layer | undefined;

  // Editing properties
  private dragStartPos: { x: number; y: number } | null = null;
  private shapeStartPoints: Array<{ x: number; y: number }> | null = null;
  private midpointDragInfo: { isHorizontal: boolean } | null = null;

  // Pipe drawing properties
  private isDrawingPipe = false;
  private pipeCenterline: { x: number; y: number }[] = [];
  private lastDirection: 'H' | 'V' | 'none' = 'none';
  private previewPipe: Konva.Line | undefined;
  private readonly PIPE_THICKNESS = 150;
  private readonly TURN_THRESHOLD = 150; // Pixels to move on the other axis to register a turn

  constructor(
    private stateSvc: DrawingStateService,
    private geometrySvc: GeometryService
  ) {}

  public initialize(stage: Konva.Stage, layer: Konva.Layer): void {
    this.stage = stage;
    this.layer = layer;
    this.updateHandlers();
    this.attachStageHandlers();
    window.addEventListener('keydown', this.handleKeyDown.bind(this));
  }

  ngOnDestroy(): void {
    window.removeEventListener('keydown', this.handleKeyDown.bind(this));
    this.previewPipe?.destroy();
  }

  public updateHandlers(): void {
    this.attachVertexHandlers();
    this.attachMidpointHandlers();
    this.attachLabelHandlers();
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && this.isDrawingPipe) {
      this.cancelDrawing();
    }
  }

  private cancelDrawing(): void {
    this.isDrawingPipe = false;
    this.pipeCenterline = [];
    this.lastDirection = 'none';
    this.previewPipe?.destroy();
    this.previewPipe = undefined;
    this.layer?.batchDraw();
  }

  private attachStageHandlers(): void {
    const stage = this.stage;
    const layer = this.layer;
    if (!stage || !layer) return;

    stage.on('mousedown touchstart', (e) => {
      if (e.target !== stage) return;
      e.evt.preventDefault();

      this.isDrawingPipe = true;
      const pos = stage.getPointerPosition();
      if (!pos) return;

      this.pipeCenterline = [pos];
      this.lastDirection = 'none';

      this.previewPipe = new Konva.Line({
        fill: 'rgba(173, 216, 230, 0.5)',
        stroke: '#D6D3D1',
        strokeWidth: 2,
        closed: true,
      });
      layer.add(this.previewPipe);
    });

    stage.on('mousemove touchmove', (e) => {
      if (!this.isDrawingPipe) return;
      e.evt.preventDefault();

      const mousePos = stage.getPointerPosition();
      if (!mousePos) return;

      const anchorPoint = this.pipeCenterline[this.pipeCenterline.length - 1];
      if (!anchorPoint) return;

      const dx = mousePos.x - anchorPoint.x;
      const dy = mousePos.y - anchorPoint.y;

      let currentDirection: 'H' | 'V' = Math.abs(dx) > Math.abs(dy) ? 'H' : 'V';
      if (this.lastDirection === 'none') {
        this.lastDirection = currentDirection;
      }

      let endPoint: { x: number; y: number };
      if (this.lastDirection === 'V') {
        endPoint = { x: anchorPoint.x, y: mousePos.y };
        if (Math.abs(dx) > this.TURN_THRESHOLD) {
          if (endPoint.x !== anchorPoint.x || endPoint.y !== anchorPoint.y) {
            this.pipeCenterline.push(endPoint);
          }
          this.lastDirection = 'H';
        }
      } else {
        // 'H'
        endPoint = { x: mousePos.x, y: anchorPoint.y };
        if (Math.abs(dy) > this.TURN_THRESHOLD) {
          if (endPoint.x !== anchorPoint.x || endPoint.y !== anchorPoint.y) {
            this.pipeCenterline.push(endPoint);
          }
          this.lastDirection = 'V';
        }
      }

      const dist = Math.hypot(
        endPoint.x - anchorPoint.x,
        endPoint.y - anchorPoint.y
      );
      if (dist < 5) {
        this.previewPipe?.points([]);
        layer.batchDraw();
        return;
      }

      const previewPath = [...this.pipeCenterline, endPoint];
      const vertices = this.geometrySvc.generateOrthogonalPipeVertices(
        previewPath,
        this.PIPE_THICKNESS
      );
      const flatPoints = vertices.flatMap((p) => [p.x, p.y]);

      if (this.previewPipe) {
        this.previewPipe.points(flatPoints);
      }
      layer.batchDraw();
    });

    stage.on('mouseup touchend', (e) => {
      if (!this.isDrawingPipe) return;
      e.evt.preventDefault();

      const finalPath = this.previewPipe?.points() || [];
      const finalVertices = [];
      for (let i = 0; i < finalPath.length; i += 2) {
        finalVertices.push({ x: finalPath[i], y: finalPath[i + 1] });
      }

      if (finalVertices.length > 3) {
        this.stateSvc.setNewShape(finalVertices);
      }
      this.cancelDrawing();
    });
  }

  private attachVertexHandlers(): void {
    const layer = this.layer;
    if (!layer) return;

    layer.find('.vertex-handle').forEach((vertexHandle, i) => {
      vertexHandle.off('dragstart dragmove dragend click contextmenu');
      vertexHandle.on('dragstart', () => {
        this.dragStartPos = vertexHandle.position();
      });

      vertexHandle.on('dragmove', () => {
        if (!this.dragStartPos) return;
        const newX = vertexHandle.x();
        const newY = vertexHandle.y();
        const dx = Math.abs(newX - this.dragStartPos.x);
        const dy = Math.abs(newY - this.dragStartPos.y);

        let constrainedPos = { x: newX, y: newY };
        if (dx > dy) {
          constrainedPos.y = this.dragStartPos.y;
        } else {
          constrainedPos.x = this.dragStartPos.x;
        }
        vertexHandle.position(constrainedPos);
        this.stateSvc.updateVertexPosition(i, constrainedPos);
      });

      vertexHandle.on('dragend', () => {
        this.dragStartPos = null;
      });

      const eventListener = (evt: Konva.KonvaEventObject<MouseEvent>) => {
        evt.evt.preventDefault();
        const state = this.stateSvc.getState();
        const currentRadius = state.cornerRadii[i] || 0;
        const newRadiusStr = prompt(
          'Enter corner radius:',
          currentRadius.toString()
        );
        if (newRadiusStr) {
          const newRadius = parseFloat(newRadiusStr);
          if (!isNaN(newRadius) && newRadius >= 0) {
            this.stateSvc.setCornerRadius(i, newRadius);
          }
        }
      };
      vertexHandle.on('click', eventListener);
      vertexHandle.on('contextmenu', eventListener);
    });
  }

  private attachMidpointHandlers(): void {
    const layer = this.layer;
    if (!layer) return;

    layer.find('.midpoint-handle').forEach((midpointHandle, i) => {
      midpointHandle.off('dragstart dragmove dragend click contextmenu');
      midpointHandle.on('dragstart', () => {
        this.dragStartPos = midpointHandle.position();
        const state = this.stateSvc.getState();
        const numVertices = state.vertices.length;
        const p1 = state.vertices[i];
        const p2 = state.vertices[(i + 1) % numVertices];
        this.shapeStartPoints = [p1, p2];
        this.midpointDragInfo = {
          isHorizontal: Math.abs(p1.y - p2.y) < Math.abs(p1.x - p2.x),
        };
      });

      midpointHandle.on('dragmove', () => {
        if (
          !this.dragStartPos ||
          !this.shapeStartPoints ||
          !this.midpointDragInfo
        )
          return;
        const state = this.stateSvc.getState();
        const numVertices = state.vertices.length;

        let dx = midpointHandle.x() - this.dragStartPos.x;
        let dy = midpointHandle.y() - this.dragStartPos.y;

        if (this.midpointDragInfo.isHorizontal) {
          dx = 0;
        } else {
          dy = 0;
        }

        const p1_new = {
          x: this.shapeStartPoints[0].x + dx,
          y: this.shapeStartPoints[0].y + dy,
        };
        const p2_new = {
          x: this.shapeStartPoints[1].x + dx,
          y: this.shapeStartPoints[1].y + dy,
        };

        this.stateSvc.updateVertexPosition(i, p1_new);
        this.stateSvc.updateVertexPosition((i + 1) % numVertices, p2_new);
      });

      midpointHandle.on('dragend', () => {
        this.dragStartPos = null;
        this.shapeStartPoints = null;
        this.midpointDragInfo = null;
      });

      const eventListener = (evt: Konva.KonvaEventObject<MouseEvent>) => {
        evt.evt.preventDefault();
        const state = this.stateSvc.getState();
        const p1 = state.vertices[i];
        const p2 = state.vertices[(i + 1) % state.vertices.length];
        const chord = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const currentDepth = state.segmentDepths[i] || 0;
        const newDepthStr = prompt(
          'Enter segment depth:',
          currentDepth.toString()
        );
        if (newDepthStr) {
          let newDepth = parseFloat(newDepthStr);
          if (!isNaN(newDepth)) {
            newDepth = Math.max(-chord, Math.min(chord, newDepth));
            this.stateSvc.setSegmentDepth(i, newDepth);
          }
        }
      };
      midpointHandle.on('click', eventListener);
      midpointHandle.on('contextmenu', eventListener);
    });
  }

  private attachLabelHandlers(): void {
    const layer = this.layer;
    if (!layer) return;

    layer.find('.segment-label').forEach((label, i) => {
      label.off('click tap');
      label.on('click tap', () => {
        const state = this.stateSvc.getState();
        const p1 = state.vertices[i];
        const p2 = state.vertices[(i + 1) % state.vertices.length];
        const currentLength = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const newLengthStr = prompt(
          'Enter new length:',
          Math.round(currentLength).toString()
        );
        if (newLengthStr) {
          const newLength = parseFloat(newLengthStr);
          if (!isNaN(newLength) && newLength > 0 && currentLength > 0) {
            const scaleRatio = newLength / currentLength;
            const segmentIsHorizontal =
              Math.abs(p1.y - p2.y) < Math.abs(p1.x - p2.x);
            this.stateSvc.scaleAll(
              scaleRatio,
              segmentIsHorizontal,
              state.vertices
            );
          }
        }
      });
    });
  }
}
