// src/components/faq/FAQTab.tsx
import { useState } from 'react';
import { X, ChevronRight, ChevronDown, ChevronUp, ArrowLeft } from 'lucide-react';
import { faqCategories } from '../../data/faqData';
import type { FAQCategory } from '../../data/faqData';

interface FAQTabProps {
  onGoHome: () => void;
}

export const FAQTab = ({ onGoHome }: FAQTabProps) => {
  const [selectedCategory, setSelectedCategory] = useState<FAQCategory | null>(null);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const handleToggle = (index: number) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  const handleBack = () => {
    setSelectedCategory(null);
    setExpandedIndex(null);
  };

  return (
    <div className="h-full bg-[#F3F4F6] animate-in slide-in-from-right duration-300 overflow-y-auto pb-32">
      {/* Header */}
      <div className="bg-white p-6 pt-12 pb-6 flex items-center gap-4 sticky top-0 z-20 border-b border-gray-100">
        <button
          onClick={selectedCategory ? handleBack : onGoHome}
          className="p-2 -ml-2 bg-gray-50 text-gray-500 hover:bg-gray-100 rounded-full transition-colors"
        >
          {selectedCategory ? <ArrowLeft size={20} /> : <X size={20} />}
        </button>
        <h2 className="text-lg font-bold text-gray-900">
          {selectedCategory ? selectedCategory.title : 'คำถามที่พบบ่อย'}
        </h2>
      </div>

      <div className="p-6">
        {!selectedCategory ? (
          /* Category List */
          <div className="space-y-3">
            {faqCategories.map((category) => (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category)}
                className="w-full bg-white p-5 rounded-2xl border border-gray-100 flex items-center gap-4 shadow-sm active:scale-[0.98] transition-all"
              >
                <div className="text-2xl w-10 h-10 flex items-center justify-center">
                  {category.icon}
                </div>
                <div className="flex-1 text-left">
                  <div className="font-semibold text-gray-800">{category.title}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{category.items.length} คำถาม</div>
                </div>
                <ChevronRight size={20} className="text-gray-300" />
              </button>
            ))}
          </div>
        ) : (
          /* Q&A Accordion */
          <div className="space-y-3">
            {selectedCategory.items.map((item, index) => (
              <div
                key={index}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
              >
                <button
                  onClick={() => handleToggle(index)}
                  className="w-full p-5 flex items-start gap-3 text-left"
                >
                  <span className="text-emerald-500 font-bold text-sm mt-0.5 shrink-0">
                    Q{index + 1}
                  </span>
                  <span className="flex-1 font-semibold text-gray-800 text-sm leading-relaxed">
                    {item.question}
                  </span>
                  {expandedIndex === index ? (
                    <ChevronUp size={18} className="text-gray-400 shrink-0 mt-0.5" />
                  ) : (
                    <ChevronDown size={18} className="text-gray-400 shrink-0 mt-0.5" />
                  )}
                </button>
                {expandedIndex === index && (
                  <div className="px-5 pb-5 pt-0">
                    <div className="pl-8 text-sm text-gray-600 leading-relaxed border-t border-gray-50 pt-4">
                      {item.answer}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
