import {
  getPublicClient,
  getStatuses,
  getNavigators,
  getVendors,
  getMenuItems,
  getBoxTypes,
  getCategories,
  getUpcomingOrderForClient,
  getActiveOrderForClient,
  getMealCategories,
  getMealItems,
} from '@/lib/actions';
import { getClientFacingOrderHistoryForPortal } from '@/lib/actions-read';
import {
  getSwitchableClientAccounts,
  getHouseholdOrderMembersForPortal,
} from '@/lib/client-portal-account-switch';
import { isPortalV2ClientAllowlisted } from '@/lib/portal-v2-access';
import { ClientPortalClassicInterface } from '@/components/clients/ClientPortalClassicInterface';
import { StaffClientPortalStatusAcknowledgement } from '@/components/clients/StaffClientPortalStatusAcknowledgement';
import { getSession } from '@/lib/session';
import { notFound, redirect } from 'next/navigation';
import { getClient, getDependentsByParentId } from '@/lib/actions';
import type { Metadata } from 'next';
import {
  getMealPlanClientPortalPath,
  resolveClientPortalPath,
  shouldRedirectMealPlanPortalFromClassicRoute,
} from '@/lib/client-portal-routing';
import { isFoodOrMealHouseholdMember } from '@/lib/meal-dependant-portal-login';
import { supabase } from '@/lib/supabase';

function ClientPortalAccessDenied({ statusLabel }: { statusLabel: string }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        backgroundColor: 'var(--bg-app)',
      }}
    >
      <div
        role="alert"
        style={{
          maxWidth: 560,
          padding: '1.5rem 2rem',
          backgroundColor: 'var(--bg-surface)',
          borderRadius: 12,
          border: '1px solid var(--border-color)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        }}
      >
        <p style={{ margin: 0, lineHeight: 1.65, color: 'var(--text-primary)', fontSize: '1.05rem' }}>
          Your account is set to &quot;{statusLabel}&quot; and you are not able to place an order. Please call
          the office with any questions.
        </p>
      </div>
    </div>
  );
}

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const client = await getClient(id);
  return { title: client?.fullName ? `My Orders — ${client.fullName}` : 'Client Portal (Classic)' };
}

/** Triangle-style portal: upcoming-order flow with kitchen/vendor picker (not day-based meal plan). */
export default async function ClientPortalTrianglePage({ params }: Props) {
  const { id } = await params;

  const session = await getSession();
  if (!session?.userId) {
    redirect('/login');
  }

  if (session.role === 'client' && session.userId !== id) {
    const { data: clientRow } = await supabase
      .from('clients')
      .select('service_type')
      .eq('id', session.userId)
      .maybeSingle();
    redirect(await resolveClientPortalPath(supabase, session.userId, clientRow?.service_type));
  } else if (session.role === 'vendor') {
    redirect('/vendor');
  }

  const [
    client,
    statuses,
    navigators,
    vendors,
    menuItemsRaw,
    boxTypes,
    categories,
    upcomingOrder,
    activeOrder,
    mealCategories,
    mealItemsRaw,
    recentOrders,
  ] = await Promise.all([
    getPublicClient(id),
    getStatuses(),
    getNavigators(),
    getVendors(),
    getMenuItems(),
    getBoxTypes(),
    getCategories(),
    getUpcomingOrderForClient(id),
    getActiveOrderForClient(id),
    getMealCategories(),
    getMealItems(),
    getClientFacingOrderHistoryForPortal(id, 30),
  ]);

  const menuItems = menuItemsRaw ?? [];
  const mealItems = mealItemsRaw ?? [];

  if (!client) {
    notFound();
  }

  const parentId = client.parentClientId ?? client.id;
  const dependants =
    parentId === client.id
      ? await getDependentsByParentId(parentId, { includeArchived: !!client.archivedAt })
      : [];
  const householdPeople = [client, ...dependants].filter(
    (p) => p && isFoodOrMealHouseholdMember(p.serviceType)
  );
  if (
    shouldRedirectMealPlanPortalFromClassicRoute(
      client.serviceType,
      householdPeople.length > 0,
      session.role
    )
  ) {
    redirect(getMealPlanClientPortalPath(id));
  }

  const activeVendors = vendors.filter((v) => v.isActive !== false);
  const statusLabel =
    statuses?.find((s) => s.id === client.statusId)?.name?.trim() || 'Unknown';
  const portalAllowed =
    statusLabel.toLowerCase() === 'approved' || statusLabel.toLowerCase() === 'active';
  const canManageFoodKitchenVendor =
    session.role === 'client' ||
    session.role === 'admin' ||
    session.role === 'super-admin';

  const isClientPortalSession = session.role === 'client';
  const switchableAccounts = await getSwitchableClientAccounts(
    isClientPortalSession ? session.userId : id,
  );
  const householdOrderMembers = await getHouseholdOrderMembersForPortal(
    id,
    client.serviceType,
    switchableAccounts,
  );
  const portalV2Allowlisted = isPortalV2ClientAllowlisted(id);

  const portalInterface = (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {session.role !== 'client' ? (
        <div
          style={{
            flexShrink: 0,
            padding: '8px 16px',
            fontSize: '0.85rem',
            color: 'var(--text-secondary)',
            borderBottom: '1px solid var(--border-color)',
            background: 'var(--bg-surface)',
          }}
        >
          Food / Boxes portal (upcoming-order · Portal v2)
        </div>
      ) : null}
      <div style={{ flex: 1, minHeight: 0 }}>
      <ClientPortalClassicInterface
        client={client}
        statuses={statuses}
        navigators={navigators}
        vendors={activeVendors}
        menuItems={menuItems}
        boxTypes={boxTypes}
        categories={categories}
        upcomingOrder={upcomingOrder}
        activeOrder={activeOrder}
        mealCategories={mealCategories}
        mealItems={mealItems}
        foodOrder={null}
        mealOrder={null}
        boxOrders={[]}
        canManageFoodKitchenVendor={canManageFoodKitchenVendor}
        hidePhaseoutUnlessOnOrder={true}
        switchableAccounts={switchableAccounts}
        householdOrderMembers={householdOrderMembers}
        isClientPortalSession={isClientPortalSession}
        portalV2Allowlisted={portalV2Allowlisted}
        recentOrders={recentOrders}
      />
      </div>
    </div>
  );

  if (!portalAllowed) {
    if (session.role === 'client') {
      return <ClientPortalAccessDenied statusLabel={statusLabel} />;
    }
    return (
      <StaffClientPortalStatusAcknowledgement
        statusLabel={statusLabel}
        clientProfileHref={`/clients/${id}`}
        clientDisplayName={client.fullName}
      >
        {portalInterface}
      </StaffClientPortalStatusAcknowledgement>
    );
  }

  return portalInterface;
}
