import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ThemeService, type ThemeMode } from '../../services/theme.service';
import { IconComponent } from '../../shared/icons';

@Component({
  selector: 'app-theme-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  templateUrl: './theme-toggle.component.html',
  styleUrl: './theme-toggle.component.scss',
})
export class ThemeToggleComponent {
  private readonly themeService = inject(ThemeService);

  protected readonly theme = this.themeService.theme;

  protected select(value: ThemeMode): void {
    this.themeService.setTheme(value);
  }
}
