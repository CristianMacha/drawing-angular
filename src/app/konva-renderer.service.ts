import { Injectable } from '@angular/core';
import Konva from 'konva';
import { DrawingState, DrawingStateService, Shape } from './drawing-state.service';
import { GeometryService } from './geometry.service';

@Injectable({
  providedIn: 'root'
})
export class KonvaRendererService {
  private layer: Konva.Layer | undefined;

  constructor(
    private stateSvc: DrawingStateService,
    private geometrySvc: GeometryService
  ) { }

  public initialize(layer: Konva.Layer): void {
    this.layer = layer;
  }

  public render(state: DrawingState): void {
    if (!this.layer) return;

    // Clear all existing shapes and handles
    this.layer.find('.shape, .vertex-handle, .midpoint-handle, .segment-label, .angle-label').forEach(node => node.destroy());

    // Render all shapes
    state.shapes.forEach(shape => {
      this.renderShape(shape, state.selectedShapeId === shape.id);
    });

    this.layer.batchDraw();
  }

  public attachEventHandlers(interactionService: any): void {
    interactionService.updateHandlers();
  }

  private renderShape(shape: Shape, isSelected: boolean): void {
    if (!this.layer) return;

    const numVertices = shape.vertices.length;
    if (numVertices === 0) return;

    // Create the shape path
    const pathData = this.geometrySvc.generatePathData(shape);
    const shapePath = new Konva.Path({
      data: pathData,
      stroke: isSelected ? '#0EA5E9' : '#D6D3D1',
      strokeWidth: isSelected ? 3 : 2,
      closed: true,
      fill: isSelected ? 'rgba(14, 165, 233, 0.2)' : 'rgba(173, 216, 230, 0.5)',
      name: 'shape',
      id: `shape-${shape.id}`,
      shapeId: shape.id,
    });
    this.layer.add(shapePath);

    // Show handles only for selected shape, but always show labels
    if (isSelected) {
      this.renderShapeHandles(shape);
    } else {
      // For non-selected shapes, show only the segment labels
      this.renderShapeLabels(shape);
    }
  }

  private renderShapeHandles(shape: Shape): void {
    if (!this.layer) return;

    const numVertices = shape.vertices.length;

    // Create vertex handles
    for (let i = 0; i < numVertices; i++) {
      const vertex = shape.vertices[i];
      
      const vertexHandle = new Konva.Circle({
        x: vertex.x,
        y: vertex.y,
        radius: 8,
        fill: '#0EA5E9',
        stroke: '#0284C7',
        strokeWidth: 2,
        draggable: true,
        name: 'vertex-handle',
        id: `vertex-${shape.id}-${i}`,
        shapeId: shape.id,
        vertexIndex: i,
      });
      this.layer.add(vertexHandle);

      // Create midpoint handle
      const nextVertex = shape.vertices[(i + 1) % numVertices];
      const midpointHandle = new Konva.Circle({
        x: (vertex.x + nextVertex.x) / 2,
        y: (vertex.y + nextVertex.y) / 2,
        radius: 6,
        fill: '#A3E635',
        draggable: true,
        name: 'midpoint-handle',
        id: `midpoint-${shape.id}-${i}`,
        shapeId: shape.id,
        segmentIndex: i,
      });
      this.layer.add(midpointHandle);

      // Create segment label
      const segmentLabel = new Konva.Text({
        fontSize: 14,
        fill: '#1F2937',
        name: 'segment-label',
        id: `segment-label-${shape.id}-${i}`,
        shapeId: shape.id,
        segmentIndex: i,
      });
      this.updateSegmentLabel(segmentLabel, shape, i);
      this.layer.add(segmentLabel);

      // Create angle label
      const angleLabel = new Konva.Text({
        fontSize: 14,
        fill: '#8B5CF6',
        name: 'angle-label',
        id: `angle-label-${shape.id}-${i}`,
        shapeId: shape.id,
        vertexIndex: i,
      });
      this.updateAngleLabel(angleLabel, shape, i);
      this.layer.add(angleLabel);
    }
  }

