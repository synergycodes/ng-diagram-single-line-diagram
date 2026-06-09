import { TestBed } from '@angular/core/testing';
import { DiagramModeService } from './diagram-mode.service';

describe('DiagramModeService', () => {
  let service: DiagramModeService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DiagramModeService);
  });

  it('starts in linking mode', () => {
    expect(service.mode()).toBe('linking');
    expect(service.isLinking()).toBe(true);
    expect(service.isSketch()).toBe(false);
  });

  it('toggle flips linking → sketch → linking', () => {
    service.toggle();
    expect(service.mode()).toBe('sketch');
    expect(service.isSketch()).toBe(true);
    expect(service.isLinking()).toBe(false);

    service.toggle();
    expect(service.mode()).toBe('linking');
    expect(service.isLinking()).toBe(true);
    expect(service.isSketch()).toBe(false);
  });

  it('setMode jumps to the requested mode', () => {
    service.setMode('sketch');
    expect(service.mode()).toBe('sketch');

    service.setMode('sketch');
    expect(service.mode()).toBe('sketch');

    service.setMode('linking');
    expect(service.mode()).toBe('linking');
  });
});
