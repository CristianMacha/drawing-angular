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
  
  // Shape moving properties
  private isDraggingShape = false;
  private draggedShapeId: string | null = null;
  private shapeDragStartPos: { x: number; y: number } | null = null;

  // Pipe drawing properties
  private isDrawingPipe = false;
  private pipeCenterline: { x: number; y: number }[] = [];
  private lastDirection: 'H' | 'V' | 'none' = 'none';
  private previewPipe: Konva.Line | undefined;
  private previewLabels: Konva.Text[] = [];
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
    this.previewLabels.forEach(label => label.destroy());
    // Clean up other event listeners would be handled by Konva when stage is destroyed
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
    this.previewLabels.forEach(label => label.destroy());
    this.previewLabels = [];
    this.layer?.batchDraw();
  }

  private attachStageHandlers(): void {
    const stage = this.stage;
    const layer = this.layer;
    if (!stage || !layer) return;

    stage.on('mousedown touchstart', (e) => {
      // Check if clicked on handles (vertex or midpoint) - let them handle themselves
      if (e.target.hasName && (e.target.hasName('vertex-handle') || e.target.hasName('midpoint-handle') || e.target.hasName('segment-label'))) {
        return; // Let the handle event handlers take care of this
      }
      
      // Check if clicked on a shape
      if (e.target.hasName && e.target.hasName('shape')) {
        const shapeId = e.target.getAttr('shapeId');
        if (shapeId) {
          this.stateSvc.selectShape(shapeId);
          
          // Check if Alt key is pressed for moving the shape
          if (e.evt.altKey) {
            this.isDraggingShape = true;
            this.draggedShapeId = shapeId;
            this.shapeDragStartPos = stage.getPointerPosition();
            stage.container().style.cursor = 'grabbing';
            return;
          }
          return;
        }
      }
      
      if (e.target !== stage) return;
      
      // Prevent drawing when Alt/Option key is pressed
      if (e.evt.altKey) return;
      
      e.evt.preventDefault();
      
      // Deselect current shape when clicking on empty area
      this.stateSvc.selectShape(null);

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
      // Handle shape dragging
      if (this.isDraggingShape && this.draggedShapeId && this.shapeDragStartPos) {
        const currentPos = stage.getPointerPosition();
        if (!currentPos) return;
        
        const dx = currentPos.x - this.shapeDragStartPos.x;
        const dy = currentPos.y - this.shapeDragStartPos.y;
        
        this.stateSvc.moveShape(this.draggedShapeId, dx, dy);
        this.shapeDragStartPos = currentPos;
        return;
      }
      
      if (!this.isDrawingPipe) return;
      
      // Stop drawing if Alt key is pressed during drawing
      if (e.evt.altKey) {
        this.cancelDrawing();
        return;
      }
      
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
      
      // Check if we need to add a turn point
      let shouldAddTurnPoint = false;
      
      if (this.lastDirection === 'V') {
        endPoint = { x: anchorPoint.x, y: mousePos.y };
        if (Math.abs(dx) > this.TURN_THRESHOLD) {
          // Add the vertical segment endpoint before changing direction
          const turnPoint = { x: anchorPoint.x, y: mousePos.y };
          if (turnPoint.x !== anchorPoint.x || turnPoint.y !== anchorPoint.y) {
            this.pipeCenterline.push(turnPoint);
          }
          // Now continue horizontally from the turn point
          endPoint = { x: mousePos.x, y: mousePos.y };
          this.lastDirection = 'H';
        }
      } else {
        // 'H'
        endPoint = { x: mousePos.x, y: anchorPoint.y };
        if (Math.abs(dy) > this.TURN_THRESHOLD) {
          // Add the horizontal segment endpoint before changing direction
          const turnPoint = { x: mousePos.x, y: anchorPoint.y };
          if (turnPoint.x !== anchorPoint.x || turnPoint.y !== anchorPoint.y) {
            this.pipeCenterline.push(turnPoint);
          }
          // Now continue vertically from the turn point
          endPoint = { x: mousePos.x, y: mousePos.y };
          this.lastDirection = 'V';
        }
      }

      // Use the last point in the centerline as the reference for distance calculation
      const lastPoint = this.pipeCenterline[this.pipeCenterline.length - 1];
      const dist = Math.hypot(
        endPoint.x - lastPoint.x,
        endPoint.y - lastPoint.y
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
      
      // Update preview labels
      this.updatePreviewLabels(previewPath);
      
      layer.batchDraw();
    });

    stage.on('mouseup touchend', (e) => {
      // Handle end of shape dragging
      if (this.isDraggingShape) {
        this.isDraggingShape = false;
        this.draggedShapeId = null;
        this.shapeDragStartPos = null;
        stage.container().style.cursor = 'default';
        return;
      }
      
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

    // Add mouseover and mouseout events for visual feedback
    stage.on('mouseover', (e) => {
      if (e.target.hasName && e.target.hasName('shape')) {
        if (e.evt.altKey) {
          stage.container().style.cursor = 'grab';
        } else {
          stage.container().style.cursor = 'pointer';
        }
      }
    });

    stage.on('mouseout', (e) => {
      if (e.target.hasName && e.target.hasName('shape')) {
        if (!this.isDraggingShape) {
          stage.container().style.cursor = 'default';
        }
      }
    });

    // Listen for Alt key changes
    window.addEventListener('keydown', (e) => {
      if (e.altKey && !this.isDraggingShape) {
        // Cancel drawing if Alt is pressed while drawing
        if (this.isDrawingPipe) {
          this.cancelDrawing();
        }
        
        const target = stage.getIntersection(stage.getPointerPosition() || { x: 0, y: 0 });
        if (target && target.hasName && target.hasName('shape')) {
          stage.container().style.cursor = 'grab';
        } else {
          stage.container().style.cursor = 'not-allowed';
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.key === 'Alt' && !this.isDraggingShape) {
        const target = stage.getIntersection(stage.getPointerPosition() || { x: 0, y: 0 });
        if (target && target.hasName && target.hasName('shape')) {
          stage.container().style.cursor = 'pointer';
        } else {
          stage.container().style.cursor = 'default';
        }
      }
    });
  }

  private updatePreviewLabels(centerlinePath: { x: number; y: number }[]): void {
    if (!this.layer) return;

    // Clear existing preview labels
    this.previewLabels.forEach(label => label.destroy());
    this.previewLabels = [];

    // Create labels for each segment
    for (let i = 0; i < centerlinePath.length - 1; i++) {
      const p1 = centerlinePath[i];
      const p2 = centerlinePath[i + 1];
      const length = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      
      if (length < 10) continue; // Skip very short segments
      
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      const isHorizontal = Math.abs(p1.y - p2.y) < Math.abs(p1.x - p2.x);
      
      const label = new Konva.Text({
        x: midX,
        y: midY,
        text: `${Math.round(length)}px`,
        fontSize: 14,
        fill: '#10B981',
        fontStyle: 'bold',
      });
      
      // Position label offset from the line
      const offset = 20;
      if (isHorizontal) {
        label.offsetX(label.width() / 2);
        label.y(midY - offset);
      } else {
        label.x(midX + offset);
        label.offsetY(label.height() / 2);
      }
      
      this.previewLabels.push(label);
      this.layer.add(label);
    }
  }

  private updateSegmentLabelForShape(label: any, shape: any, segmentIndex: number): void {
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

  private updateAngleLabelForShape(label: any, shape: any, vertexIndex: number): void {
    const { vertices } = shape;
    const numVertices = vertices.length;
    const p_curr = vertices[vertexIndex];
    const p_prev = vertices[(vertexIndex - 1 + numVertices) % numVertices];
    const p_next = vertices[(vertexIndex + 1) % numVertices];
    const v_a = { x: p_prev.x - p_curr.x, y: p_prev.y - p_curr.y };
    const v_b = { x: p_next.x - p_curr.x, y: p_next.y - p_curr.y };
    const l_a = Math.hypot(v_a.x, v_a.y);
    const l_b = Math.hypot(v_b.x, v_b.y);
    if (l_a === 0 || l_b === 0) { 
      label.hide(); 
      return; 
    }
    const dotProduct = v_a.x * v_b.x + v_a.y * v_b.y;
    const cosValue = Math.max(-1, Math.min(1, dotProduct / (l_a * l_b)));
    const angleRad = Math.acos(cosValue);
    const angleDeg = angleRad * (180 / Math.PI);
    label.text(`${angleDeg.toFixed(1)}°`);
    const norm_a = { x: v_a.x / l_a, y: v_a.y / l_a };
    const norm_b = { x: v_b.x / l_b, y: v_b.y / l_b };
    const bisector = { x: norm_a.x + norm_b.x, y: norm_a.y + norm_b.y };
    const l_bi = Math.hypot(bisector.x, bisector.y);
    if (l_bi === 0) { 
      label.hide(); 
      return; 
    }
    const norm_bi = { x: bisector.x / l_bi, y: bisector.y / l_bi };
    const offset = 25;
    label.x(p_curr.x + norm_bi.x * offset);
    label.y(p_curr.y + norm_bi.y * offset);
    label.offsetX(label.width() / 2);
    label.offsetY(label.height() / 2);
    label.show();
  }

  private attachVertexHandlers(): void {
    const layer = this.layer;
    if (!layer) return;

    const handles = layer.find('.vertex-handle');
    
    handles.forEach((vertexHandle) => {
      vertexHandle.off('dragstart dragmove dragend click contextmenu');
      
      const shapeId = vertexHandle.getAttr('shapeId');
      const vertexIndex = vertexHandle.getAttr('vertexIndex');
      
      vertexHandle.on('dragstart', () => {
        this.dragStartPos = vertexHandle.position();
        // Don't change selection during drag - this causes re-render that breaks drag
        // The shape should already be selected when handles are visible
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
        
        // Don't update state during drag - this causes re-renders that break the drag
        // Instead, update the shape data directly and update the visual path
        const state = this.stateSvc.getState();
        const selectedShape = state.shapes.find(s => s.id === shapeId);
        if (selectedShape && this.layer) {
          // Update vertex in memory
          selectedShape.vertices[vertexIndex] = constrainedPos;
          
          // Update the visual path immediately
          const shapePath = this.layer.findOne<Konva.Path>(`#shape-${shapeId}`);
          if (shapePath) {
            const newPathData = this.geometrySvc.generatePathData(selectedShape);
            shapePath.data(newPathData);
          }
          
          // Update other vertex handles positions
          selectedShape.vertices.forEach((vertex, i) => {
            if (i !== vertexIndex) { // Don't update the handle being dragged
              const handle = this.layer?.findOne(`#vertex-${shapeId}-${i}`);
              if (handle) {
                handle.position(vertex);
              }
            }
          });
          
          // Update midpoint handles positions
          const numVertices = selectedShape.vertices.length;
          for (let i = 0; i < numVertices; i++) {
            const p1 = selectedShape.vertices[i];
            const p2 = selectedShape.vertices[(i + 1) % numVertices];
            const midpointHandle = this.layer?.findOne(`#midpoint-${shapeId}-${i}`);
            if (midpointHandle) {
              midpointHandle.position({ x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 });
            }
          }
          
          // Update segment labels
          for (let i = 0; i < numVertices; i++) {
            const label = this.layer?.findOne(`#segment-label-${shapeId}-${i}`);
            if (label) {
              this.updateSegmentLabelForShape(label, selectedShape, i);
            }
          }
          
          // Update angle labels
          for (let i = 0; i < numVertices; i++) {
            const angleLabel = this.layer?.findOne(`#angle-label-${shapeId}-${i}`);
            if (angleLabel) {
              this.updateAngleLabelForShape(angleLabel, selectedShape, i);
            }
          }
          
          this.layer.batchDraw();
        }
      });

      vertexHandle.on('dragend', () => {
        this.dragStartPos = null;
        
        // Now update the state to persist the change
        const finalPos = vertexHandle.position();
        this.stateSvc.updateVertexPosition(vertexIndex, finalPos);
      });

      const eventListener = (evt: Konva.KonvaEventObject<MouseEvent>) => {
        evt.evt.preventDefault();
        const state = this.stateSvc.getState();
        const selectedShape = state.shapes.find(s => s.id === state.selectedShapeId);
        if (!selectedShape) return;
        
        const currentRadius = selectedShape.cornerRadii[vertexIndex] || 0;
        const newRadiusStr = prompt(
          'Enter corner radius:',
          currentRadius.toString()
        );
        if (newRadiusStr) {
          const newRadius = parseFloat(newRadiusStr);
          if (!isNaN(newRadius) && newRadius >= 0) {
            this.stateSvc.setCornerRadius(vertexIndex, newRadius);
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

    layer.find('.midpoint-handle').forEach((midpointHandle) => {
      midpointHandle.off('dragstart dragmove dragend click contextmenu');
      
      const shapeId = midpointHandle.getAttr('shapeId');
      const segmentIndex = midpointHandle.getAttr('segmentIndex');
      
      midpointHandle.on('dragstart', () => {
        this.dragStartPos = midpointHandle.position();
        // Don't change selection during drag
        
        const state = this.stateSvc.getState();
        const selectedShape = state.shapes.find(s => s.id === state.selectedShapeId);
        if (!selectedShape) return;
        
        const numVertices = selectedShape.vertices.length;
        const p1 = selectedShape.vertices[segmentIndex];
        const p2 = selectedShape.vertices[(segmentIndex + 1) % numVertices];
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
        const selectedShape = state.shapes.find(s => s.id === state.selectedShapeId);
        if (!selectedShape) return;
        
        const numVertices = selectedShape.vertices.length;

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

        // Don't update state during drag - update shape data directly
        selectedShape.vertices[segmentIndex] = p1_new;
        selectedShape.vertices[(segmentIndex + 1) % numVertices] = p2_new;
        
        // Update the visual path immediately
        if (this.layer) {
          const shapePath = this.layer.findOne<Konva.Path>(`#shape-${shapeId}`);
          if (shapePath) {
            const newPathData = this.geometrySvc.generatePathData(selectedShape);
            shapePath.data(newPathData);
          }
          
          // Update vertex handles positions
          selectedShape.vertices.forEach((vertex, i) => {
            const handle = this.layer?.findOne(`#vertex-${shapeId}-${i}`);
            if (handle) {
              handle.position(vertex);
            }
          });
          
          // Update other midpoint handles positions
          for (let i = 0; i < numVertices; i++) {
            const p1 = selectedShape.vertices[i];
            const p2 = selectedShape.vertices[(i + 1) % numVertices];
            const midHandle = this.layer?.findOne(`#midpoint-${shapeId}-${i}`);
            if (midHandle) {
              midHandle.position({ x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 });
            }
          }
          
          // Update segment labels
          for (let i = 0; i < numVertices; i++) {
            const label = this.layer?.findOne(`#segment-label-${shapeId}-${i}`);
            if (label) {
              this.updateSegmentLabelForShape(label, selectedShape, i);
            }
          }
          
          // Update angle labels
          for (let i = 0; i < numVertices; i++) {
            const angleLabel = this.layer?.findOne(`#angle-label-${shapeId}-${i}`);
            if (angleLabel) {
              this.updateAngleLabelForShape(angleLabel, selectedShape, i);
            }
          }
          
          this.layer.batchDraw();
        }
      });

      midpointHandle.on('dragend', () => {
        
        // Publish final state
        if (this.shapeStartPoints && this.midpointDragInfo) {
          const finalDx = midpointHandle.x() - (this.dragStartPos?.x || 0);
          const finalDy = midpointHandle.y() - (this.dragStartPos?.y || 0);
          
          let dx = finalDx;
          let dy = finalDy;
          
          if (this.midpointDragInfo.isHorizontal) {
            dx = 0;
          } else {
            dy = 0;
          }
          
          const p1_final = {
            x: this.shapeStartPoints[0].x + dx,
            y: this.shapeStartPoints[0].y + dy,
          };
          const p2_final = {
            x: this.shapeStartPoints[1].x + dx,
            y: this.shapeStartPoints[1].y + dy,
          };
          
          const state = this.stateSvc.getState();
          const selectedShape = state.shapes.find(s => s.id === shapeId);
          if (selectedShape) {
            const numVertices = selectedShape.vertices.length;
            this.stateSvc.updateVertexPosition(segmentIndex, p1_final);
            this.stateSvc.updateVertexPosition((segmentIndex + 1) % numVertices, p2_final);
          }
        }
        
        this.dragStartPos = null;
        this.shapeStartPoints = null;
        this.midpointDragInfo = null;
      });

      const eventListener = (evt: Konva.KonvaEventObject<MouseEvent>) => {
        evt.evt.preventDefault();
        const state = this.stateSvc.getState();
        const selectedShape = state.shapes.find(s => s.id === state.selectedShapeId);
        if (!selectedShape) return;
        
        const p1 = selectedShape.vertices[segmentIndex];
        const p2 = selectedShape.vertices[(segmentIndex + 1) % selectedShape.vertices.length];
        const chord = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const currentDepth = selectedShape.segmentDepths[segmentIndex] || 0;
        const newDepthStr = prompt(
          'Enter segment depth:',
          currentDepth.toString()
        );
        if (newDepthStr) {
          let newDepth = parseFloat(newDepthStr);
          if (!isNaN(newDepth)) {
            newDepth = Math.max(-chord, Math.min(chord, newDepth));
            this.stateSvc.setSegmentDepth(segmentIndex, newDepth);
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

    layer.find('.segment-label').forEach((label) => {
      label.off('click tap');
      
      const shapeId = label.getAttr('shapeId');
      const segmentIndex = label.getAttr('segmentIndex');
      
      label.on('click tap', () => {
        this.stateSvc.selectShape(shapeId);
        
        const state = this.stateSvc.getState();
        const selectedShape = state.shapes.find(s => s.id === state.selectedShapeId);
        if (!selectedShape) return;
        
        const p1 = selectedShape.vertices[segmentIndex];
        const p2 = selectedShape.vertices[(segmentIndex + 1) % selectedShape.vertices.length];
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
              selectedShape.vertices
            );
          }
        }
      });
    });
  }
}
