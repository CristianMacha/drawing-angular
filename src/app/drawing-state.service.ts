import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface DrawingState {
  vertices: { x: number; y: number }[];
  cornerRadii: number[];
  segmentDepths: number[];
}

const initialState: DrawingState = {
  vertices: [
    { x: 200, y: 400 }, { x: 200, y: 100 }, { x: 900, y: 100 },
    { x: 900, y: 400 }, { x: 700, y: 400 }, { x: 700, y: 250 },
    { x: 350, y: 250 }, { x: 350, y: 400 },
  ],
  cornerRadii: [],
  segmentDepths: [],
};
initialState.cornerRadii = Array(initialState.vertices.length).fill(0);
initialState.segmentDepths = Array(initialState.vertices.length).fill(0);


@Injectable({
  providedIn: 'root'
})
export class DrawingStateService {
  private readonly _state = new BehaviorSubject<DrawingState>(initialState);

  readonly state$ = this._state.asObservable();

  constructor() { }

  getState(): DrawingState {
    return this._state.getValue();
  }

  private setState(state: Partial<DrawingState>): void {
    this._state.next({ ...this.getState(), ...state });
  }

  updateVertexPosition(index: number, position: { x: number; y: number }): void {
    const state = this.getState();
    const newVertices = [...state.vertices];
    newVertices[index] = position;
    this.setState({ vertices: newVertices });
  }

  setCornerRadius(index: number, radius: number): void {
    const state = this.getState();
    const newRadii = [...state.cornerRadii];
    newRadii[index] = radius;
    this.setState({ cornerRadii: newRadii });
  }

  setSegmentDepth(index: number, depth: number): void {
    const state = this.getState();
    const newDepths = [...state.segmentDepths];
    newDepths[index] = depth;
    this.setState({ segmentDepths: newDepths });
  }

  moveSegment(index: number, dx: number, dy: number): void {
    const state = this.getState();
    const newVertices = [...state.vertices];
    const numVertices = newVertices.length;

    const p1_index = index;
    const p2_index = (index + 1) % numVertices;

    newVertices[p1_index] = { x: newVertices[p1_index].x + dx, y: newVertices[p1_index].y + dy };
    newVertices[p2_index] = { x: newVertices[p2_index].x + dx, y: newVertices[p2_index].y + dy };

    this.setState({ vertices: newVertices });
  }

  scaleAll(scaleRatio: number, isHorizontal: boolean, allPoints: {x: number, y: number}[]): void {
    const state = this.getState();
    let newVertices = [...state.vertices];

    if (isHorizontal) {
      let minX = Math.min(...allPoints.map(p => p.x));
      newVertices = newVertices.map(v => ({
        ...v,
        x: minX + (v.x - minX) * scaleRatio
      }));
    } else {
      let minY = Math.min(...allPoints.map(p => p.y));
      newVertices = newVertices.map(v => ({
        ...v,
        y: minY + (v.y - minY) * scaleRatio
      }));
    }
    this.setState({ vertices: newVertices });
  }
}
