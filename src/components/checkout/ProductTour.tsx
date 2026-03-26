// src/components/checkout/ProductTour.tsx - Multi-step Product Tour with spotlight + tooltip
import { useState, useEffect, useCallback, useRef } from 'react';
import { X, ChevronRight, Check } from 'lucide-react';

export interface TourStep {
  /** CSS selector for the target element */
  target: string;
  /** Title shown in the tooltip */
  title: string;
  /** Description shown in the tooltip */
  description: string;
  /** Position of the tooltip relative to the target */
  placement?: 'top' | 'bottom';
}

const TOUR_STORAGE_KEY = 'checkout_tour_completed';

const DEFAULT_STEPS: TourStep[] = [
  {
    target: '[data-tour="fullname"]',
    title: 'ชื่อ-นามสกุล',
    description: 'กรอกชื่อและนามสกุลของคุณที่นี่',
    placement: 'bottom',
  },
  {
    target: '[data-tour="phone"]',
    title: 'เบอร์โทรศัพท์',
    description: 'กรอกเบอร์โทรศัพท์ที่สามารถติดต่อได้',
    placement: 'bottom',
  },
  {
    target: '[data-tour="email"]',
    title: 'อีเมล',
    description: 'กรอกอีเมลเพื่อรับใบเสร็จและอัปเดตสถานะ',
    placement: 'bottom',
  },
  {
    target: '[data-tour="next-button"]',
    title: 'ปุ่มถัดไป',
    description: 'กดปุ่มนี้เพื่อไปขั้นตอนถัดไปหลังกรอกข้อมูลครบ',
    placement: 'top',
  },
  {
    target: '[data-tour="location-bar"]',
    title: 'เลือกสถานที่',
    description: 'กดเพื่อเลือกสถานที่รับ-ส่งสินค้า',
    placement: 'bottom',
  },
  {
    target: '[data-tour="service-cards"]',
    title: 'เลือกบริการ',
    description: 'เลือกประเภทบริการที่ต้องการจากรายการนี้',
    placement: 'top',
  },
  {
    target: '[data-tour="confirm-button"]',
    title: 'ยืนยันคำสั่งซื้อ',
    description: 'กดยืนยันเมื่อตรวจสอบข้อมูลเรียบร้อยแล้ว',
    placement: 'top',
  },
];

