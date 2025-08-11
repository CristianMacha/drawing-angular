import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import Konva from 'konva';
import { Subscription } from 'rxjs';
import { DrawingStateService } from './drawing-state.service';
import { InteractionService } from './interaction.service';
import { KonvaRendererService } from './konva-renderer.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent implements AfterViewInit, OnDestroy {
  @ViewChild('drawing') drawingElement: ElementRef | undefined;

  private stage: Konva.Stage | undefined;
  private layer: Konva.Layer | undefined;
  private stateSubscription: Subscription | undefined;

  constructor(
    private stateSvc: DrawingStateService,
    private rendererSvc: KonvaRendererService,
    private interactionSvc: InteractionService
  ) {}

  ngAfterViewInit(): void {
    if (!this.drawingElement) return;

    this.stage = new Konva.Stage({
      container: this.drawingElement.nativeElement,
      width: window.innerWidth,
      height: window.innerHeight,
    });
    this.layer = new Konva.Layer();
    this.stage.add(this.layer);

    // 1. Initialize the renderer which creates the shapes based on initial state
    this.rendererSvc.initialize(this.layer);

    // 2. Initialize interactions which attaches event listeners
    this.interactionSvc.initialize(this.stage, this.layer);

    // 3. Subscribe to state changes to trigger re-renders
    this.stateSubscription = this.stateSvc.state$.subscribe(state => {
      this.rendererSvc.render(state);
    });
  }

  ngOnDestroy(): void {
    this.stateSubscription?.unsubscribe();
  }
}