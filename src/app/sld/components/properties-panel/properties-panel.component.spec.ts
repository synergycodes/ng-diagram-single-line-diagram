import { TestBed } from '@angular/core/testing';
import { provideFormlyCore } from '@ngx-formly/core';
import { provideNgDiagram } from 'ng-diagram';
import { PropertiesPanelComponent } from './properties-panel.component';

// provideNgDiagram() supplies the model/selection services SldPageComponent
// provides at runtime; without it the component can't be constructed.
describe('PropertiesPanelComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [PropertiesPanelComponent],
      providers: [provideNgDiagram(), provideFormlyCore({})],
    });
  });

  it('creates', () => {
    const fixture = TestBed.createComponent(PropertiesPanelComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('collapses (no panel rendered) when nothing is selected', () => {
    const fixture = TestBed.createComponent(PropertiesPanelComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    // Floating layout: the panel hides itself entirely when there's no symbol
    // selection — the host gets `.is-empty` (display:none) and renders no `.prop`.
    expect(host.classList.contains('is-empty')).toBe(true);
    expect(host.querySelector('.prop')).toBeNull();
  });
});
