import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PositionTableComponent } from './position-table';

describe('PositionTable', () => {
  let component: PositionTableComponent;
  let fixture: ComponentFixture<PositionTableComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PositionTableComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(PositionTableComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