  private renderShapeLabels(shape: Shape): void {
    if (!this.layer) return;

    const numVertices = shape.vertices.length;

    // Create only segment labels for non-selected shapes
    for (let i = 0; i < numVertices; i++) {
      const segmentLabel = new Konva.Text({
        fontSize: 12,
        fill: '#6B7280',
        fontStyle: 'normal',
        name: 'segment-label',
        id: `segment-label-${shape.id}-${i}`,
        shapeId: shape.id,
        segmentIndex: i,
      });
      this.updateSegmentLabel(segmentLabel, shape, i);
      this.layer.add(segmentLabel);
    }
  }

  private updateSegmentLabel(label: Konva.Text, shape: Shape, segmentIndex: number): void {
    const { vertices, segmentDepths } = shape;
    const numVertices = vertices.length;
    const p1 = vertices[segmentIndex];
    const p2 = vertices[(segmentIndex + 1) % numVertices];
    const depth = segmentDepths[segmentIndex] || 0;
    const chord = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    let length = chord;

    if (Math.abs(depth) > 0.1 && chord > 0) {
      const radius = (depth * depth + (chord / 2) * (chord / 2)) / (2 * depth);
      if (radius > chord / 2) {
        const angle = 2 * Math.asin((chord / 2) / Math.abs(radius));
        length = Math.abs(radius * angle);
      }
    }

    label.text(`${Math.round(length)}px`);
    const midpointPos = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

    const isHorizontal = Math.abs(p1.y - p2.y) < Math.abs(p1.x - p2.x);
    const offset = 15;
    if (isHorizontal) {
      label.x(midpointPos.x - label.width() / 2);
      label.y(midpointPos.y - offset - label.height() / 2);
    } else {
      label.x(midpointPos.x + offset);
      label.y(midpointPos.y - label.height() / 2);
    }
  }

  private updateAngleLabel(label: Konva.Text, shape: Shape, vertexIndex: number): void {
    const { vertices } = shape;
    const numVertices = vertices.length;
    const p_curr = vertices[vertexIndex];
    const p_prev = vertices[(vertexIndex - 1 + numVertices) % numVertices];
    const p_next = vertices[(vertexIndex + 1) % numVertices];
    const v_a = { x: p_prev.x - p_curr.x, y: p_prev.y - p_curr.y };
    const v_b = { x: p_next.x - p_curr.x, y: p_next.y - p_curr.y };
    const l_a = Math.hypot(v_a.x, v_a.y);
    const l_b = Math.hypot(v_b.x, v_b.y);
    if (l_a === 0 || l_b === 0) { label.hide(); return; }
    const dotProduct = v_a.x * v_b.x + v_a.y * v_b.y;
    const cosValue = Math.max(-1, Math.min(1, dotProduct / (l_a * l_b)));
    const angleRad = Math.acos(cosValue);
    const angleDeg = angleRad * (180 / Math.PI);
    label.text(`${angleDeg.toFixed(1)}°`);
    const norm_a = { x: v_a.x / l_a, y: v_a.y / l_a };
    const norm_b = { x: v_b.x / l_b, y: v_b.y / l_b };
    const bisector = { x: norm_a.x + norm_b.x, y: norm_a.y + norm_b.y };
    const l_bi = Math.hypot(bisector.x, bisector.y);
    if (l_bi === 0) { label.hide(); return; }
    const norm_bi = { x: bisector.x / l_bi, y: bisector.y / l_bi };
    const offset = 25;
    label.x(p_curr.x + norm_bi.x * offset);
    label.y(p_curr.y + norm_bi.y * offset);
    label.offsetX(label.width() / 2);
    label.offsetY(label.height() / 2);
    label.show();
  }
}
