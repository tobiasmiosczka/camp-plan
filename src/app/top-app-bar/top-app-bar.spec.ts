import { TestBed } from '@angular/core/testing';
import { TopAppBar } from './top-app-bar';

describe('TopAppBar', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TopAppBar],
    })
      .compileComponents();
  });

  it('should render the title', async () => {
    const fixture = TestBed.createComponent(TopAppBar);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.title')?.textContent).toContain('CampPlan');
  });
});
