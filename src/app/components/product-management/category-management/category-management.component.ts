import { Component, input, output, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ToastersService } from 'src/app/core.index';
import { ICategory, IProduct } from '../product-management.interface';
import { ProductManagementService } from '../product-management.service';

@Component({
  selector: 'app-category-management',
  imports: [ReactiveFormsModule],
  templateUrl: './category-management.component.html',
  styleUrl: './category-management.component.scss',
})
export class CategoryManagementComponent {
  readonly categories = input<ICategory[]>([]);
  readonly products = input<IProduct[]>([]);
  readonly changed = output<void>();
  readonly editing = signal<ICategory | null>(null);
  readonly name = new FormControl('', { nonNullable: true, validators: [Validators.required] });

  constructor(
    private productManagementService: ProductManagementService,
    private toasters: ToastersService,
  ) {}

  productCount(category: ICategory): number {
    return this.products().filter((p) => p.categoryId === category.id).length;
  }

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
      this.toasters.show('Enter category name');
      return;
    }
    const existing = this.editing() ?? undefined;
    this.productManagementService.saveCategory(name, existing).subscribe({
      next: () => {
        this.toasters.show(existing ? 'Category renamed' : 'Category added');
        this.cancelEdit();
        this.changed.emit();
      },
      error: (err) => this.toasters.show('Could not save category: ' + err.message),
    });
  }

  delete(category: ICategory): void {
    const used = this.productCount(category);
    const message = used
      ? `Delete "${category.name}"? ${used} products will move to No category.`
      : `Delete "${category.name}"?`;
    if (!confirm(message)) return;
    this.productManagementService.deleteCategory(category.id).subscribe({
      next: () => {
        if (this.editing()?.id === category.id) this.cancelEdit();
        this.changed.emit();
      },
      error: (err) => this.toasters.show('Could not delete: ' + err.message),
    });
  }
}
