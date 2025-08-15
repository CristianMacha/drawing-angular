import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface Shape {
  id: string;
  vertices: { x: number; y: number }[];
  cornerRadii: number[];
  segmentDepths: number[];
}

export interface DrawingState {
  shapes: Shape[];
  selectedShapeId: string | null;
}

const initialState: DrawingState = {
  shapes: [],
  selectedShapeId: null,
};


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

  private generateId(): string {
    return 'shape_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  private getSelectedShape(): Shape | null {
    const state = this.getState();
    return state.shapes.find(shape => shape.id === state.selectedShapeId) || null;
  }

  selectShape(shapeId: string | null): void {
    this.setState({ selectedShapeId: shapeId });
  }

  updateVertexPosition(index: number, position: { x: number; y: number }): void {
    const state = this.getState();
    const selectedShape = this.getSelectedShape();
    if (!selectedShape) return;

    const newVertices = [...selectedShape.vertices];
    newVertices[index] = position;
    
    const newShapes = state.shapes.map(shape => 
      shape.id === selectedShape.id 
        ? { ...shape, vertices: newVertices }
        : shape
    );
    this.setState({ shapes: newShapes });
  }

  setCornerRadius(index: number, radius: number): void {
    const state = this.getState();
    const selectedShape = this.getSelectedShape();
    if (!selectedShape) return;

    const newRadii = [...selectedShape.cornerRadii];
    newRadii[index] = radius;
    
    const newShapes = state.shapes.map(shape => 
      shape.id === selectedShape.id 
        ? { ...shape, cornerRadii: newRadii }
        : shape
    );
    this.setState({ shapes: newShapes });
  }

  setSegmentDepth(index: number, depth: number): void {
    const state = this.getState();
    const selectedShape = this.getSelectedShape();
    if (!selectedShape) return;

    const newDepths = [...selectedShape.segmentDepths];
    newDepths[index] = depth;
    
    const newShapes = state.shapes.map(shape => 
      shape.id === selectedShape.id 
        ? { ...shape, segmentDepths: newDepths }
        : shape
    );
    this.setState({ shapes: newShapes });
  }

  moveSegment(index: number, dx: number, dy: number): void {
    const state = this.getState();
    const selectedShape = this.getSelectedShape();
    if (!selectedShape) return;

    const newVertices = [...selectedShape.vertices];
    const numVertices = newVertices.length;

    const p1_index = index;
    const p2_index = (index + 1) % numVertices;

    newVertices[p1_index] = { x: newVertices[p1_index].x + dx, y: newVertices[p1_index].y + dy };
    newVertices[p2_index] = { x: newVertices[p2_index].x + dx, y: newVertices[p2_index].y + dy };

    const newShapes = state.shapes.map(shape => 
      shape.id === selectedShape.id 
        ? { ...shape, vertices: newVertices }
        : shape
    );
    this.setState({ shapes: newShapes });
  }

  scaleAll(scaleRatio: number, isHorizontal: boolean, allPoints: {x: number, y: number}[]): void {
    const state = this.getState();
    const selectedShape = this.getSelectedShape();
    if (!selectedShape) return;

    let newVertices = [...selectedShape.vertices];

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
    
    const newShapes = state.shapes.map(shape => 
      shape.id === selectedShape.id 
        ? { ...shape, vertices: newVertices }
        : shape
    );
    this.setState({ shapes: newShapes });
  }

  addNewShape(vertices: { x: number; y: number }[]): void {
    const state = this.getState();
    const newShape: Shape = {
      id: this.generateId(),
      vertices,
      cornerRadii: Array(vertices.length).fill(0),
      segmentDepths: Array(vertices.length).fill(0),
    };
    
    const newShapes = [...state.shapes, newShape];
    this.setState({ 
      shapes: newShapes,
      selectedShapeId: newShape.id
    });
  }

  deleteShape(shapeId: string): void {
    const state = this.getState();
    const newShapes = state.shapes.filter(shape => shape.id !== shapeId);
    const newSelectedId = state.selectedShapeId === shapeId ? null : state.selectedShapeId;
    this.setState({ 
      shapes: newShapes,
      selectedShapeId: newSelectedId
    });
  }

  moveShape(shapeId: string, dx: number, dy: number): void {
    const state = this.getState();
    const newShapes = state.shapes.map(shape => {
      if (shape.id === shapeId) {
        return {
          ...shape,
          vertices: shape.vertices.map(vertex => ({
            x: vertex.x + dx,
            y: vertex.y + dy
          }))
        };
      }
      return shape;
    });
    this.setState({ shapes: newShapes });
  }

  // Compatibility methods for existing code
  setNewShape(vertices: { x: number; y: number }[]): void {
    this.addNewShape(vertices);
  }
}
