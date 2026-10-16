import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PositionTableComponent } from './position-table';
import {City} from '../calculation/city';
import {Position} from '../calculation/position';

describe('PositionTable', () => {
  let component: PositionTableComponent;
  let fixture: ComponentFixture<PositionTableComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PositionTableComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(PositionTableComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('side', 'debit');
    fixture.componentRef.setInput('positions', [new Position('Bus', 1485)]);
    fixture.componentRef.setInput('sums', new Map());
    fixture.componentRef.setInput('cities', [City.others()]);
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
