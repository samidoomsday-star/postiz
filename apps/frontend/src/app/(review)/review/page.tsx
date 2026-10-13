import { ReviewPortal } from './review.portal';
export const dynamic = 'force-dynamic';
export default function ReviewPage() {
  return <ReviewPortal backendUrl={process.env.NEXT_PUBLIC_BACKEND_URL!} />;
}
