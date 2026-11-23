import { registerStockTranslations } from '../stock-translations.model';
import { translations } from '../translations/ml';

registerStockTranslations({ ml: translations });

export { translations };
