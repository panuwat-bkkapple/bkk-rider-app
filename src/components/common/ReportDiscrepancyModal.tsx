// src/components/common/ReportDiscrepancyModal.tsx
//
// DEPRECATED — kept as a thin compatibility shim. The old discrepancy
// flow wrote to /jobs/{id}/discrepancy_reports/{id} with no real FCM push,
// no atomic apply, and no admin handler on mobile. We diagnosed multiple
// state-desync bugs from running it alongside the amendment workflow.
//
// All call sites now redirect to RequestAmendmentModal (v2 unified flow).
// The `onSubmit` prop is intentionally unused — the new flow authors
// records server-side via the requestAmendment Cloud Function.
//
// Old `discrepancy_reports` records remain readable in admin's
// /discrepancy-reports page so historical data isn't orphaned.

import { RequestAmendmentModal } from '../amendments/RequestAmendmentModal';

interface ReportDiscrepancyModalProps {
  job: any;
  onClose: () => void;
  // Kept for backward-compat with old callers; ignored — the new
  // requestAmendment callable handles server writes itself.
  onSubmit?: (jobId: string, category: string, detail: string, imageFile: File | null) => Promise<void>;
}

export const ReportDiscrepancyModal = ({ job, onClose }: ReportDiscrepancyModalProps) => {
  return (
    <RequestAmendmentModal
      job={job}
      onClose={onClose}
      onSubmitted={onClose}
    />
  );
};
