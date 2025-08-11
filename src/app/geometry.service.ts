import { Injectable } from '@angular/core';
import { DrawingState } from './drawing-state.service';

@Injectable({
  providedIn: 'root'
})
export class GeometryService {
  constructor() { }

  public generatePathData(state: DrawingState): string {
    const { vertices, cornerRadii, segmentDepths } = state;
    if (!vertices || vertices.length < 2) return '';

    const numVertices = vertices.length;

    const arcPoints = vertices.map((p_curr, i) => {
      const p_prev = vertices[(i - 1 + numVertices) % numVertices];
      const p_next = vertices[(i + 1) % numVertices];
      const radius = cornerRadii[i] || 0;

      const v_prev = { x: p_prev.x - p_curr.x, y: p_prev.y - p_curr.y };
      const v_next = { x: p_next.x - p_curr.x, y: p_next.y - p_curr.y };
      const l_prev = Math.hypot(v_prev.x, v_prev.y);
      const l_next = Math.hypot(v_next.x, v_next.y);

      if (l_prev === 0 || l_next === 0) {
        return { p_arc_start: p_curr, p_arc_end: p_curr, radius: 0 };
      }

      const angle = Math.acos(
        (v_prev.x * v_next.x + v_prev.y * v_next.y) / (l_prev * l_next)
      );
      const tanHalfAngle = Math.tan(angle / 2);

      const dist = Math.min(radius / tanHalfAngle, l_prev / 2, l_next / 2);
      const actualRadius = dist * tanHalfAngle;

      if (actualRadius < 0.1) {
        return { p_arc_start: p_curr, p_arc_end: p_curr, radius: 0 };
      }

      const p_arc_start = {
        x: p_curr.x + (v_prev.x / l_prev) * dist,
        y: p_curr.y + (v_prev.y / l_prev) * dist,
      };
      const p_arc_end = {
        x: p_curr.x + (v_next.x / l_next) * dist,
        y: p_curr.y + (v_next.y / l_next) * dist,
      };

      return { p_arc_start, p_arc_end, radius: actualRadius };
    });

    let path = `M ${arcPoints[numVertices - 1].p_arc_end.x} ${arcPoints[numVertices - 1].p_arc_end.y}`;

    for (let i = 0; i < numVertices; i++) {
      const prevArc = arcPoints[(i - 1 + numVertices) % numVertices];
      const currentArc = arcPoints[i];

      const startPoint = prevArc.p_arc_end;
      const endPoint = currentArc.p_arc_start;
      const depth = segmentDepths[(i - 1 + numVertices) % numVertices] || 0;

      if (Math.abs(depth) < 0.1) {
        path += ` L ${endPoint.x} ${endPoint.y}`;
      } else {
        const chord = Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y);
        if (chord > 0) {
          const radius = (depth * depth + (chord / 2) * (chord / 2)) / (2 * depth);
          const sweepFlag = depth > 0 ? 1 : 0;
          path += ` A ${Math.abs(radius)} ${Math.abs(radius)} 0 0 ${sweepFlag} ${endPoint.x} ${endPoint.y}`;
        }
      }

      if (currentArc.radius > 0) {
        path += ` A ${currentArc.radius} ${currentArc.radius} 0 0 1 ${currentArc.p_arc_end.x} ${currentArc.p_arc_end.y}`;
      }
    }

    return path;
  }
}
