import { Component, input, output } from '@angular/core';
import { ToastersService } from 'src/app/core.index';
import { ICategory, IProduct } from '../product-management.interface';
import { ProductManagementService } from '../product-management.service';

@Component({
  selector: 'app-category-management',
  templateUrl: './category-management.component.html',
  styleUrl: './category-management.component.scss',
})
export class CategoryManagementComponent {
  readonly categories = input<ICategory[]>([]);
  readonly products = input<IProduct[]>([]);
  readonly changed = output<void>();

  constructor(
    private productManagementService: ProductManagementService,
    private toasters: ToastersService,
  ) {}

  productCount(category: ICategory): number {
    return this.products().filter((p) => p.categoryId === category.id).length;
  }

  add(input: HTMLInputElement): void {
    const name = input.value.trim();
    if (!name) return;
    this.productManagementService.saveCategory(name).subscribe({
      next: () => {
        input.value = '';
        this.toasters.show('Category added');
        this.changed.emit();
      },
      error: (err) => this.toasters.show('Could not add category: ' + err.message),
    });
  }

  rename(category: ICategory): void {
    const name = prompt('Category name', category.name)?.trim();
    if (!name || name === category.name) return;
    this.productManagementService.saveCategory(name, category).subscribe({
      next: () => this.changed.emit(),
      error: (err) => this.toasters.show('Could not rename: ' + err.message),
    });
  }

  delete(category: ICategory): void {
    const used = this.productCount(category);
    const message = used
      ? `Delete "${category.name}"? ${used} products will move to No category.`
      : `Delete "${category.name}"?`;
    if (!confirm(message)) return;
    this.productManagementService.deleteCategory(category.id).subscribe({
      next: () => this.changed.emit(),
      error: (err) => this.toasters.show('Could not delete: ' + err.message),
    });
  }
}
