import { redirect } from 'next/navigation';

/** Backward-compatible alias for the boxes classic portal preview. */
export default function PortalPreviewTrianglePage() {
  redirect('/portal-preview/triangle/boxes');
}
