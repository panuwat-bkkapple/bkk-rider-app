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
  placement?: 'top' | 'bottom' | 'left' | 'right';
}

const TOUR_STORAGE_KEY = 'checkout_tour_completed';
const MOBILE_MAX_WIDTH = 768;

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

/** Check if the device is mobile-sized */
function isMobile(): boolean {
  return window.innerWidth <= MOBILE_MAX_WIDTH;
}

/** Check if tour was already completed */
function isTourCompleted(): boolean {
  return localStorage.getItem(TOUR_STORAGE_KEY) === 'true';
}

/** Mark the tour as completed */
function markTourCompleted(): void {
  localStorage.setItem(TOUR_STORAGE_KEY, 'true');
}

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface TooltipPosition {
  top?: number;
  bottom?: number;
  left: number;
  maxWidth: number;
}

function getSpotlightRect(el: Element, padding = 8): SpotlightRect {
  const rect = el.getBoundingClientRect();
  return {
    top: rect.top - padding + window.scrollY,
    left: rect.left - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}

function getTooltipPosition(
  spotlight: SpotlightRect,
  placement: 'top' | 'bottom' | 'left' | 'right'
): TooltipPosition {
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
      bottom: window.innerHeight - (spotlight.top - window.scrollY) + gap,
      left: centeredLeft,
      maxWidth,
    };
  }
  // default: bottom
  return {
    top: spotlight.top - window.scrollY + spotlight.height + gap,
    left: centeredLeft,
    maxWidth,
  };
}

export function ProductTour({
  steps = DEFAULT_STEPS,
  onComplete,
  forceShow = false,
}: {
  steps?: TourStep[];
  onComplete?: () => void;
  forceShow?: boolean;
}) {
  const [active, setActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<TooltipPosition | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Decide whether to show the tour
  useEffect(() => {
    if (forceShow || (!isTourCompleted() && isMobile())) {
      // Small delay to let the page render first
      const timer = setTimeout(() => setActive(true), 600);
      return () => clearTimeout(timer);
    }
  }, [forceShow]);

  // Position the spotlight on the current step's target
  const positionStep = useCallback(() => {
    if (!active) return;
    const step = steps[currentStep];
    if (!step) return;

    const el = document.querySelector(step.target);
    if (!el) return;

    // Scroll the element into view
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Recalculate after scroll settles
    const timer = setTimeout(() => {
      const rect = getSpotlightRect(el);
      setSpotlight(rect);
      setTooltipPos(getTooltipPosition(rect, step.placement || 'bottom'));
      setIsAnimating(true);
      setTimeout(() => setIsAnimating(false), 300);
    }, 350);

    return () => clearTimeout(timer);
  }, [active, currentStep, steps]);

  useEffect(() => {
    const cleanup = positionStep();
    return cleanup;
  }, [positionStep]);

  // Reposition on resize
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

  const handleSkip = useCallback(() => {
    finish();
  }, [finish]);

  if (!active || !spotlight || !tooltipPos) return null;

  const step = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[200]"
      style={{ pointerEvents: 'auto' }}
    >
      {/* Dark overlay with spotlight cutout using CSS clip-path */}
      <div
        className="absolute inset-0 transition-all duration-300"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          clipPath: `polygon(
            0% 0%, 0% 100%, 100% 100%, 100% 0%, 0% 0%,
            ${spotlight.left}px ${spotlight.top - window.scrollY}px,
            ${spotlight.left}px ${spotlight.top - window.scrollY + spotlight.height}px,
            ${spotlight.left + spotlight.width}px ${spotlight.top - window.scrollY + spotlight.height}px,
            ${spotlight.left + spotlight.width}px ${spotlight.top - window.scrollY}px,
            ${spotlight.left}px ${spotlight.top - window.scrollY}px
          )`,
        }}
        onClick={handleSkip}
      />

      {/* Spotlight border ring */}
      <div
        className="absolute rounded-xl border-2 border-emerald-400 transition-all duration-300"
        style={{
          top: spotlight.top - window.scrollY,
          left: spotlight.left,
          width: spotlight.width,
          height: spotlight.height,
          boxShadow: '0 0 0 4px rgba(52, 211, 153, 0.3)',
          pointerEvents: 'none',
        }}
      />

      {/* Pulse animation on spotlight */}
      <div
        className="absolute rounded-xl animate-pulse"
        style={{
          top: spotlight.top - window.scrollY - 2,
          left: spotlight.left - 2,
          width: spotlight.width + 4,
          height: spotlight.height + 4,
          border: '2px solid rgba(52, 211, 153, 0.4)',
          pointerEvents: 'none',
        }}
      />

      {/* Tooltip */}
      <div
        className={`absolute bg-white rounded-2xl shadow-2xl p-4 transition-all duration-300 ${
          isAnimating ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
        }`}
        style={{
          top: tooltipPos.top,
          bottom: tooltipPos.bottom,
          left: tooltipPos.left,
          maxWidth: tooltipPos.maxWidth,
          width: tooltipPos.maxWidth,
        }}
      >
        {/* Step indicator */}
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
          <span className="text-xs text-gray-400">
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
            onClick={handleSkip}
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

      {/* Skip button at top right */}
      <button
        onClick={handleSkip}
        className="absolute top-4 right-4 bg-white/20 backdrop-blur-sm text-white p-2 rounded-full hover:bg-white/30 transition-colors"
        aria-label="ปิด"
      >
        <X size={20} />
      </button>
    </div>
  );
}