/** Check if tour was already completed */
function isTourCompleted(): boolean {
  try {
    return localStorage.getItem(TOUR_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

/** Mark the tour as completed */
function markTourCompleted(): void {
  try {
    localStorage.setItem(TOUR_STORAGE_KEY, 'true');
  } catch {
    // localStorage not available
  }
}

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface TooltipStyle {
  top?: string;
  bottom?: string;
  left: string;
  width: string;
}

function getSpotlightRect(el: Element, padding = 8): SpotlightRect {
  const rect = el.getBoundingClientRect();
  return {
    top: rect.top - padding,
    left: rect.left - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}

function getTooltipStyle(
  spotlight: SpotlightRect,
  placement: 'top' | 'bottom'
): TooltipStyle {
  const gap = 12;
  const maxWidth = Math.min(320, window.innerWidth - 32);
  const centeredLeft = Math.max(
    16,
    Math.min(
      spotlight.left + spotlight.width / 2 - maxWidth / 2,
      window.innerWidth - maxWidth - 16
    )
  );

  if (placement === 'top') {
    return {
      bottom: `${window.innerHeight - spotlight.top + gap}px`,
      left: `${centeredLeft}px`,
      width: `${maxWidth}px`,
    };
  }
  return {
    top: `${spotlight.top + spotlight.height + gap}px`,
    left: `${centeredLeft}px`,
    width: `${maxWidth}px`,
  };
}

export function ProductTour({
  steps = DEFAULT_STEPS,
  onComplete,
  onRequestStep,
  forceShow = false,
}: {
  steps?: TourStep[];
  onComplete?: () => void;
  /** Called when the tour needs a target that isn't in the DOM yet.
   *  The parent should switch to the correct form step so the target becomes visible.
   *  Returns true if the parent handled it. */
  onRequestStep?: (target: string) => boolean;
  forceShow?: boolean;
}) {
  const [active, setActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);
  const [tooltipStyle, setTooltipStyle] = useState<TooltipStyle | null>(null);
  const [fadeIn, setFadeIn] = useState(false);
  const retryRef = useRef<ReturnType<typeof setTimeout>>();

  // Decide whether to show the tour
  useEffect(() => {
    if (forceShow || !isTourCompleted()) {
      const timer = setTimeout(() => setActive(true), 800);
      return () => clearTimeout(timer);
    }
  }, [forceShow]);

  // Position the spotlight on the current step's target
  const positionStep = useCallback(() => {
    if (!active) return;
    const step = steps[currentStep];
    if (!step) return;

    const el = document.querySelector(step.target);

    if (!el) {
      // Target not in DOM — ask parent to switch form step
      const handled = onRequestStep?.(step.target);
      if (handled) {
        // Retry after parent re-renders
        retryRef.current = setTimeout(() => positionStep(), 400);
        return;
      }
      // Skip this step if target truly doesn't exist
      if (currentStep < steps.length - 1) {
        setCurrentStep((prev) => prev + 1);
      } else {
        markTourCompleted();
        setActive(false);
        onComplete?.();
      }
      return;
    }

    // Scroll element into view
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Wait for scroll to settle, then measure
    retryRef.current = setTimeout(() => {
      const rect = getSpotlightRect(el);
      setSpotlight(rect);
      setTooltipStyle(getTooltipStyle(rect, step.placement || 'bottom'));
      // Trigger fade-in
      setFadeIn(false);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setFadeIn(true));
      });
    }, 400);
  }, [active, currentStep, steps, onRequestStep, onComplete]);

  useEffect(() => {
    positionStep();
    return () => {
      if (retryRef.current) clearTimeout(retryRef.current);
    };
  }, [positionStep]);

  // Reposition on window resize
  useEffect(() => {
    if (!active) return;
    const handleResize = () => positionStep();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [active, positionStep]);

  const finish = useCallback(() => {
    markTourCompleted();
    setActive(false);
    onComplete?.();
  }, [onComplete]);

  const handleNext = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      finish();
    }
  }, [currentStep, steps.length, finish]);

  if (!active || !spotlight || !tooltipStyle) return null;

  const step = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;

  // SVG overlay with a rectangular cutout for the spotlight
  const viewW = window.innerWidth;
  const viewH = window.innerHeight;

  return (
    <div className="fixed inset-0 z-[200]" style={{ pointerEvents: 'auto' }}>
      {/* SVG overlay — uses a path with evenodd to cut a hole */}
      <svg
        className="absolute inset-0 w-full h-full transition-all duration-300"
        style={{ pointerEvents: 'none' }}
      >
        <defs>
          <mask id="tour-spotlight-mask">
            <rect width="100%" height="100%" fill="white" />
            <rect
              x={spotlight.left}
              y={spotlight.top}
              width={spotlight.width}
              height={spotlight.height}
              rx={12}
              fill="black"
              className="transition-all duration-300"
            />
          </mask>
        </defs>
        <rect
          width={viewW}
          height={viewH}
          fill="rgba(0,0,0,0.7)"
          mask="url(#tour-spotlight-mask)"
          className="transition-all duration-300"
        />
      </svg>

      {/* Click-away overlay (outside the spotlight) */}
      <div
        className="absolute inset-0"
        style={{ pointerEvents: 'auto' }}
        onClick={finish}
      />

      {/* Spotlight border ring */}
      <div
        className="absolute rounded-xl border-2 border-emerald-400 transition-all duration-300 pointer-events-none"
        style={{
          top: spotlight.top,
          left: spotlight.left,
          width: spotlight.width,
          height: spotlight.height,
          boxShadow: '0 0 0 4px rgba(52, 211, 153, 0.3), 0 0 20px 2px rgba(52, 211, 153, 0.15)',
        }}
      />

      {/* Pulse ring */}
      <div
        className="absolute rounded-xl animate-pulse pointer-events-none"
        style={{
          top: spotlight.top - 3,
          left: spotlight.left - 3,
          width: spotlight.width + 6,
          height: spotlight.height + 6,
          border: '2px solid rgba(52, 211, 153, 0.35)',
        }}
      />

      {/* Tooltip */}
      <div
        className="absolute bg-white rounded-2xl shadow-2xl p-4 transition-all duration-300"
        style={{
          ...tooltipStyle,
          opacity: fadeIn ? 1 : 0,
          transform: fadeIn ? 'translateY(0)' : 'translateY(8px)',
          pointerEvents: 'auto',
        }}
      >
        {/* Step dots */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex gap-1.5">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === currentStep
                    ? 'w-6 bg-emerald-500'
                    : i < currentStep
                    ? 'w-1.5 bg-emerald-300'
                    : 'w-1.5 bg-gray-200'
                }`}
              />
            ))}
          </div>
          <span className="text-xs text-gray-400 tabular-nums">
            {currentStep + 1}/{steps.length}
          </span>
        </div>

        {/* Content */}
        <h3 className="font-bold text-gray-800 text-base mb-1">{step.title}</h3>
        <p className="text-sm text-gray-500 leading-relaxed mb-3">
          {step.description}
        </p>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <button
            onClick={finish}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors px-2 py-1"
          >
            ข้าม
          </button>
          <button
            onClick={handleNext}
            className="flex items-center gap-1.5 bg-emerald-500 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-emerald-600 active:scale-95 transition-all shadow-md"
          >
            {isLastStep ? (
              <>
                เสร็จสิ้น
                <Check size={16} />
              </>
            ) : (
              <>
                ถัดไป
                <ChevronRight size={16} />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Top-right close button */}
      <button
        onClick={finish}
        className="absolute top-4 right-4 bg-white/20 backdrop-blur-sm text-white p-2 rounded-full hover:bg-white/30 transition-colors"
        aria-label="ปิด"
        style={{ pointerEvents: 'auto' }}
      >
        <X size={20} />
      </button>
    </div>
  );
}
