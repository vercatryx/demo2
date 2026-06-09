import { redirectToPortalClassicPreview } from '@/lib/portal-preview';

export default async function PortalPreviewTriangleFoodPage() {
  await redirectToPortalClassicPreview(['Food', 'Meal']);
}
