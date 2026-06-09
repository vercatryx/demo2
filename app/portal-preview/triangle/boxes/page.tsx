import { redirectToPortalClassicPreview } from '@/lib/portal-preview';

export default async function PortalPreviewTriangleBoxesPage() {
  await redirectToPortalClassicPreview(['Boxes']);
}
