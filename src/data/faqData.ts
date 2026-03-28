export type { FAQItem, FAQCategory } from './faqPurchasing';
import { faqPurchasing } from './faqPurchasing';
import { faqCancellation } from './faqCancellation';
import { faqFees } from './faqFees';
import { faqPdpa } from './faqPdpa';
import { faqGeneral } from './faqGeneral';

export const faqCategories = [
  faqPurchasing,
  faqCancellation,
  faqFees,
  faqPdpa,
  faqGeneral,
];
