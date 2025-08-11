import { Injectable } from '@angular/core';
import Konva from 'konva';
import { DrawingStateService } from './drawing-state.service';

@Injectable({
  providedIn: 'root'
})
export class InteractionService {
  private stage: Konva.Stage | undefined;
  private layer: Konva.Layer | undefined;

  // Drag state properties
  private dragStartPos: { x: number; y: number } | null = null;
  private shapeStartPoints: Array<{x: number, y: number}> | null = null;
  private midpointDragInfo: { isHorizontal: boolean } | null = null;

  constructor(private stateSvc: DrawingStateService) { }

  public initialize(stage: Konva.Stage, layer: Konva.Layer): void {
    this.stage = stage;
    this.layer = layer;
    this.attachVertexHandlers();
    this.attachMidpointHandlers();
    this.attachLabelHandlers();
  }

  private attachVertexHandlers(): void {
    this.layer?.find('.vertex-handle').forEach((vertexHandle, i) => {
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
        const newRadiusStr = prompt('Enter corner radius:', currentRadius.toString());
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
    this.layer?.find('.midpoint-handle').forEach((midpointHandle, i) => {
      midpointHandle.on('dragstart', () => {
        this.dragStartPos = midpointHandle.position();
        const state = this.stateSvc.getState();
        const numVertices = state.vertices.length;
        const p1 = state.vertices[i];
        const p2 = state.vertices[(i + 1) % numVertices];
        this.shapeStartPoints = [p1, p2]; // Store initial points
        this.midpointDragInfo = { isHorizontal: Math.abs(p1.y - p2.y) < Math.abs(p1.x - p2.x) };
      });

      midpointHandle.on('dragmove', () => {
        if (!this.dragStartPos || !this.shapeStartPoints || !this.midpointDragInfo) return;
        const state = this.stateSvc.getState();
        const numVertices = state.vertices.length;

        let dx = midpointHandle.x() - this.dragStartPos.x;
        let dy = midpointHandle.y() - this.dragStartPos.y;

        if (this.midpointDragInfo.isHorizontal) {
          dx = 0;
        } else {
          dy = 0;
        }

        const p1_new = { x: this.shapeStartPoints[0].x + dx, y: this.shapeStartPoints[0].y + dy };
        const p2_new = { x: this.shapeStartPoints[1].x + dx, y: this.shapeStartPoints[1].y + dy };

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
        const newDepthStr = prompt('Enter segment depth:', currentDepth.toString());
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
    this.layer?.find('.segment-label').forEach((label, i) => {
      label.on('click tap', () => {
        const state = this.stateSvc.getState();
        const p1 = state.vertices[i];
        const p2 = state.vertices[(i + 1) % state.vertices.length];
        const currentLength = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const newLengthStr = prompt('Enter new length:', Math.round(currentLength).toString());
        if (newLengthStr) {
          const newLength = parseFloat(newLengthStr);
          if (!isNaN(newLength) && newLength > 0 && currentLength > 0) {
            const scaleRatio = newLength / currentLength;
            const segmentIsHorizontal = Math.abs(p1.y - p2.y) < Math.abs(p1.x - p2.x);
            this.stateSvc.scaleAll(scaleRatio, segmentIsHorizontal, state.vertices);
          }
        }
      });
    });
  }
}
