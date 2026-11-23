import React, { useCallback, useEffect, useState } from 'react';
import { Check, Flag, MessageCircle, Send, Shield, Store as StoreIcon, Tag, Users } from 'lucide-react';
import type {
  AbuseReport,
  AuditLog,
  Category,
  LanguageCode,
  PublicUser,
  Store,
  SupportTicket,
  UserRole,
} from '../../shared/types.ts';
import { getAreaDisplayName } from '../../shared/locationConfig.ts';
import { apiFetch } from '../lib/api.ts';
import { DashboardTableSkeleton } from './Skeletons.tsx';

interface AdminDashboardProps {
  user: PublicUser | null;
  notify: (msg: string, type?: 'success' | 'error') => void;
  onMarketplaceMutated: () => void;
  mode?: 'admin' | 'moderator';
  lang?: LanguageCode;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  user,
  notify,
  onMarketplaceMutated,
  mode = 'admin',
  lang = 'en',
}) => {
  const isAr = lang === 'ar';
  const isModeratorMode = mode === 'moderator';

  const [tab, setTab] = useState<'stores' | 'listings' | 'categories' | 'users' | 'reports' | 'support' | 'logs'>(
    isModeratorMode ? 'support' : 'stores'
  );
  const [loading, setLoading] = useState(true);

  const [adminData, setAdminData] = useState<{
    stats: {
      totalUsers: number;
      totalStores: number;
      pendingStores: number;
      approvedStores: number;
      totalListings: number;
      totalOrders: number;
      openReports: number;
      openSupportTickets?: number;
    };
    stores: Store[];
    users: PublicUser[];
    categories: Category[];
    listings: { id: string; productName: string; storeName: string; price: number; isActive: boolean }[];
    reports: AbuseReport[];
    supportTickets: SupportTicket[];
    auditLogs: AuditLog[];
  } | null>(null);

  const [moderatorTickets, setModeratorTickets] = useState<SupportTicket[]>([]);

  const [catName, setCatName] = useState('');
  const [catAr, setCatAr] = useState('');
  const [supportFilter, setSupportFilter] = useState<'all' | 'customer' | 'seller'>('all');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [supportReply, setSupportReply] = useState('');
  const [sendingSupportReply, setSendingSupportReply] = useState(false);

  const isAuthorized = isModeratorMode
    ? Boolean(user && (user.roles.includes('moderator') || user.roles.includes('admin')))
    : Boolean(user && user.roles.includes('admin'));

  const loadConsoleData = useCallback(
    async (silent = false) => {
      if (!isAuthorized) {
        setLoading(false);
        return;
      }
      if (!silent) setLoading(true);
      try {
        if (isModeratorMode) {
          const res = await apiFetch<{ tickets: SupportTicket[] }>('/api/moderator/tickets');
          const list = res.tickets || [];
          setModeratorTickets(list);
          if (list.length > 0) {
            setSelectedTicketId((prev) =>
              prev && list.some((t) => t.id === prev) ? prev : list[0].id
            );
          }
        } else {
          const res = await apiFetch<NonNullable<typeof adminData>>('/api/admin/dashboard');
          setAdminData(res);
          if (res.supportTickets?.length > 0) {
            setSelectedTicketId((prev) =>
              prev && res.supportTickets.some((t) => t.id === prev)
                ? prev
                : res.supportTickets[0].id
            );
          }
        }
      } catch (err) {
        if (!silent) {
          notify(
            err instanceof Error
              ? err.message
              : isAr
                ? 'فشل تحميل بيانات لوحة التحكم.'
                : 'Console load failed.',
            'error'
          );
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [isAuthorized, isModeratorMode, notify, isAr]
  );

  useEffect(() => {
    setTab(isModeratorMode ? 'support' : 'stores');
  }, [isModeratorMode]);

  useEffect(() => {
    loadConsoleData();
  }, [loadConsoleData]);

  useEffect(() => {
    if (!isModeratorMode && tab !== 'support') return;
    const timer = window.setInterval(() => {
      loadConsoleData(true);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [isModeratorMode, tab, loadConsoleData]);

  if (!isAuthorized) {
    return (
      <div
        dir={isAr ? 'rtl' : 'ltr'}
        className="mx-auto max-w-2xl rounded-3xl border border-[#E4DCF7] bg-white p-10 text-center dark:border-[#22222C] dark:bg-[#0E0E13]"
      >
        <Shield className="mx-auto h-10 w-10 text-[#4A3894] dark:text-[#9678CE]" />
        <h2 className="font-display mt-3 text-xl font-bold text-[#1E1438] dark:text-white">
          {isModeratorMode
            ? isAr
              ? 'مكتب الإشراف على التذاكر'
              : 'Support Moderator Desk'
            : isAr
              ? 'وحدة تحكم الإدارة'
              : 'Administrator Console'}
        </h2>
        <p className="mt-1 text-sm text-[#5E5C70] dark:text-[#B9B0D8]">
          {isModeratorMode
            ? isAr
              ? 'يتطلب الوصول إلى مكتب الدعم صلاحية مشرف أو مدير مسجل الدخول.'
              : 'Moderator or administrator permissions are required to view and reply to support tickets.'
            : isAr
              ? 'صلاحيات المدير مطلوبة للوصول إلى أدوات إدارة المنصة.'
              : 'Administrator permissions are required. Sign in with an administrator account to access governance tools.'}
        </p>
      </div>
    );
  }

  const updateStoreApproval = async (
    storeId: string,
    approvalStatus: 'approved' | 'rejected' | 'suspended'
  ) => {
    try {
      await apiFetch(`/api/admin/stores/${storeId}/approval`, {
        method: 'POST',
        body: JSON.stringify({ approvalStatus }),
      });
      notify(isAr ? 'تم تحديث حالة المتجر.' : `Store marked ${approvalStatus}.`);
      await loadConsoleData();
      onMarketplaceMutated();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed.', 'error');
    }
  };

  const toggleListing = async (listingId: string) => {
    try {
      await apiFetch(`/api/admin/listings/${listingId}/toggle`, { method: 'POST' });
      notify(isAr ? 'تم تحديث ظهور العرض.' : 'Listing visibility updated.');
      await loadConsoleData();
      onMarketplaceMutated();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed.', 'error');
    }
  };

  const createCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/categories', {
        method: 'POST',
        body: JSON.stringify({ name: catName, nameAr: catAr }),
      });
      notify(isAr ? 'تمت إضافة التصنيف.' : 'Category created.');
      setCatName('');
      setCatAr('');
      await loadConsoleData();
      onMarketplaceMutated();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed.', 'error');
    }
  };

  const toggleUserRole = async (targetUser: PublicUser, role: UserRole) => {
    const has = targetUser.roles.includes(role);
    const next = has ? targetUser.roles.filter((r) => r !== role) : [...targetUser.roles, role];
    if (next.length === 0) return;
    try {
      await apiFetch(`/api/admin/users/${targetUser.id}/roles`, {
        method: 'PATCH',
        body: JSON.stringify({ roles: next }),
      });
      notify(
        isAr ? `تم تحديث صلاحيات ${targetUser.fullName}.` : `Updated roles for ${targetUser.fullName}.`
      );
      await loadConsoleData();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed.', 'error');
    }
  };

  const resolveReport = async (reportId: string, status: 'resolved' | 'dismissed') => {
    try {
      await apiFetch(`/api/admin/reports/${reportId}`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      notify(isAr ? 'تم تحديث حالة البلاغ.' : `Report ${status}.`);
      await loadConsoleData();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed.', 'error');
    }
  };

  const sendSupportReply = async (e: React.FormEvent, ticketId: string) => {
    e.preventDefault();
    if (!supportReply.trim()) return;
    setSendingSupportReply(true);
    try {
      await apiFetch(`/api/admin/support-tickets/${ticketId}/reply`, {
        method: 'POST',
        body: JSON.stringify({ text: supportReply.trim() }),
      });
      setSupportReply('');
      notify(isAr ? 'تم إرسال الرد إلى التذكرة.' : 'Reply sent to support conversation.');
      await loadConsoleData(true);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Reply failed.', 'error');
    } finally {
      setSendingSupportReply(false);
    }
  };

  const updateSupportTicketStatus = async (ticketId: string, status: 'open' | 'resolved') => {
    try {
      await apiFetch(`/api/admin/support-tickets/${ticketId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      notify(
        isAr
          ? status === 'resolved'
            ? 'تم إغلاق التذكرة.'
            : 'تمت إعادة فتح التذكرة.'
          : `Support ticket marked ${status}.`
      );
      await loadConsoleData(true);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Status update failed.', 'error');
    }
  };

  const ticketList = isModeratorMode ? moderatorTickets : adminData?.supportTickets || [];

  const renderTicketInbox = () => {
    const filteredTickets = ticketList.filter(
      (tk) => supportFilter === 'all' || tk.senderRole === supportFilter
    );
    const activeTicket =
      filteredTickets.find((tk) => tk.id === selectedTicketId) || filteredTickets[0] || null;

    return (
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="space-y-3 lg:col-span-5">
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { id: 'all', label: `${isAr ? 'الكل' : 'All'} (${ticketList.length})` },
                {
                  id: 'customer',
                  label: `${isAr ? 'المشترون' : 'Buyers'} (${ticketList.filter((t) => t.senderRole === 'customer').length})`,
                },
                {
                  id: 'seller',
                  label: `${isAr ? 'التجار' : 'Sellers'} (${ticketList.filter((t) => t.senderRole === 'seller').length})`,
                },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setSupportFilter(f.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                  supportFilter === f.id
                    ? 'bg-[#4A3894] text-white'
                    : 'border border-[#E4DCF7] bg-white text-[#5E5C70] dark:border-[#22222C] dark:bg-[#0E0E13] dark:text-[#B9B0D8]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {filteredTickets.length === 0 ? (
            <div className="rounded-2xl border border-[#E4DCF7] bg-white p-6 text-center text-xs text-[#5E5C70] dark:border-[#22222C] dark:bg-[#0E0E13] dark:text-[#B9B0D8]">
              {isAr ? 'لا توجد تذاكر تطابق هذا التصنيف حالياً.' : 'No support chats match this filter yet.'}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTickets.map((tk) => {
                const selected = activeTicket?.id === tk.id;
                const lastMsg = tk.messages[tk.messages.length - 1];
                return (
                  <button
                    key={tk.id}
                    type="button"
                    onClick={() => setSelectedTicketId(tk.id)}
                    className={`block w-full rounded-2xl border p-3.5 text-start transition cursor-pointer ${
                      selected
                        ? 'border-[#4A3894] bg-[#FBEFFB]/70 dark:border-[#9678CE] dark:bg-[#15151C]'
                        : 'border-[#E4DCF7] bg-white hover:border-[#9678CE] dark:border-[#22222C] dark:bg-[#0E0E13]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-bold uppercase text-[#4A3894] dark:text-[#E794C9]">
                        {tk.senderRole === 'seller'
                          ? isAr
                            ? 'تاجر'
                            : 'Seller'
                          : isAr
                            ? 'مشتري'
                            : 'Buyer'}{' '}
                        · {tk.status}
                      </span>
                      <span className="tabular-nums text-[#5E5C70] dark:text-[#B9B0D8]">
                        {new Date(tk.updatedAt).toLocaleTimeString(isAr ? 'ar-DZ' : 'en-US', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <div className="font-display mt-1 text-sm font-bold text-[#1E1438] dark:text-white">
                      {tk.topic}
                    </div>
                    <div className="text-xs text-[#5E5C70] dark:text-[#B9B0D8]">
                      {tk.senderName} · {tk.senderContact}
                    </div>
                    {lastMsg && (
                      <div className="mt-1 line-clamp-1 text-xs text-[#5E5C70] dark:text-[#B9B0D8]">
                        {lastMsg.text}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="lg:col-span-7">
          {activeTicket ? (
            <div className="flex h-full min-h-[380px] flex-col justify-between rounded-3xl border border-[#E4DCF7] bg-white p-5 dark:border-[#22222C] dark:bg-[#0E0E13]">
              <div>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E4DCF7] pb-3.5 dark:border-[#22222C]">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-[#9678CE]">
                      {activeTicket.senderRole === 'seller'
                        ? isAr
                          ? 'دعم التجار'
                          : 'Seller Support'
                        : isAr
                          ? 'دعم الزبائن'
                          : 'Customer Support'}{' '}
                      · {activeTicket.status}
                    </div>
                    <h3 className="font-display mt-0.5 text-lg font-bold text-[#1E1438] dark:text-white">
                      {activeTicket.topic}
                    </h3>
                    <div className="text-xs text-[#5E5C70] dark:text-[#B9B0D8]">
                      {activeTicket.senderName} · {activeTicket.senderContact}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {activeTicket.status !== 'resolved' ? (
                      <button
                        type="button"
                        onClick={() => updateSupportTicketStatus(activeTicket.id, 'resolved')}
                        className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white cursor-pointer"
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span>{isAr ? 'تعيين كمحلولة' : 'Mark Resolved'}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => updateSupportTicketStatus(activeTicket.id, 'open')}
                        className="rounded-full border border-[#E4DCF7] px-3 py-1.5 text-xs font-semibold text-[#1E1438] dark:border-[#22222C] dark:text-white cursor-pointer"
                      >
                        {isAr ? 'إعادة الفتح' : 'Reopen'}
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-4 max-h-72 space-y-2.5 overflow-y-auto pe-1">
                  {activeTicket.messages.map((m) => {
                    const isSupport = m.sender === 'support';
                    return (
                      <div
                        key={m.id}
                        className={`flex flex-col ${isSupport ? 'items-end' : 'items-start'}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                            isSupport
                              ? 'bg-[#4A3894] text-white'
                              : 'border border-[#E4DCF7] bg-[#FBF9FE] text-[#1E1438] dark:border-[#22222C] dark:bg-[#15151C] dark:text-white'
                          }`}
                        >
                          <div
                            className={`mb-0.5 text-[10px] font-bold ${
                              isSupport ? 'text-[#E794C9]' : 'text-[#4A3894] dark:text-[#9678CE]'
                            }`}
                          >
                            {m.senderName}
                          </div>
                          <p className="whitespace-pre-wrap">{m.text}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <form
                onSubmit={(e) => sendSupportReply(e, activeTicket.id)}
                className="mt-4 flex items-center gap-2 border-t border-[#E4DCF7] pt-3.5 dark:border-[#22222C]"
              >
                <input
                  value={supportReply}
                  onChange={(e) => setSupportReply(e.target.value)}
                  placeholder={
                    isAr ? `الرد على ${activeTicket.senderName}...` : `Reply to ${activeTicket.senderName}...`
                  }
                  className="flex-1 rounded-full border border-[#E4DCF7] bg-[#FBF9FE] px-4 py-2 text-xs focus:border-[#4A3894] focus:outline-none dark:border-[#22222C] dark:bg-[#15151C]"
                />
                <button
                  type="submit"
                  disabled={sendingSupportReply || !supportReply.trim()}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#4A3894] px-4 py-2 text-xs font-extrabold text-white hover:bg-[#3A2B78] disabled:opacity-50 cursor-pointer"
                >
                  <Send className="h-3.5 w-3.5 rtl:rotate-180" />
                  <span>{isAr ? 'إرسال' : 'Send'}</span>
                </button>
              </form>
            </div>
          ) : (
            <div className="rounded-3xl border border-[#E4DCF7] bg-white p-10 text-center text-xs text-[#5E5C70] dark:border-[#22222C] dark:bg-[#0E0E13]">
              {isAr
                ? 'اختر محادثة دعم للعملاء أو التجار للرد عليها.'
                : 'Select a customer or seller support chat to respond.'}
            </div>
          )}
        </div>
      </div>
    );
  };

  const openTicketsCount = ticketList.filter((t) => t.status === 'open').length;
  const answeredTicketsCount = ticketList.filter((t) => t.status === 'answered').length;
  const resolvedTicketsCount = ticketList.filter((t) => t.status === 'resolved').length;

  return (
    <section dir={isAr ? 'rtl' : 'ltr'} className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-[#1E1438] sm:text-3xl dark:text-white">
          {isModeratorMode
            ? isAr
              ? 'مكتب الدعم وإدارة التذاكر'
              : 'Moderator Support Desk'
            : isAr
              ? 'إدارة منصة ماركتلي'
              : 'Marketly Administration'}
        </h1>
        <p className="text-sm text-[#5E5C70] dark:text-[#B9B0D8]">
          {isModeratorMode
            ? isAr
              ? 'عرض تذاكر دعم المشترين والتجار في الجلفة والرد عليها وتحديث حالتها فقط.'
              : 'View, reply to, and update resolution status on Marketly customer and seller support tickets.'
            : isAr
              ? 'مراجعة متاجر الجلفة، إدارة العروض والتصنيفات، صلاحيات المستخدمين، ومراقبة سجل النظام.'
              : 'Review pending Djelfa store registrations, moderate product listings, manage roles, and audit actions.'}
        </p>
      </div>

      {loading ? (
        <DashboardTableSkeleton rows={5} />
      ) : isModeratorMode ? (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-[#E4DCF7] bg-white p-4 dark:border-[#22222C] dark:bg-[#0E0E13]">
              <div className="text-xs text-[#5E5C70] dark:text-[#B9B0D8]">
                {isAr ? 'تذاكر مفتوحة' : 'Open Tickets'}
              </div>
              <div className="font-display mt-1 text-2xl font-extrabold text-amber-600 tabular-nums">
                {openTicketsCount}
              </div>
            </div>
            <div className="rounded-2xl border border-[#E4DCF7] bg-white p-4 dark:border-[#22222C] dark:bg-[#0E0E13]">
              <div className="text-xs text-[#5E5C70] dark:text-[#B9B0D8]">
                {isAr ? 'تم الرد عليها' : 'Answered'}
              </div>
              <div className="font-display mt-1 text-2xl font-extrabold text-[#4A3894] tabular-nums dark:text-[#C5B2EA]">
                {answeredTicketsCount}
              </div>
            </div>
            <div className="rounded-2xl border border-[#E4DCF7] bg-white p-4 dark:border-[#22222C] dark:bg-[#0E0E13]">
              <div className="text-xs text-[#5E5C70] dark:text-[#B9B0D8]">
                {isAr ? 'تم حلها' : 'Resolved'}
              </div>
              <div className="font-display mt-1 text-2xl font-extrabold text-emerald-600 tabular-nums">
                {resolvedTicketsCount}
              </div>
            </div>
          </div>

          {renderTicketInbox()}
        </>
      ) : !adminData ? (
        <DashboardTableSkeleton rows={5} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-[#E4DCF7] bg-white p-4 dark:border-[#22222C] dark:bg-[#0E0E13]">
              <div className="text-xs text-[#5E5C70] dark:text-[#B9B0D8]">
                {isAr ? 'متاجر قيد المراجعة' : 'Pending Stores'}
              </div>
              <div className="font-display mt-1 text-2xl font-extrabold text-amber-600 tabular-nums">
                {adminData.stats.pendingStores}
              </div>
            </div>
            <div className="rounded-2xl border border-[#E4DCF7] bg-white p-4 dark:border-[#22222C] dark:bg-[#0E0E13]">
              <div className="text-xs text-[#5E5C70] dark:text-[#B9B0D8]">
                {isAr ? 'متاجر معتمدة' : 'Approved Stores'}
              </div>
              <div className="font-display mt-1 text-2xl font-extrabold text-emerald-600 tabular-nums">
                {adminData.stats.approvedStores}
              </div>
            </div>
            <div className="rounded-2xl border border-[#E4DCF7] bg-white p-4 dark:border-[#22222C] dark:bg-[#0E0E13]">
              <div className="text-xs text-[#5E5C70] dark:text-[#B9B0D8]">
                {isAr ? 'إجمالي الطلبات' : 'Total Orders'}
              </div>
              <div className="font-display mt-1 text-2xl font-extrabold text-[#4A3894] tabular-nums dark:text-[#C5B2EA]">
                {adminData.stats.totalOrders}
              </div>
            </div>
            <div className="rounded-2xl border border-[#E4DCF7] bg-white p-4 dark:border-[#22222C] dark:bg-[#0E0E13]">
              <div className="text-xs text-[#5E5C70] dark:text-[#B9B0D8]">
                {isAr ? 'البلاغات المفتوحة' : 'Open Reports'}
              </div>
              <div className="font-display mt-1 text-2xl font-extrabold text-rose-600 tabular-nums">
                {adminData.stats.openReports}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              { id: 'stores', label: `${isAr ? 'المتاجر' : 'Stores'} (${adminData.stores.length})`, icon: StoreIcon },
              { id: 'listings', label: `${isAr ? 'العروض' : 'Listings'} (${adminData.listings.length})`, icon: Tag },
              { id: 'categories', label: `${isAr ? 'التصنيفات' : 'Categories'} (${adminData.categories.length})`, icon: Tag },
              { id: 'users', label: `${isAr ? 'المستخدمون' : 'Users'} (${adminData.users.length})`, icon: Users },
              { id: 'reports', label: `${isAr ? 'البلاغات' : 'Reports'} (${adminData.reports.length})`, icon: Flag },
              {
                id: 'support',
                label: `${isAr ? 'تذاكر الدعم' : 'Support Chat'} (${adminData.stats.openSupportTickets ?? openTicketsCount} ${isAr ? 'مفتوحة' : 'open'})`,
                icon: MessageCircle,
              },
              { id: 'logs', label: isAr ? 'سجل النظام' : 'Audit Logs', icon: Shield },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id as typeof tab)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold cursor-pointer ${
                    tab === item.id
                      ? 'bg-[#4A3894] text-white'
                      : 'border border-[#E4DCF7] bg-white text-[#5E5C70] dark:border-[#22222C] dark:bg-[#0E0E13] dark:text-[#B9B0D8]'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          {tab === 'stores' && (
            <div className="space-y-3">
              {adminData.stores.map((s) => (
                <div
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#E4DCF7] bg-white p-4 dark:border-[#22222C] dark:bg-[#0E0E13]"
                >
                  <div>
                    <div className="text-xs font-semibold uppercase text-[#9678CE]">
                      {s.approvalStatus} · {getAreaDisplayName(s.area, lang)}
                    </div>
                    <div className="font-display text-base font-bold text-[#1E1438] dark:text-white">
                      {s.name}
                    </div>
                    <div className="text-xs text-[#5E5C70] dark:text-[#B9B0D8]">{s.address}</div>
                  </div>
                  <div className="flex gap-2">
                    {s.approvalStatus !== 'approved' && (
                      <button
                        type="button"
                        onClick={() => updateStoreApproval(s.id, 'approved')}
                        className="inline-flex items-center gap-1 rounded-full bg-[#4A3894] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#3A2B78] cursor-pointer"
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span>{isAr ? 'موافقة' : 'Approve'}</span>
                      </button>
                    )}
                    {s.approvalStatus !== 'suspended' && (
                      <button
                        type="button"
                        onClick={() => updateStoreApproval(s.id, 'suspended')}
                        className="rounded-full border border-rose-200 px-3.5 py-1.5 text-xs font-semibold text-rose-600 cursor-pointer"
                      >
                        {isAr ? 'تعليق' : 'Suspend'}
                      </button>
                    )}
                    {s.approvalStatus === 'pending' && (
                      <button
                        type="button"
                        onClick={() => updateStoreApproval(s.id, 'rejected')}
                        className="rounded-full border border-[#E4DCF7] px-3.5 py-1.5 text-xs font-semibold cursor-pointer"
                      >
                        {isAr ? 'رفض' : 'Reject'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'listings' && (
            <div className="space-y-2">
              {adminData.listings.map((l) => (
                <div
                  key={l.id}
                  className="flex items-center justify-between rounded-2xl border border-[#E4DCF7] bg-white px-4 py-3 text-xs dark:border-[#22222C] dark:bg-[#0E0E13]"
                >
                  <div>
                    <strong className="text-sm">{l.productName}</strong> · {l.storeName} ·{' '}
                    <span className="font-semibold tabular-nums">{l.price} DA</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleListing(l.id)}
                    className={`rounded-full px-3 py-1 font-semibold cursor-pointer ${
                      l.isActive ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                    }`}
                  >
                    {l.isActive
                      ? isAr
                        ? 'ظاهر · اضغط للإخفاء'
                        : 'Visible · Click to Hide'
                      : isAr
                        ? 'مخفي · اضغط للإظهار'
                        : 'Hidden · Click to Restore'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {tab === 'categories' && (
            <div className="space-y-4">
              <form
                onSubmit={createCategory}
                className="grid gap-2 rounded-2xl border border-[#E4DCF7] bg-white p-4 sm:grid-cols-3 dark:border-[#22222C] dark:bg-[#0E0E13]"
              >
                <input
                  required
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  placeholder={isAr ? 'الاسم بالإنجليزية' : 'English name'}
                  className="rounded-xl border border-[#E4DCF7] px-3 py-2 text-xs dark:border-[#22222C] dark:bg-[#15151C]"
                />
                <input
                  required
                  value={catAr}
                  onChange={(e) => setCatAr(e.target.value)}
                  placeholder={isAr ? 'الاسم بالعربية' : 'Arabic name'}
                  className="rounded-xl border border-[#E4DCF7] px-3 py-2 text-xs dark:border-[#22222C] dark:bg-[#15151C]"
                />
                <button
                  type="submit"
                  className="rounded-full bg-[#4A3894] px-4 py-2 text-xs font-bold text-white hover:bg-[#3A2B78] cursor-pointer"
                >
                  {isAr ? 'إضافة تصنيف' : 'Add Category'}
                </button>
              </form>
              <div className="grid gap-2 sm:grid-cols-3">
                {adminData.categories.map((c) => (
                  <div
                    key={c.id}
                    className="rounded-2xl border border-[#E4DCF7] bg-white p-4 text-xs dark:border-[#22222C] dark:bg-[#0E0E13]"
                  >
                    <div className="font-display text-sm font-bold text-[#1E1438] dark:text-white">
                      {isAr ? c.nameAr : c.name}
                    </div>
                    <div className="text-[#5E5C70] dark:text-[#B9B0D8]">
                      {isAr ? c.name : c.nameAr}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'users' && (
            <div className="space-y-2">
              {adminData.users.map((u) => (
                <div
                  key={u.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E4DCF7] bg-white p-4 text-xs dark:border-[#22222C] dark:bg-[#0E0E13]"
                >
                  <div>
                    <div className="font-display text-sm font-bold text-[#1E1438] dark:text-white">
                      {u.fullName}
                    </div>
                    <div className="text-[#5E5C70] dark:text-[#B9B0D8]">
                      {u.email} · {u.phone}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(['customer', 'merchant', 'driver', 'moderator', 'admin'] as UserRole[]).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => toggleUserRole(u, r)}
                        className={`rounded-full px-3 py-1 font-semibold capitalize cursor-pointer ${
                          u.roles.includes(r)
                            ? 'bg-[#4A3894] text-white'
                            : 'border border-[#E4DCF7] text-[#5E5C70] dark:border-[#22222C] dark:text-[#B9B0D8]'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'reports' && (
            <div className="space-y-3">
              {adminData.reports.map((rep) => (
                <div
                  key={rep.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#E4DCF7] bg-white p-4 text-xs dark:border-[#22222C] dark:bg-[#0E0E13]"
                >
                  <div>
                    <div className="font-bold uppercase text-[#9678CE]">
                      {rep.status} · {rep.targetType}
                    </div>
                    <div className="font-display text-sm font-bold text-[#1E1438] dark:text-white">
                      {rep.targetName}
                    </div>
                    <div className="text-[#5E5C70] dark:text-[#B9B0D8]">{rep.reason}</div>
                  </div>
                  {rep.status === 'open' && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => resolveReport(rep.id, 'resolved')}
                        className="rounded-full bg-[#4A3894] px-3.5 py-1.5 font-bold text-white cursor-pointer"
                      >
                        {isAr ? 'معالجة' : 'Resolve'}
                      </button>
                      <button
                        type="button"
                        onClick={() => resolveReport(rep.id, 'dismissed')}
                        className="rounded-full border border-[#E4DCF7] px-3.5 py-1.5 font-semibold cursor-pointer"
                      >
                        {isAr ? 'تجاهل' : 'Dismiss'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {tab === 'support' && renderTicketInbox()}

          {tab === 'logs' && (
            <div className="space-y-2">
              {adminData.auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="rounded-2xl border border-[#E4DCF7] bg-white px-4 py-3 text-xs dark:border-[#22222C] dark:bg-[#0E0E13]"
                >
                  <span className="font-bold text-[#4A3894] dark:text-[#E794C9]">{log.action}</span> ·{' '}
                  <strong>{log.actorName}</strong> — {log.details}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
};
