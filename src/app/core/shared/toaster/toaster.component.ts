import { Component } from '@angular/core';
import { ToastersService } from '../../service/toasters.service';

@Component({
  selector: 'app-toaster',
  templateUrl: './toaster.component.html',
  styleUrl: './toaster.component.scss',
})
export class ToasterComponent {
  readonly icons = { success: '✓', error: '!', warn: '!', info: 'i' };

  constructor(protected toasters: ToastersService) {}
}
