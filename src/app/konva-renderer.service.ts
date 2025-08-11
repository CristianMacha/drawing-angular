import { Injectable } from '@angular/core';
import Konva from 'konva';
import { DrawingState, DrawingStateService } from './drawing-state.service';
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
    const state = this.stateSvc.getState();

    // Create objects once
    this.layer.add(new Konva.Path({
      stroke: '#D6D3D1', strokeWidth: 2, closed: true,
      fill: 'rgba(173, 216, 230, 0.5)', name: 'shape',
    }));

    state.vertices.forEach((_, i) => {
      this.layer?.add(new Konva.Circle({
        radius: 8, fill: '#0EA5E9', stroke: '#0284C7',
        strokeWidth: 2, draggable: true, name: 'vertex-handle', id: `vertex-${i}`
      }));
      this.layer?.add(new Konva.Circle({
        radius: 6, fill: '#A3E635', draggable: true,
        name: 'midpoint-handle', id: `midpoint-${i}`
      }));
      this.layer?.add(new Konva.Text({
        fontSize: 14, fill: '#1F2937', name: 'segment-label',
        id: `segment-label-${i}`
      }));
      this.layer?.add(new Konva.Text({
        fontSize: 14, fill: '#8B5CF6', name: 'angle-label',
        id: `angle-label-${i}`
      }));
    });
  }

  public render(state: DrawingState): void {
    if (!this.layer) return;

    this.updatePath(state);
    this.updateVertexHandles(state);
    this.updateMidpointHandles(state);
    this.updateSegmentLabels(state);
    this.updateAngleLabels(state);

    this.layer.batchDraw();
  }

  private updatePath(state: DrawingState): void {
    const shape = this.layer?.findOne<Konva.Path>('.shape');
    const pathData = this.geometrySvc.generatePathData(state);
    shape?.data(pathData);
  }

  private updateVertexHandles(state: DrawingState): void {
    state.vertices.forEach((vertex, i) => {
      const handle = this.layer?.findOne<Konva.Circle>(`#vertex-${i}`);
      handle?.position(vertex);
    });
  }

  private updateMidpointHandles(state: DrawingState): void {
    const { vertices } = state;
    const numVertices = vertices.length;
    this.layer?.find<Konva.Circle>('.midpoint-handle').forEach((handle, i) => {
      const p1 = vertices[i];
      const p2 = vertices[(i + 1) % numVertices];
      handle.x((p1.x + p2.x) / 2);
      handle.y((p1.y + p2.y) / 2);
    });
  }

  private updateSegmentLabels(state: DrawingState): void {
    const { vertices, segmentDepths } = state;
    const numVertices = vertices.length;
    this.layer?.find<Konva.Text>('.segment-label').forEach((label, i) => {
      const p1 = vertices[i];
      const p2 = vertices[(i + 1) % numVertices];
      const depth = segmentDepths[i] || 0;
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
      const midpointHandle = this.layer?.findOne<Konva.Circle>(`#midpoint-${i}`);
      const midpointPos = midpointHandle?.position() || { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

      const isHorizontal = Math.abs(p1.y - p2.y) < Math.abs(p1.x - p2.x);
      const offset = 15;
      if (isHorizontal) {
        label.x(midpointPos.x - label.width() / 2);
        label.y(midpointPos.y - offset - label.height() / 2);
      } else {
        label.x(midpointPos.x + offset);
        label.y(midpointPos.y - label.height() / 2);
      }
    });
  }

  private updateAngleLabels(state: DrawingState): void {
    const { vertices } = state;
    const numVertices = vertices.length;
    this.layer?.find<Konva.Text>('.angle-label').forEach((label, i) => {
      const p_curr = vertices[i];
      const p_prev = vertices[(i - 1 + numVertices) % numVertices];
      const p_next = vertices[(i + 1) % numVertices];
      const v_a = { x: p_prev.x - p_curr.x, y: p_prev.y - p_curr.y };
      const v_b = { x: p_next.x - p_curr.x, y: p_next.y - p_curr.y };
      const l_a = Math.hypot(v_a.x, v_a.y);
      const l_b = Math.hypot(v_b.x, v_b.y);
      if (l_a === 0 || l_b === 0) { label.hide(); return; }
      const dotProduct = v_a.x * v_b.x + v_a.y * v_b.y;
      const angleRad = Math.acos(dotProduct / (l_a * l_b));
      const angleDeg = Math.round(angleRad * (180 / Math.PI));
      label.text(`${angleDeg}°`);
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
    });
  }
}
