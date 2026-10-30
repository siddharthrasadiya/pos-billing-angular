import { Component, input, output, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable } from 'rxjs';
import { ICategory } from '../../models/models';
import { ToastersService } from '../../service/toasters.service';

export interface ICategoryStore {
  saveCategory(name: string, existing?: ICategory): Observable<ICategory>;
  deleteCategory(id: string): Observable<void>;
}

@Component({
  selector: 'app-category-manager',
  imports: [ReactiveFormsModule],
  templateUrl: './category-manager.component.html',
  styleUrl: './category-manager.component.scss',
})
export class CategoryManagerComponent {
  readonly categories = input<ICategory[]>([]);
  readonly store = input.required<ICategoryStore>();
  readonly usage = input<(category: ICategory) => number>(() => 0);
  readonly itemLabel = input('items');
  readonly changed = output<void>();
  readonly editing = signal<ICategory | null>(null);
  readonly name = new FormControl('', { nonNullable: true, validators: [Validators.required] });

  constructor(private toasters: ToastersService) {}

  edit(category: ICategory): void {
    this.editing.set(category);
    this.name.setValue(category.name);
  }

  cancelEdit(): void {
    this.editing.set(null);
    this.name.reset();
  }

  save(): void {
    const name = this.name.value.trim();
    if (!name) {
      this.toasters.warn('Enter category name');
      return;
    }
    const existing = this.editing() ?? undefined;
    this.store()
      .saveCategory(name, existing)
      .subscribe({
        next: () => {
          this.toasters.success(existing ? 'Category renamed' : 'Category added');
          this.cancelEdit();
          this.changed.emit();
        },
        error: (err) => this.toasters.error('Could not save category: ' + err.message),
      });
  }

  delete(category: ICategory): void {
    const used = this.usage()(category);
    const message = used
      ? `Delete "${category.name}"? ${used} ${this.itemLabel()} will move to No category.`
      : `Delete "${category.name}"?`;
    if (!confirm(message)) return;
    this.store()
      .deleteCategory(category.id)
      .subscribe({
        next: () => {
          if (this.editing()?.id === category.id) this.cancelEdit();
          this.changed.emit();
        },
        error: (err) => this.toasters.error('Could not delete: ' + err.message),
      });
  }
}
